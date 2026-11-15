// SPDX-License-Identifier: GPL-3.0-or-later

// The document model (TECH_SPEC §4.1, ADR 0006): output line n is the
// conversion of input line n.

import { describe, expect, it } from "vitest";
import { transliterate } from "../../src/conversion/itrans";
import { itxPath } from "../../src/files";
import { outputOf } from "../../src/model/lines";

const upper = (line: string) => line.toUpperCase();

describe("outputOf", () => {
  it("converts each line on its own and keeps the line count", () => {
    expect(outputOf("a\n\nbc", upper)).toBe("A\n\nBC");
    expect(outputOf("", upper)).toBe("");
    expect(outputOf("x\n", upper)).toBe("X\n");
  });

  // The palette inserts a symbol without an ITRANS spelling as the
  // character itself (§6.4); it must reach the output unchanged, after
  // the letter it was typed after. ka → क per ITRANS 5.3.
  it("passes Vedic signs typed after ITRANS through to the output", () => {
    const convert = (l: string) => transliterate(l).text;
    expect(outputOf("ka᳐", convert)).toBe("क᳐");
    expect(outputOf("ka\nka॓", convert)).toBe("क\nक॓");
  });
});

describe("itxPath", () => {
  it("saves documents as .itx (§10.3)", () => {
    expect(itxPath("purusha")).toBe("purusha.itx");
    expect(itxPath("rv/purusha.itx")).toBe("rv/purusha.itx");
    expect(itxPath("purusha.txt")).toBe("purusha.itx");
    expect(itxPath("purusha.itrans.txt")).toBe("purusha.itx");
    expect(itxPath("purusha.ITX")).toBe("purusha.itx");
    expect(itxPath("")).toBeNull();
  });
});
