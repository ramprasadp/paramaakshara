// SPDX-License-Identifier: GPL-3.0-or-later

// Tests for the segment model. Each describe block follows a table in
// TECH_SPEC §4.2 / §4.3; each test is one row. The converter uppercases,
// so source ("abc") and output ("ABC") are easy to tell apart.

import { describe, expect, it } from "vitest";
import {
  applyOutputChange,
  applySourceChange,
  fromOutput,
  fromSource,
  kind,
  manualCount,
  outputText,
  regenerate,
  sourceText,
  type Change,
  type Context,
  type Segment,
} from "../../src/model/segments";

function context(): Context {
  let n = 0;
  return { convert: (s) => s.toUpperCase(), newId: () => `s${++n}` };
}

/** Compact view of a document: [kind, source, output] per segment. */
function view(segs: readonly Segment[]) {
  return segs.map((s) => [kind(s), s.source, s.output]);
}

/** Change replacing `remove` at its first occurrence after `after`. */
function at(text: string, needle: string, insert: string, remove = ""): Change {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`${needle} not in ${text}`);
  const from = i + needle.length;
  return { from, to: from + remove.length, insert };
}

/** Document with a detached second line: sources a/b/c, output B edited to "B!". */
function withDetached(ctx: Context) {
  const segs = fromSource("aa\nbb\ncc", ctx);
  return applyOutputChange(segs, at(outputText(segs), "BB", "!"), ctx);
}

describe("§4.2 source edits", () => {
  it("edit inside a linked segment regenerates its output", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const next = applySourceChange(segs, at(sourceText(segs), "b", "x"), ctx);
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "bxb", "BXB"],
    ]);
  });

  it("edit inside a detached segment keeps the output and marks it stale", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applySourceChange(segs, at(sourceText(segs), "bb", "x"), ctx);
    expect(view(next)[1]).toEqual(["stale", "bbx", "BB!"]);
  });

  it("a new line is inserted after the following output-only segments", () => {
    const ctx = context();
    let segs = fromSource("aa\nbb", ctx);
    // Output-only line typed after AA.
    segs = applyOutputChange(segs, at(outputText(segs), "AA", "\nnote"), ctx);
    expect(view(segs)[1]).toEqual(["output-only", null, "note"]);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "aa", "\ndd"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["output-only", null, "note"],
      ["linked", "dd", "DD"],
      ["linked", "bb", "BB"],
    ]);
  });

  it("splitting a linked line gives two linked segments", () => {
    const ctx = context();
    const segs = fromSource("abcd", ctx);
    const next = applySourceChange(segs, at(sourceText(segs), "ab", "\n"), ctx);
    expect(view(next)).toEqual([
      ["linked", "ab", "AB"],
      ["linked", "cd", "CD"],
    ]);
    expect(next[0]!.id).toBe(segs[0]!.id);
  });

  it("splitting a detached line keeps the manual output on the first part", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applySourceChange(segs, at(sourceText(segs), "b", "\n"), ctx);
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["stale", "b", "BB!"],
      ["linked", "b", "B"],
      ["linked", "cc", "CC"],
    ]);
  });

  it("joining two linked lines gives one linked segment", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "aa", "", "\n"),
      ctx,
    );
    expect(view(next)).toEqual([["linked", "aabb", "AABB"]]);
  });

  it("joining a linked and a detached line joins the outputs with a space", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "aa", "", "\n"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["stale", "aabb", "AA BB!"],
      ["linked", "cc", "CC"],
    ]);
  });

  it("deleting a linked source line removes the segment", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb\ncc", ctx);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "aa\n", "", "bb\n"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "cc", "CC"],
    ]);
  });

  it("deleting a detached source line keeps its output as output-only", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "aa\n", "", "bb\n"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["output-only", null, "BB!"],
      ["linked", "cc", "CC"],
    ]);
  });

  it("pasting several lines is treated as typing them", () => {
    const ctx = context();
    const segs = fromSource("abcd", ctx);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "ab", "x\ny\nz"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["linked", "abx", "ABX"],
      ["linked", "y", "Y"],
      ["linked", "zcd", "ZCD"],
    ]);
  });

  it("Enter at the start of a line keeps the segment with its text", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applySourceChange(
      segs,
      at(sourceText(segs), "aa\n", "\n"),
      ctx,
    );
    expect(view(next).slice(1, 3)).toEqual([
      ["linked", "", ""],
      ["detached", "bb", "BB!"],
    ]);
  });

  it("typing into an empty input pane appends linked segments", () => {
    const ctx = context();
    const segs = fromOutput("heading", ctx);
    const next = applySourceChange(
      segs,
      { from: 0, to: 0, insert: "aa\nbb" },
      ctx,
    );
    expect(view(next)).toEqual([
      ["output-only", null, "heading"],
      ["linked", "aa", "AA"],
      ["linked", "bb", "BB"],
    ]);
  });
});

