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
// - Baraha's "(ग्ग्)" is converted to ꣴ by Clean up text, matching our
//   ITRANS "(gg)".

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanup } from "../../src/conversion/cleanup";
import { transliterate } from "../../src/conversion/itrans";
import { barahaToItrans } from "../../src/conversion/baraha";

const read = (name: string) =>
  readFileSync(
    new URL(`../../../testdata/vedic/baraha/${name}`, import.meta.url),
    "utf8",
  )
    .replace(/\n$/, "")
    .split("\n");

const spaces = (s: string) => s.replace(/[  ]+/g, " ").trim();

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
      const expected = cleanup(unicode[n - 1]!).text;
      expect(result.issues, itrans).toEqual([]);
      // purusha-sukta was typed with Baraha's Devanagari e/o (lowercase =
      // long), viraja-homa with E/O; both compare after Sanskrit e/o cleanup.
      expect(spaces(cleanup(result.text, ["sanskrit-e-o"]).text)).toBe(
        spaces(expected),
      );
    },
  );
});
