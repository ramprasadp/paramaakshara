// SPDX-License-Identifier: GPL-3.0-or-later

// The segment model (TECH_SPEC §4): pairs each output line with the
// ITRANS source that produced it, and applies the rules for edits in
// either pane. Pure functions over immutable arrays; no editor or DOM.

export interface Segment {
  readonly id: string;
  /** One or more source lines; null for an output-only segment. */
  readonly source: string | null;
  /** Exactly one line of output (never contains "\n"). */
  readonly output: string;
  /** Output is generated from source. */
  readonly linked: boolean;
  /** Detached, and the source changed since the output was edited. */
  readonly stale: boolean;
}

/** A replacement of [from, to) in a pane's text by insert. */
export interface Change {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface Context {
  /** Converts one source line to one output line. */
  readonly convert: (source: string) => string;
  readonly newId: () => string;
}

export type Kind = "linked" | "detached" | "stale" | "output-only";

export function kind(s: Segment): Kind {
  if (s.source === null) return "output-only";
  if (s.linked) return "linked";
  return s.stale ? "stale" : "detached";
}

/** Text of the input pane: the sources of all segments that have one. */
export function sourceText(segs: readonly Segment[]): string {
  return segs.flatMap((s) => (s.source === null ? [] : [s.source])).join("\n");
}

/** Text of the output pane. */
export function outputText(segs: readonly Segment[]): string {
  return segs.map((s) => s.output).join("\n");
}

/** A document whose every source line is a linked segment. */
export function fromSource(text: string, ctx: Context): Segment[] {
  if (text === "") return [];
  return text.split("\n").map((line) => linkedSegment(line, ctx));
}

/** A document of output-only segments, e.g. an opened .txt file. */
export function fromOutput(text: string, ctx: Context): Segment[] {
  return text.split("\n").map((line) => outputOnly(line, ctx));
}

function linkedSegment(
  source: string,
  ctx: Context,
  id = ctx.newId(),
): Segment {
  return {
    id,
    source,
    output: ctx.convert(source),
    linked: true,
    stale: false,
  };
}

function outputOnly(output: string, ctx: Context): Segment {
  return { id: ctx.newId(), source: null, output, linked: false, stale: false };
}

// --- Layout -------------------------------------------------------------

interface Span {
  /** Index into the segment array. */
  readonly index: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Offsets of each segment's text within a pane. Segments for which text
 * returns null do not appear in the pane.
 */
function layout(
  segs: readonly Segment[],
  text: (s: Segment) => string | null,
): Span[] {
  const spans: Span[] = [];
  let pos = 0;
  segs.forEach((s, index) => {
    const t = text(s);
    if (t === null) return;
    spans.push({ index, start: pos, end: pos + t.length });
    pos += t.length + 1; // the "\n" between segments
  });
  return spans;
}

/** The span containing pos. A position at a line end belongs to that line. */
function locate(spans: readonly Span[], pos: number): number {
  for (let i = 0; i < spans.length; i++) {
    if (pos <= spans[i]!.end) return i;
  }
  throw new RangeError(`position ${pos} is outside the text`);
}

/**
 * The parts of an edit common to both panes: the segments at either end
 * (a, b), the text they keep before and after the change (p, q), and the
 * lines of the inserted text. The edited region becomes
 * p + ins[0], ins[1], ..., ins[n] + q.
 */
function analyse(
  segs: readonly Segment[],
  spans: readonly Span[],
  ch: Change,
  text: (s: Segment) => string,
) {
  const a = locate(spans, ch.from);
  const b = locate(spans, ch.to);
  const sa = spans[a]!;
  const sb = spans[b]!;
  const segA = segs[sa.index]!;
  const segB = segs[sb.index]!;
  const p = text(segA).slice(0, ch.from - sa.start);
  const q = text(segB).slice(ch.to - sb.start);
  const ins = ch.insert.split("\n");
  const removed =
    a === b ? text(segA).slice(ch.from - sa.start, ch.to - sa.start) : "\n";
  // A structural edit adds or removes a line break.
  const structural = ch.insert.includes("\n") || removed.includes("\n");
  // Which end segments keep any of their own text. When neither does and
  // the change ends at the very start of segment B, B lost nothing and
  // keeps the last line (e.g. deleting a line above an empty line).
  let keepA = p !== "";
  let keepB = q !== "";
  if (a !== b && !keepA && !keepB && ch.to === sb.start) keepB = true;
  // For an edit inside one segment: the segment stays with its leading
  // text if it keeps any, otherwise with its trailing text.
  const ownerIsFirst = p !== "" || q === "";
  return {
    a,
    b,
    segA,
    segB,
    p,
    q,
    ins,
    structural,
    keepA,
    keepB,
    ownerIsFirst,
  };
}

/** Re-links detached segments whose output equals the converted source. */
function relink(s: Segment, ctx: Context): Segment {
  if (
    s.source !== null &&
    !s.linked &&
    !s.source.includes("\n") &&
    ctx.convert(s.source) === s.output
  ) {
    return { ...s, linked: true, stale: false };
  }
  return s;
}

/** Index of the first segment after i that is not output-only. */
function afterOutputOnlyRun(segs: readonly Segment[], i: number): number {
  let j = i + 1;
  while (j < segs.length && segs[j]!.source === null) j++;
  return j;
}

// --- Source edits (§4.2) ------------------------------------------------

/** Applies an edit made in the input pane. */
export function applySourceChange(
  segs: readonly Segment[],
  ch: Change,
  ctx: Context,
): Segment[] {
  const spans = layout(segs, (s) => s.source);
  if (spans.length === 0) {
    // Empty input pane: typed lines are appended after any output-only lines.
    return ch.insert === ""
      ? [...segs]
      : [...segs, ...fromSource(ch.insert, ctx)];
  }
  const e = analyse(segs, spans, ch, (s) => s.source!);
  const iA = spans[e.a]!.index;
  const iB = spans[e.b]!.index;
  const fresh = (lines: readonly string[]) =>
    lines.flatMap((l) => l.split("\n")).map((l) => linkedSegment(l, ctx));
  const n = e.ins.length - 1;
  const first = e.p + e.ins[0];
  const last = e.ins[n] + e.q;

  // A source segment that loses all its text: a linked one disappears,
  // a detached one keeps its manual output as output-only (§2.3).
  const drop = (s: Segment): Segment[] =>
    s.source === null
      ? [s]
      : s.linked
        ? []
        : [{ ...s, source: null, linked: false, stale: false }];

  const setSource = (s: Segment, source: string): Segment => {
    if (s.linked) return { ...s, source, output: ctx.convert(source) };
    return relink({ ...s, source, stale: s.stale || source !== s.source }, ctx);
  };

  // A merged segment (several source lines, always detached) absorbs any
  // edit inside it, except new lines typed at its very end.
  const merged = e.segA.source!.includes("\n");
  const atMergedEnd =
    merged && e.a === e.b && e.q === "" && ch.insert.startsWith("\n");

  if (e.a === e.b && (!e.structural || (merged && !atMergedEnd))) {
    // Edit inside one segment.
    return replace(segs, iA, iA + 1, [
      setSource(e.segA, e.p + ch.insert + e.q),
    ]);
  }

  if (e.a === e.b) {
    // Enter, or a multi-line paste, inside one segment.
    let before: Segment[];
    let kept: Segment;
    let after: Segment[];
    if (e.ownerIsFirst) {
      [before, kept, after] = [
        [],
        setSource(e.segA, first),
        fresh([...e.ins.slice(1, n), last]),
      ];
    } else {
      [before, kept, after] = [
        fresh(e.ins.slice(0, n)),
        setSource(e.segA, last),
        [],
      ];
    }
    // New lines go after any output-only segments that follow (§4.2).
    const j = afterOutputOnlyRun(segs, iA);
    return [
      ...segs.slice(0, iA),
      ...before,
      kept,
      ...segs.slice(iA + 1, j),
      ...after,
      ...segs.slice(j),
    ];
  }

  // The edit spans several segments. Source segments strictly between A
  // and B lose all their text; output-only segments there are untouched.
  const middle = segs.slice(iA + 1, iB).flatMap(drop);
  let region: Segment[];
  if (e.keepA && e.keepB && n === 0) {
    // Line break deleted: the two lines are joined (§4.2).
    const source = first + e.q;
    region = [
      e.segA.linked && e.segB.linked
        ? linkedSegment(source, ctx, e.segA.id)
        : relink(
            {
              id: e.segA.id,
              source,
              output: e.segA.output + " " + e.segB.output,
              linked: false,
              stale: true,
            },
            ctx,
          ),
      ...middle,
    ];
  } else if (e.keepA && e.keepB) {
    region = [
      setSource(e.segA, first),
      ...middle,
      ...fresh(e.ins.slice(1, n)),
      setSource(e.segB, last),
    ];
  } else if (e.keepA) {
    region = [
      setSource(e.segA, first),
      ...middle,
      ...drop(e.segB),
      ...fresh([...e.ins.slice(1, n), last].slice(n === 0 ? 1 : 0)),
    ];
  } else if (e.keepB) {
    region = [
      ...drop(e.segA),
      ...middle,
      ...fresh(n === 0 ? [] : [first, ...e.ins.slice(1, n)]),
      setSource(e.segB, last),
    ];
  } else {
    region = [
      ...drop(e.segA),
      ...middle,
      ...drop(e.segB),
      ...fresh(n === 0 ? [first + e.q] : [first, ...e.ins.slice(1, n), last]),
    ];
  }
  return replace(segs, iA, iB + 1, region);
}

// --- Output edits (§4.3) ------------------------------------------------

/** Applies an edit made in the output pane. */
export function applyOutputChange(
  segs: readonly Segment[],
  ch: Change,
  ctx: Context,
): Segment[] {
  if (segs.length === 0) {
    return ch.insert === "" ? [] : fromOutput(ch.insert, ctx);
  }
  const spans = layout(segs, (s) => s.output);
  const e = analyse(segs, spans, ch, (s) => s.output);
  const iA = spans[e.a]!.index;
  const iB = spans[e.b]!.index;
  const fresh = (lines: readonly string[]) =>
    lines.map((l) => outputOnly(l, ctx));
  const n = e.ins.length - 1;
  const first = e.p + e.ins[0];
  const last = e.ins[n] + e.q;

  // Editing a linked segment's output detaches it (§4.3).
  const setOutput = (s: Segment, output: string): Segment => {
    if (output === s.output) return s;
    return relink(
      { ...s, output, linked: false, stale: s.linked ? false : s.stale },
      ctx,
    );
  };

  if (e.a === e.b && !e.structural) {
    return replace(segs, iA, iA + 1, [
      setOutput(e.segA, e.p + ch.insert + e.q),
    ]);
  }

  if (e.a === e.b) {
    // Enter, or a multi-line paste, inside one line.
    const region = e.ownerIsFirst
      ? [setOutput(e.segA, first), ...fresh([...e.ins.slice(1, n), last])]
      : [...fresh(e.ins.slice(0, n)), setOutput(e.segA, last)];
    return replace(segs, iA, iA + 1, region);
  }

  // The edit spans several lines. Segments whose output line is removed
  // entirely are removed with their source (§4.3).
  let region: Segment[];
  if (e.keepA && e.keepB && n === 0) {
    // Line break deleted: one detached segment keeping both sources.
    const sources = [e.segA.source, e.segB.source].filter(
      (s): s is string => s !== null,
    );
    const source = sources.length === 0 ? null : sources.join("\n");
    region = [
      relink(
        {
          id: e.segA.id,
          source,
          output: first + e.q,
          linked: false,
          stale: false,
        },
        ctx,
      ),
    ];
  } else if (e.keepA && e.keepB) {
    region = [
      setOutput(e.segA, first),
      ...fresh(e.ins.slice(1, n)),
      setOutput(e.segB, last),
    ];
  } else if (e.keepA) {
    region = [
      setOutput(e.segA, first),
      ...fresh(n === 0 ? [] : [...e.ins.slice(1, n), last]),
    ];
  } else if (e.keepB) {
    region = [
      ...fresh(n === 0 ? [] : [first, ...e.ins.slice(1, n)]),
      setOutput(e.segB, last),
    ];
  } else {
    region = fresh(
      n === 0 ? [first + e.q] : [first, ...e.ins.slice(1, n), last],
    );
  }
  return replace(segs, iA, iB + 1, region);
}

// --- Regeneration (§4.5) ------------------------------------------------

/** Number of segments among ids whose manual output regeneration would replace. */
export function manualCount(
  segs: readonly Segment[],
  ids?: ReadonlySet<string>,
): number {
  return segs.filter(
    (s) => s.source !== null && !s.linked && (!ids || ids.has(s.id)),
  ).length;
}

/**
 * Replaces the output of the given detached segments (all of them when ids
 * is omitted) with the converted source, splitting multi-line sources into
 * one linked segment per line. Output-only segments are not affected.
 */
export function regenerate(
  segs: readonly Segment[],
  ctx: Context,
  ids?: ReadonlySet<string>,
): Segment[] {
  return segs.flatMap((s) => {
    if (s.source === null || s.linked || (ids && !ids.has(s.id))) return [s];
    return s.source
      .split("\n")
      .map((line, i) => linkedSegment(line, ctx, i === 0 ? s.id : ctx.newId()));
  });
}

function replace(
  segs: readonly Segment[],
  start: number,
  end: number,
  region: readonly Segment[],
): Segment[] {
  return [...segs.slice(0, start), ...region, ...segs.slice(end)];
}
