// SPDX-License-Identifier: GPL-3.0-or-later

// The converter against independent references (TECH_SPEC §13.1).
//
// Baraha samples: Baraha's own engine produced the Unicode from the
// Baraha source. The source is rewritten in our ITRANS notation, converted,
// and compared with Baraha's Unicode after the documented Clean up text
// fixes (accent order, U+0953, short e/o, colon visarga).
//
// Known differences, by design:
// - Baraha drops repeated and trailing spaces; spaces are compared
//   collapsed.
// - An accent after ")" in the Taittirīya "(gg)" notation does not follow
//   a vowel, so the converter reports it and leaves "_" as typed
//   (§5.3); Baraha attached the mark to ")". How to encode this is open
//   (dev plan, M7).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanup } from "../../src/conversion/cleanup";
import { transliterate } from "../../src/conversion/itrans";
import { barahaToItrans } from "../support/baraha";

const read = (name: string) =>
  readFileSync(
    new URL(`../../../testdata/vedic/baraha/${name}`, import.meta.url),
    "utf8",
  )
    .replace(/\n$/, "")
    .split("\n");

const spaces = (s: string) => s.replace(/[  ]+/g, " ").trim();

const ACCENT_AFTER_PAREN = /\)([॒॑᳚])/g;

describe.each(["purusha-sukta", "viraja-homa"])("Baraha sample %s", (name) => {
  const source = read(`${name}.baraha.txt`);
  const unicode = read(`${name}.unicode.txt`);

  it("has matching line counts", () => {
    expect(source.length).toBe(unicode.length);
  });

  it.each(source.map((line, i) => [i + 1, line] as const))(
    "line %i",
    (n, line) => {
      const itrans = barahaToItrans(line);
      const result = transliterate(itrans);
      let expected = cleanup(unicode[n - 1]!).text;

      // The "(gg)" accent: expect one report per occurrence and "_" as typed.
      const parenAccents = [...expected.matchAll(ACCENT_AFTER_PAREN)].length;
      expected = expected.replace(ACCENT_AFTER_PAREN, (_m, mark: string) =>
        mark === "॒" ? ")_" : ")'",
      );
      expect(result.issues.map((i) => i.message)).toEqual(
        Array(parenAccents).fill('accent "_" must follow a vowel'),
      );

      expect(spaces(result.text)).toBe(spaces(expected));
    },
  );
});
