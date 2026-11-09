// SPDX-License-Identifier: GPL-3.0-or-later

// Connects the segment model to the two editor panes (TECH_SPEC §4).
//
// Each user edit in a pane becomes a segment patch, attached to the same
// transaction as an effect. CodeMirror's history records the patch with
// the text change and replays its inverse on undo, so undo restores the
// segments exactly (§4.7). The other pane is then brought in line with a
// transaction that is not added to its history.

import {
  Annotation,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
  type ChangeSet,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  drawSelection,
  gutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  invertedEffects,
} from "@codemirror/commands";

import { apply, diff, invert, type Patch } from "../model/patch";
import { applyPanePatch, type Pane } from "../model/undo";
import {
  applyOutputChange,
  applySourceChange,
  kind,
  manualCount,
  outputText,
  regenerate,
  sourceText,
  type Context,
  type Kind,
  type Segment,
} from "../model/segments";

export type { Pane };

export interface Counts {
  segments: number;
  detached: number;
  stale: number;
  outputOnly: number;
}

/** Marks transactions that only mirror the model into a pane. */
const mirror = Annotation.define<boolean>();
const patchEffect = StateEffect.define<Patch>();
const setMarkers = StateEffect.define<RangeSet<GutterMarker>>();

const markersField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMarkers)) return e.value;
    return value.map(tr.changes);
  },
});

class Marker extends GutterMarker {
  constructor(
    readonly text: string,
    readonly title: string,
    readonly cls: string,
  ) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof Marker && other.text === this.text;
  }
  override toDOM(): Node {
    const span = document.createElement("span");
    span.className = `seg-marker ${this.cls}`;
    span.textContent = this.text;
    span.title = this.title;
    return span;
  }
}

// Gutter markers from §4.4.
const markers: Partial<Record<Kind, Marker>> = {
  detached: new Marker("✎", "Output edited manually", "seg-detached"),
  stale: new Marker(
    "✎!",
    "Source changed after the manual edit; Regenerate is available",
    "seg-stale",
  ),
  "output-only": new Marker(
    "+",
    "Output only; no ITRANS source",
    "seg-output-only",
  ),
};

export interface Options {
  sourceParent: HTMLElement;
  outputParent: HTMLElement;
  context: Context;
  segments?: Segment[];
  /** Called after every change to the segments. */
  onChange?: (counts: Counts) => void;
  /** Asked before regeneration replaces manual output. */
  confirm?: (message: string) => boolean;
}

export class EditorDocument {
  segments: Segment[];
  readonly source: EditorView;
  readonly output: EditorView;
  private readonly ctx: Context;
  private readonly onChange: (counts: Counts) => void;
  private readonly confirm: (message: string) => boolean;
  private lastFocused: Pane = "source";
  private refreshQueued = false;

  constructor(opts: Options) {
    this.ctx = opts.context;
    this.segments = opts.segments ?? [];
    this.onChange = opts.onChange ?? (() => {});
    this.confirm = opts.confirm ?? (() => true);
    this.source = new EditorView({
      parent: opts.sourceParent,
      state: EditorState.create({
        doc: sourceText(this.segments),
        extensions: this.extensions("source"),
      }),
    });
    this.output = new EditorView({
      parent: opts.outputParent,
      state: EditorState.create({
        doc: outputText(this.segments),
        extensions: this.extensions("output"),
      }),
    });
    this.refresh();
  }

  /** Replaces the whole document, e.g. after opening a file. Clears undo history. */
  load(segments: Segment[]): void {
    this.segments = segments;
    this.source.setState(
      EditorState.create({
        doc: sourceText(segments),
        extensions: this.extensions("source"),
      }),
    );
    this.output.setState(
      EditorState.create({
        doc: outputText(segments),
        extensions: this.extensions("output"),
      }),
    );
    this.refresh();
  }

  private view(pane: Pane): EditorView {
    return pane === "source" ? this.source : this.output;
  }

  private extensions(pane: Pane): Extension[] {
    return [
      lineNumbers(),
      markersField,
      gutter({
        class: "seg-gutter",
        markers: (v) => v.state.field(markersField),
      }),
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      invertedEffects.of((tr) =>
        tr.effects
          .filter((e) => e.is(patchEffect))
          .map((e) => patchEffect.of(invert(e.value as Patch))),
      ),
      EditorState.transactionExtender.of((tr) => this.extend(pane, tr)),
      EditorView.updateListener.of((u) => this.update(pane, u)),
      EditorView.domEventHandlers({
        focus: () => {
          this.lastFocused = pane;
        },
      }),
    ];
  }