describe("§4.3 output edits", () => {
  it("edit inside a linked segment detaches it", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const next = applyOutputChange(segs, at(outputText(segs), "B", "x"), ctx);
    expect(view(next)[1]).toEqual(["detached", "bb", "BxB"]);
  });

  it("edit inside a detached segment updates the output, not the source", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applyOutputChange(segs, at(outputText(segs), "BB!", "?"), ctx);
    expect(view(next)[1]).toEqual(["detached", "bb", "BB!?"]);
    expect(sourceText(next)).toBe(sourceText(segs));
  });

  it("Enter at the end of a line adds an empty output-only line after it", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const next = applyOutputChange(segs, at(outputText(segs), "AA", "\n"), ctx);
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["output-only", null, ""],
      ["linked", "bb", "BB"],
    ]);
  });

  it("Enter at the start of a line adds an output-only line before it", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const next = applyOutputChange(
      segs,
      at(outputText(segs), "AA\n", "\n"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["output-only", null, ""],
      ["linked", "bb", "BB"],
    ]);
  });

  it("Enter mid-line detaches the first part and makes the rest output-only", () => {
    const ctx = context();
    const segs = fromSource("abcd", ctx);
    const next = applyOutputChange(segs, at(outputText(segs), "AB", "\n"), ctx);
    expect(view(next)).toEqual([
      ["detached", "abcd", "AB"],
      ["output-only", null, "CD"],
    ]);
  });

  it("deleting a line break merges into one detached segment keeping both sources", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb\ncc", ctx);
    const next = applyOutputChange(
      segs,
      at(outputText(segs), "AA", "", "\n"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["detached", "aa\nbb", "AABB"],
      ["linked", "cc", "CC"],
    ]);
    expect(sourceText(next)).toBe("aa\nbb\ncc");
  });

  it("deleting a whole output line removes the segment and its source", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb\ncc", ctx);
    const next = applyOutputChange(
      segs,
      at(outputText(segs), "AA\n", "", "BB\n"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "cc", "CC"],
    ]);
    expect(sourceText(next)).toBe("aa\ncc");
  });

  it("a multi-line paste detaches the line at the cursor and adds output-only lines", () => {
    const ctx = context();
    const segs = fromSource("abcd", ctx);
    const next = applyOutputChange(
      segs,
      at(outputText(segs), "AB", "x\ny\nz"),
      ctx,
    );
    expect(view(next)).toEqual([
      ["detached", "abcd", "ABx"],
      ["output-only", null, "y"],
      ["output-only", null, "zCD"],
    ]);
  });

  it("deleting a line above an empty line keeps the empty line", () => {
    const ctx = context();
    const segs = fromSource("aa\n\ncc", ctx);
    const next = applyOutputChange(segs, { from: 0, to: 3, insert: "" }, ctx);
    expect(view(next)).toEqual([
      ["linked", "", ""],
      ["linked", "cc", "CC"],
    ]);
  });
});

describe("re-linking", () => {
  it("undoing a manual edit re-links the segment", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const edited = applyOutputChange(
      segs,
      at(outputText(segs), "BB", "!"),
      ctx,
    );
    expect(kind(edited[1]!)).toBe("detached");
    const undone = applyOutputChange(
      edited,
      at(outputText(edited), "BB", "", "!"),
      ctx,
    );
    expect(view(undone)[1]).toEqual(["linked", "bb", "BB"]);
  });

  it("a source edit that matches the manual output re-links it", () => {
    const ctx = context();
    const segs = withDetached(ctx);
    const next = applySourceChange(segs, at(sourceText(segs), "bb", "!"), ctx);
    expect(view(next)[1]).toEqual(["linked", "bb!", "BB!"]);
  });
});

