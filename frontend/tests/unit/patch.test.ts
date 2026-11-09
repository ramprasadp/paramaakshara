// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { apply, diff, invert } from "../../src/model/patch";
import {
  applyOutputChange,
  applySourceChange,
  fromSource,
  outputText,
  sourceText,
  type Context,
} from "../../src/model/segments";

function context(): Context {
  let n = 0;
  return { convert: (s) => s.toUpperCase(), newId: () => `s${++n}` };
}

describe("patch", () => {
  it("round-trips an edit: apply then apply the inverse", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb\ncc", ctx);
    // Delete the whole output line BB: removes the segment and its source.
    const next = applyOutputChange(segs, { from: 3, to: 6, insert: "" }, ctx);
    const p = diff(segs, next)!;
    expect(apply(segs, p)).toEqual(next);
    const undone = apply(next, invert(p))!;
    expect(undone).toEqual(segs);
    expect(sourceText(undone)).toBe("aa\nbb\ncc");
  });

  it("is null when nothing changed", () => {
    const segs = fromSource("aa", context());
    expect(diff(segs, segs)).toBeNull();
  });

  it("still applies after an unrelated edit elsewhere", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb\ncc", ctx);
    const edited = applyOutputChange(
      segs,
      { from: 5, to: 5, insert: "!" },
      ctx,
    ); // BB!
    const p = diff(segs, edited)!;
    // Later, an unrelated source edit on the last line.
    const later = applySourceChange(
      edited,
      { from: 8, to: 8, insert: "x" },
      ctx,
    );
    const undone = apply(later, invert(p))!;
    expect(outputText(undone)).toBe("AA\nBB\nCCX");
  });

  it("handles pure insertions at the start and after a segment", () => {
    const ctx = context();
    const segs = fromSource("aa", ctx);
    const atStart = applyOutputChange(
      segs,
      { from: 0, to: 0, insert: "x\n" },
      ctx,
    );
    const p = diff(segs, atStart)!;
    expect(apply(atStart, invert(p))).toEqual(segs);
    const atEnd = applyOutputChange(
      segs,
      { from: 2, to: 2, insert: "\ny" },
      ctx,
    );
    const q = diff(segs, atEnd)!;
    expect(q.prevId).toBe(segs[0]!.id);
    expect(apply(atEnd, invert(q))).toEqual(segs);
  });

  it("refuses when the run has been removed by a later edit", () => {
    const ctx = context();
    const segs = fromSource("aa\nbb", ctx);
    const edited = applyOutputChange(
      segs,
      { from: 4, to: 4, insert: "!" },
      ctx,
    );
    const p = diff(segs, edited)!;
    const removed = applyOutputChange(
      edited,
      { from: 2, to: 6, insert: "" },
      ctx,
    ); // delete "\nBB!"
    expect(apply(removed, invert(p))).toBeNull();
  });
});
