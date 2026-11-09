// SPDX-License-Identifier: GPL-3.0-or-later

// Undo per pane (TECH_SPEC §4.7), simulated without an editor: each edit
// records a patch; undo applies its inverse with applyPanePatch.

import { describe, expect, it } from "vitest";
import { diff, invert, type Patch } from "../../src/model/patch";
import {
  applyOutputChange,
  applySourceChange,
  fromSource,
  kind,
  outputText,
  sourceText,
  type Change,
  type Context,
  type Segment,
} from "../../src/model/segments";
import { applyPanePatch, type Pane } from "../../src/model/undo";

function context(): Context {
  let n = 0;
  return { convert: (s) => s.toUpperCase(), newId: () => `s${++n}` };
}

/** A document with one undo stack per pane, as the editor keeps them. */
class Doc {
  stacks: Record<Pane, Patch[]> = { source: [], output: [] };
  constructor(
    public segs: Segment[],
    readonly ctx: Context,
  ) {}
  edit(pane: Pane, ch: Change) {
    const next = (pane === "source" ? applySourceChange : applyOutputChange)(
      this.segs,
      ch,
      this.ctx,
    );
    this.stacks[pane].push(diff(this.segs, next)!);
    this.segs = next;
  }
  undo(pane: Pane) {
    const next = applyPanePatch(
      this.segs,
      invert(this.stacks[pane].pop()!),
      pane,
      this.ctx,
    );
    expect(next).not.toBeNull();
    this.segs = next!;
  }
  view() {
    return this.segs.map((s) => [kind(s), s.source, s.output]);
  }
}

describe("undo per pane", () => {
  it("undoing a whole-line deletion in the output restores the line and its source", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa\nbb\ncc", ctx), ctx);
    d.edit("output", { from: 3, to: 6, insert: "" });
    expect(sourceText(d.segs)).toBe("aa\ncc");
    d.undo("output");
    expect(d.view()).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "bb", "BB"],
      ["linked", "cc", "CC"],
    ]);
  });

  it("undoing a merge in the output splits the line and its sources again", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa\nbb", ctx), ctx);
    d.edit("output", { from: 2, to: 3, insert: "" });
    expect(d.view()).toEqual([["detached", "aa\nbb", "AABB"]]);
    d.undo("output");
    expect(d.view()).toEqual([
      ["linked", "aa", "AA"],
      ["linked", "bb", "BB"],
    ]);
  });

  it("undo in the output keeps a later source edit to the same line", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa\nbb", ctx), ctx);
    d.edit("output", { from: 5, to: 5, insert: "!" }); // BB! (detached)
    d.edit("source", { from: 5, to: 5, insert: "x" }); // bbx (stale)
    expect(d.view()[1]).toEqual(["stale", "bbx", "BB!"]);
    d.undo("output");
    // Output restored to BB, source bbx kept: still detached and stale.
    expect(d.view()[1]).toEqual(["stale", "bbx", "BB"]);
    expect(sourceText(d.segs)).toBe("aa\nbbx");
  });

  it("undo in the source keeps a later manual output edit", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa\nbb", ctx), ctx);
    d.edit("source", { from: 5, to: 5, insert: "x" }); // bbx -> BBX
    d.edit("output", { from: 6, to: 6, insert: "!" }); // BBX! (detached)
    d.undo("source");
    expect(d.view()[1]).toEqual(["stale", "bb", "BBX!"]);
    expect(outputText(d.segs)).toBe("AA\nBBX!");
  });

  it("undo in the source of an edit to a linked line regenerates its output", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa", ctx), ctx);
    d.edit("source", { from: 2, to: 2, insert: "b" });
    d.undo("source");
    expect(d.view()).toEqual([["linked", "aa", "AA"]]);
  });

  it("undoing a source line deletion of a detached line restores its source", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa\nbb", ctx), ctx);
    d.edit("output", { from: 5, to: 5, insert: "!" });
    d.edit("source", { from: 2, to: 5, insert: "" }); // delete "\nbb"
    expect(d.view()[1]).toEqual(["output-only", null, "BB!"]);
    d.undo("source");
    expect(d.view()[1]).toEqual(["detached", "bb", "BB!"]);
  });

  it("undoing the typing of a line keeps its manual output as output-only", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa", ctx), ctx);
    d.edit("source", { from: 2, to: 2, insert: "\nbb" });
    d.edit("output", { from: 5, to: 5, insert: "!" }); // BB! (detached)
    d.undo("source");
    expect(d.view()).toEqual([
      ["linked", "aa", "AA"],
      ["output-only", null, "BB!"],
    ]);
    expect(sourceText(d.segs)).toBe("aa");
  });

  it("undo re-links when the restored output matches", () => {
    const ctx = context();
    const d = new Doc(fromSource("aa", ctx), ctx);
    d.edit("output", { from: 2, to: 2, insert: "!" });
    d.undo("output");
    expect(d.view()).toEqual([["linked", "aa", "AA"]]);
  });
});
