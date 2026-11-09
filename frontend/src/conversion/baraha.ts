// SPDX-License-Identifier: GPL-3.0-or-later

// Baraha source → Paramaakshara ITRANS, for pasting and importing text
// typed in Baraha. The mapping is the legend in
// testdata/vedic/baraha/README.md, derived from Baraha source/Unicode
// pairs; the corpus test checks it against both samples.

import type { EoLength } from "./itrans";

const MAP: [string, string][] = [
  ["~M", ".N"],
  ["~g", "~N"],
  ["~j", "~n"],
  ["RU", "R^I"],
  ["Ru", "R^i"],
  ["Sh", "Sh"],
  ["sh", "sh"],
  ["S", "sh"],
  ["Ch", "Ch"],
  ["ch", "ch"],
  ["C", "Ch"],
  ["c", "ch"],
  ["B", "bh"],
  ["G", "gh"],
  ["K", "kh"],
  ["P", "ph"],
  ["J", "jh"],
  ["ou", "au"],
  ["E", "e"],
  ["O", "o"],
  ["q", "_"],
  ["#", "'"],
  ["$", "'''"],
  [":", "H"],
  ["&", ".a"],
];

// In the "dravidian" e/o reading Baraha's e/E and o/O keep their meaning
// (short/long); in the "sanskrit" reading they are the same vowel.
const SANSKRIT_ONLY = new Set(["E", "O"]);

/** Rewrites Baraha source text in ITRANS. Other characters are kept. */
export function barahaToItrans(
  text: string,
  eo: EoLength = "sanskrit",
): string {
  const map =
    eo === "dravidian" ? MAP.filter(([from]) => !SANSKRIT_ONLY.has(from)) : MAP;
  let out = "";
  let i = 0;
  outer: while (i < text.length) {
    // "oum" as a whole word is OM (ॐ).
    if (
      text.startsWith("oum", i) &&
      !isLetter(text[i - 1]) &&
      !isLetter(text[i + 3])
    ) {
      out += "OM";
      i += 3;
      continue;
    }
    for (const [from, to] of map) {
      if (text.startsWith(from, i)) {
        out += to;
        i += from.length;
        continue outer;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z]/.test(ch);
}

/**
 * Whether pasted text is probably Baraha rather than ITRANS: it uses
 * Baraha's accent keys # or $, or q right after a vowel (in ITRANS, q is
 * the rare letter क़).
 */
export function looksLikeBaraha(text: string): boolean {
  return /[#$]/.test(text) || /[aeiouAEIOU]q/.test(text);
}
