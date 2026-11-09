// SPDX-License-Identifier: GPL-3.0-or-later

// Baraha stotra samples (testdata/baraha/): Baraha source rewritten in
// ITRANS must convert to Baraha's own Devanagari, and every line of the
// source-only sample must convert without reported problems.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { barahaToItrans } from "../../src/conversion/baraha";
import { cleanup } from "../../src/conversion/cleanup";
import { transliterate } from "../../src/conversion/itrans";

const read = (name: string) =>
  readFileSync(
    new URL(`../../../testdata/baraha/${name}`, import.meta.url),
    "utf8",
  )
    .replace(/\n$/, "")
    .split("\n");

const spaces = (s: string) => s.replace(/[  ]+/g, " ").trim();

// Lines with a typing slip in the source (see the README).
const SOURCE_TYPOS: Record<number, string> = { 79: '"R" is not ITRANS' };

describe("aditya-hrudaya", () => {
  const source = read("aditya-hrudaya.baraha.txt");
  const unicode = read("aditya-hrudaya.unicode.txt");

  it("has matching line counts", () => {
    expect(source.length).toBe(unicode.length);
  });

  it.each(source.map((line, i) => [i + 1, line] as const))(
    "line %i",
    (n, line) => {
      const result = transliterate(barahaToItrans(line));
      if (n in SOURCE_TYPOS) {
        expect(result.issues.map((i) => i.message)).toEqual([SOURCE_TYPOS[n]]);
        return;
      }
      expect(result.issues).toEqual([]);
      expect(spaces(cleanup(result.text, ["sanskrit-e-o"]).text)).toBe(
        spaces(cleanup(unicode[n - 1]!).text),
      );
    },
  );
});

describe("narasimha-vijendra", () => {
  it.each(
    read("narasimha-vijendra.baraha.txt").map(
      (line, i) => [i + 1, line] as const,
    ),
  )("line %i converts without problems", (_n, line) => {
    expect(transliterate(barahaToItrans(line)).issues).toEqual([]);
  });
});
