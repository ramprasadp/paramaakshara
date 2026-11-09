// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { transliterate } from "../../src/conversion/itrans";
import { fromDevanagari, type Script } from "../../src/conversion/script";
import {
  applyOutputChange,
  fromSource,
  kind,
  outputText,
  sourceText,
  type Context,
  type Segment,
} from "../../src/model/segments";
import { switchScript } from "../../src/model/switch";

function context(script: () => Script): Context {
  let n = 0;
  return {
    convert: (s) => fromDevanagari(transliterate(s).text, script()).text,
    newId: () => `s${++n}`,
  };
}

/** Types text at the end of the output pane. */
function append(segs: Segment[], text: string, ctx: Context): Segment[] {
  const end = outputText(segs).length;
  return applyOutputChange(segs, { from: end, to: end, insert: text }, ctx);
}

describe("switchScript (§4.6)", () => {
  it("regenerates linked lines, converts edited and output-only lines, keeps the source", () => {
    let script: Script = "devanagari";
    const ctx = context(() => script);
    let segs = fromSource("agnimiiLE\nbhUmi'M", ctx);
    segs = append(segs, " ॥", ctx); // line 2 detached
    segs = append(segs, "\nॐ ताँ", ctx); // output-only
    expect(segs.map((s) => s.output)).toEqual([
      "अग्निमीळे",
      "भूमिं॑ ॥",
      "ॐ ताँ",
    ]);

    script = "tamil";
    const r = switchScript(segs, "tamil", ctx);
    expect(r.segments.map((s) => [kind(s), s.output])).toEqual([
      ["linked", "அக்³நிமீளே"],
      ["detached", "பூ⁴மிம்॑ ॥"],
      ["output-only", "ௐ தாँ"],
    ]);
    expect(r.issues).toEqual([
      { line: 3, messages: ["ँ has no Tamil equivalent; kept"] },
    ]);
    expect(sourceText(r.segments)).toBe(sourceText(segs));
    expect(r.segments.map((s) => s.id)).toEqual(segs.map((s) => s.id));
  });

  it("switching back restores the original text when nothing was approximate", () => {
    let script: Script = "devanagari";
    const ctx = context(() => script);
    let segs = fromSource("a_gnimii'LE", ctx);
    segs = applyOutputChange(
      segs,
      { from: 0, to: 0, insert: "पुरु॑षः\n" },
      ctx,
    );
    script = "kannada";
    const kannada = switchScript(segs, "kannada", ctx).segments;
    script = "devanagari";
    const back = switchScript(kannada, "devanagari", ctx).segments;
    expect(back.map((s) => [kind(s), s.output])).toEqual(
      segs.map((s) => [kind(s), s.output]),
    );
  });
});