  /** Applies a pane's text changes to segs, last change first. */
  private applyChanges(
    pane: Pane,
    segs: Segment[],
    changes: ChangeSet,
  ): Segment[] {
    const list: { from: number; to: number; insert: string }[] = [];
    changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      list.push({ from: fromA, to: toA, insert: inserted.toString() });
    });
    const step = pane === "source" ? applySourceChange : applyOutputChange;
    return list.reverse().reduce((s, ch) => step(s, ch, this.ctx), segs);
  }

  /** Attaches the segment patch for a user edit to its transaction. */
  private extend(pane: Pane, tr: Transaction): TransactionSpec | null {
    if (
      !tr.docChanged ||
      tr.annotation(mirror) ||
      tr.effects.some((e) => e.is(patchEffect))
    )
      return null;
    const p = diff(
      this.segments,
      this.applyChanges(pane, this.segments, tr.changes),
    );
    return p ? { effects: patchEffect.of(p) } : null;
  }

  private update(pane: Pane, u: ViewUpdate): void {
    let changed = false;
    for (const tr of u.transactions) {
      if (tr.annotation(mirror)) continue;
      const patches = tr.effects.filter((e) => e.is(patchEffect));
      // Undo and redo restore only this pane's side of segments that the
      // other pane has changed since (§4.7).
      const replay = tr.isUserEvent("undo") || tr.isUserEvent("redo");
      for (const e of patches) {
        const p = e.value as Patch;
        const next = replay
          ? applyPanePatch(this.segments, p, pane, this.ctx)
          : apply(this.segments, p);
        // A patch that no longer fits (undo after conflicting edits in
        // the other pane) falls back to the plain text edit.
        this.segments =
          next ?? this.applyChanges(pane, this.segments, tr.changes);
        changed = true;
      }
    }
    if (changed) this.queueRefresh();
  }

  // Panes cannot be updated while one of them is updating, so mirroring
  // and markers run straight after the current update.
  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh();
    });
  }

  /** Mirrors the model into both panes and updates markers and counts. */
  private refresh(): void {
    for (const pane of ["source", "output"] as const) {
      const view = this.view(pane);
      const want =
        pane === "source"
          ? sourceText(this.segments)
          : outputText(this.segments);
      view.dispatch({
        changes: textChange(view.state.doc.toString(), want),
        effects: setMarkers.of(this.markers(pane, want)),
        annotations: [mirror.of(true), Transaction.addToHistory.of(false)],
      });
    }
    this.onChange(this.counts());
  }

  private markers(pane: Pane, text: string): RangeSet<GutterMarker> {
    const b = new RangeSetBuilder<GutterMarker>();
    let pos = 0;
    for (const s of this.segments) {
      const lines =
        pane === "output"
          ? [s.output]
          : s.source === null
            ? []
            : s.source.split("\n");
      const m = markers[kind(s)];
      for (const line of lines) {
        if (m) b.add(pos, pos, m);
        pos += line.length + 1;
      }
    }
    if (pos - 1 !== text.length && this.segments.length > 0) {
      console.warn(`paramaakshara: ${pane} markers out of step with the text`);
    }
    return b.finish();
  }

  counts(): Counts {
    const c: Counts = {
      segments: this.segments.length,
      detached: 0,
      stale: 0,
      outputOnly: 0,
    };
    for (const s of this.segments) {
      const k = kind(s);
      if (k === "detached") c.detached++;
      else if (k === "stale") c.stale++;
      else if (k === "output-only") c.outputOnly++;
    }
    return c;
  }

  /** The segment on the cursor line of the last focused pane. */
  private segmentAtCursor(): Segment | undefined {
    const view = this.view(this.lastFocused);
    const line =
      view.state.doc.lineAt(view.state.selection.main.head).number - 1;
    if (this.lastFocused === "output") return this.segments[line];
    let n = 0;
    for (const s of this.segments) {
      if (s.source === null) continue;
      n += s.source.split("\n").length;
      if (line < n) return s;
    }
    return undefined;
  }

  /** Regenerate line (§4.5). Returns false if cancelled or nothing to do. */
  regenerateLine(): boolean {
    const s = this.segmentAtCursor();
    if (!s || s.source === null || s.linked) return false;
    return this.regenerate(new Set([s.id]));
  }

  /** Regenerate all (§4.5). */
  regenerateAll(): boolean {
    return this.regenerate();
  }

  private regenerate(ids?: Set<string>): boolean {
    const n = manualCount(this.segments, ids);
    if (n === 0) return false;
    const lines =
      n === 1 ? "1 manually edited line" : `${n} manually edited lines`;
    if (
      !this.confirm(
        `Replace ${lines} with the transliteration of the ITRANS source?`,
      )
    )
      return false;
    const next = regenerate(this.segments, this.ctx, ids);
    const p = diff(this.segments, next);
    if (!p) return false;
    // One undoable step in the output history (§4.5).
    this.output.dispatch({
      changes: textChange(this.output.state.doc.toString(), outputText(next)),
      effects: patchEffect.of(p),
      userEvent: "regenerate",
    });
    return true;
  }

  /** Inserts text at the output cursor, e.g. from the symbol palette. */
  insertInOutput(text: string): void {
    this.output.dispatch(this.output.state.replaceSelection(text), {
      userEvent: "input.symbol",
    });
    this.output.focus();
  }
}

/** The single replacement turning a into b (common prefix and suffix kept). */
export function textChange(
  a: string,
  b: string,
): { from: number; to: number; insert: string } {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p > 0 && isHighSurrogate(a.charCodeAt(p - 1))) p--; // never split a surrogate pair
  let s = 0;
  while (
    s < a.length - p &&
    s < b.length - p &&
    a[a.length - 1 - s] === b[b.length - 1 - s]
  )
    s++;
  if (s > 0 && isHighSurrogate(a.charCodeAt(a.length - 1 - s))) s--;
  return { from: p, to: a.length - s, insert: b.slice(p, b.length - s) };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
