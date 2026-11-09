// SPDX-License-Identifier: GPL-3.0-or-later

// Unicode → ITRANS (TECH_SPEC §6.9). The references are Unicode texts
// produced by Baraha (testdata/): every line, after the documented Clean
// up fixes, must come back byte for byte when its ITRANS is converted.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanup } from "../../src/conversion/cleanup";
import { transliterate } from "../../src/conversion/itrans";
import { unicodeToItrans } from "../../src/conversion/unicode";
import { looksLikeUnicode } from "../../src/ui/unicode";

const read = (name: string) =>
  readFileSync(new URL(`../../../testdata/${name}`, import.meta.url), "utf8")
    .replace(/\n$/, "")
    .split("\n");

describe.each([
  "vedic/baraha/purusha-sukta",
  "vedic/baraha/viraja-homa",
  "baraha/aditya-hrudaya",
])("%s", (name) => {
  const lines = read(`${name}.unicode.txt`).map((l) => cleanup(l).text);
  it.each(lines.map((line, i) => [i + 1, line] as const))(
    "line %i converts back exactly",
    (_, line) => {
      const r = unicodeToItrans(line);
      expect(r.issues).toEqual([]);
      expect(r.exact).toBe(true);
      expect(transliterate(r.itrans).text).toBe(line);
    },
  );
});

describe("unicodeToItrans", () => {
  it("writes Ṛgveda 10.90.1 as typed (Baraha sample, rewritten in ITRANS)", () => {
    // The pair in tests/e2e/baraha.spec.ts.
    expect(
      unicodeToItrans(
        "स भूमिं॑ वि॒श्वतो॑ वृ॒त्वात्य॑तिष्ठद्दशाङ्गु॒लम् ॥ १०.०९०.०१",
      ),
    ).toEqual({
      itrans:
        "sa bhUmi'M vi_shvatO' vR^i_tvAtya'tiShThaddashA~Ngu_lam || 10.090.01",
      issues: [],
      exact: true,
    });
  });

  it.each([
    ["कइ", "ka{}i"], // kai is कै
    ["।।", "|{}|"], // || is ॥
    ["क्ह", "k{}ha"], // kh is ख
    ["क्अ", "k.ha"], // ka is क
    ["क॑॑", "ka'{}'"], // two svaritas are not a double svarita
    ["क᳚", "ka'''"],
    ["क्ष ज्ञ", "kSha j~na"],
    ["क\u093C", "qa"],
    ["ꣳ ꣴ", "(gm) (gg)"],
    ["क्\u200D", "k\u200D"], // ZWJ is kept
  ])("%s → %s, exactly", (text, itrans) => {
    const r = unicodeToItrans(text);
    expect(r.itrans).toBe(itrans);
    expect(r.exact).toBe(true);
    expect(transliterate(r.itrans).text).toBe(text);
  });

  it("brings Kannada and Tamil to ITRANS", () => {
    expect(unicodeToItrans("ಅಗ್ನಿಮೀಳೇ").itrans).toBe("agnimILE");
    expect(unicodeToItrans("ப⁴க³வதே").itrans).toBe("bhagavatE");
  });

  it("keeps Tamil ன, which has no ITRANS spelling", () => {
    // ன reads as ऩ U+0929 (§7.3), not न.
    const r = unicodeToItrans("ப⁴க³வான்");
    expect(r.itrans).toBe("bhagavA\u0929\u094D");
    expect(r.exact).toBe(true);
    expect(r.issues).toEqual(["\u0929 U+0929: no ITRANS spelling; kept as is"]);
  });

  it("flags lines that would change: Baraha accent order, precomposed nukta", () => {
    expect(unicodeToItrans("भूमि॑ं")).toEqual({
      itrans: "bhUmi'M",
      issues: [],
      exact: false,
    });
    expect(unicodeToItrans("\u0958").exact).toBe(false);
  });

  it("keeps characters without an ITRANS spelling and notes them", () => {
    const r = unicodeToItrans("क\u0953");
    expect(r.itrans).toBe("ka\u0953");
    expect(r.exact).toBe(true);
    expect(r.issues).toEqual(["\u0953 U+0953: no ITRANS spelling; kept as is"]);
  });

  it("notes Latin letters, which would be read as ITRANS", () => {
    const r = unicodeToItrans("राम x");
    expect(r.issues).toEqual([
      "Latin letters in the line will be read as ITRANS",
    ]);
  });

  it("keeps Devanagari digits when ASCII digits are configured", () => {
    const r = unicodeToItrans("१०", { devanagariDigits: false });
    expect(r).toEqual({ itrans: "१०", issues: [], exact: true });
  });
});

describe("looksLikeUnicode", () => {
  it.each([
    ["अग्निमीळे पुरोहितं", true],
    ["ಅಗ್ನಿಮೀಳೇ", true],
    ["agnimILe purohitaM", false],
    ["sa bhUmi'M ॥ 1", false],
  ])("%s → %s", (text, expected) => {
    expect(looksLikeUnicode(text)).toBe(expected);
  });
});