describe("§4.5 regeneration", () => {
  it("regenerates one segment and splits a merged one per source line", () => {
    const ctx = context();
    let segs = fromSource("aa\nbb\ncc", ctx);
    segs = applyOutputChange(segs, at(outputText(segs), "AA", "", "\n"), ctx);
    segs = applyOutputChange(segs, at(outputText(segs), "CC", "!"), ctx);
    expect(manualCount(segs)).toBe(2);
    const one = regenerate(segs, ctx, new Set([segs[0]!.id]));
    expect(view(one)).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "bb", "BB"],
      ["detached", "cc", "CC!"],
    ]);
    expect(one[0]!.id).toBe(segs[0]!.id);
  });

  it("regenerate all leaves output-only segments alone", () => {
    const ctx = context();
    let segs = withDetached(ctx);
    segs = applyOutputChange(segs, at(outputText(segs), "CC", "\nnote"), ctx);
    const next = regenerate(segs, ctx);
    expect(view(next)).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "bb", "BB"],
      ["linked", "cc", "CC"],
      ["output-only", null, "note"],
    ]);
    expect(manualCount(next)).toBe(0);
  });
});

// --- Randomised invariants ----------------------------------------------

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomChange(text: string, r: () => number): Change {
  const a = Math.floor(r() * (text.length + 1));
  const b = Math.floor(r() * (text.length + 1));
  const pieces = ["", "x", "\n", "y\nz", "\n\n", "abc", "q\n"];
  return {
    from: Math.min(a, b),
    to: Math.max(a, b),
    insert: pieces[Math.floor(r() * pieces.length)]!,
  };
}

function splice(text: string, ch: Change): string {
  return text.slice(0, ch.from) + ch.insert + text.slice(ch.to);
}

function isSubsequence(
  sub: readonly string[],
  seq: readonly string[],
): boolean {
  if (sub.length === 1 && sub[0] === "") return true; // no source lines left
  let i = 0;
  for (const x of seq) if (i < sub.length && sub[i] === x) i++;
  return i === sub.length;
}

function checkInvariants(segs: readonly Segment[], ctx: Context) {
  const ids = new Set<string>();
  for (const s of segs) {
    expect(s.output).not.toContain("\n");
    expect(ids.has(s.id)).toBe(false);
    ids.add(s.id);
    if (s.linked) {
      expect(s.source).not.toBeNull();
      expect(s.source).not.toContain("\n");
      expect(s.output).toBe(ctx.convert(s.source!));
      expect(s.stale).toBe(false);
    }
    if (s.source === null) expect(s.linked || s.stale).toBe(false);
  }
}

describe("randomised edits", () => {
  it("keep both panes' text equal to a plain string edit and the invariants intact", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const ctx = context();
      let segs = fromSource("aa\nbb\ncc\ndd", ctx);
      for (let step = 0; step < 40; step++) {
        if (r() < 0.5) {
          const before = sourceText(segs);
          const ch = randomChange(before, r);
          const outputs = new Map(
            segs.filter((s) => !s.linked).map((s) => [s.id, s.output]),
          );
          const outputOnly = new Map(
            segs.filter((s) => s.source === null).map((s) => [s.id, s.output]),
          );
          segs = applySourceChange(segs, ch, ctx);
          expect(sourceText(segs)).toBe(splice(before, ch));
          // Manual output is never lost by a source edit (§2.3).
          const after = new Set(
            segs
              .map((s) => s.output)
              .join("\n")
              .split("\n"),
          );
          for (const out of outputs.values()) {
            const kept =
              segs.some((s) => s.output.includes(out)) || after.has(out);
            expect(kept, `seed ${seed} step ${step}: lost "${out}"`).toBe(true);
          }
          // Output-only lines are never touched by a source edit.
          for (const s of segs) {
            if (s.source === null && outputOnly.has(s.id))
              expect(s.output).toBe(outputOnly.get(s.id));
          }
        } else {
          const before = outputText(segs);
          const sourceLines = sourceText(segs).split("\n");
          const ch = randomChange(before, r);
          segs = applyOutputChange(segs, ch, ctx);
          expect(outputText(segs)).toBe(splice(before, ch));
          // An output edit only removes whole source lines (§4.3).
          expect(
            isSubsequence(sourceText(segs).split("\n"), sourceLines),
            `seed ${seed} step ${step}`,
          ).toBe(true);
        }
        checkInvariants(segs, ctx);
      }
    }
  });
});
