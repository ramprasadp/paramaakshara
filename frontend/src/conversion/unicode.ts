// SPDX-License-Identifier: GPL-3.0-or-later

// Unicode → ITRANS, for pasting text that already exists in Devanagari,
// Kannada or Tamil (TECH_SPEC §6.9). The inverse of itrans.ts: each table
// entry is the spelling that converter turns back into the same
// character (docs/itrans-mappings.md, "Unicode → ITRANS"). Kannada and
// Tamil are first brought to Devanagari (§7). Characters with no ITRANS
// spelling are kept as they are; the ITRANS converter passes them
// through. One line is converted at a time.

import { tokenAt, transliterate } from "./itrans";
import { toDevanagari } from "./script";

export interface Options {
  /** Write Devanagari digits as 0–9 (default true, as in itrans.ts). */
  devanagariDigits?: boolean;
}

export interface ImportResult {
  /** The line in ITRANS. */
  itrans: string;
  /** Things the reader should know, e.g. Latin letters in the line. */
  issues: string[];
  /**
   * Whether converting the ITRANS gives back the pasted line exactly (in
   * Devanagari). When false, the line will change on conversion, for
   * example when accents follow an anusvara (ADR 0002).
   */
  exact: boolean;
}

const INDEPENDENT: Record<string, string> = {
  अ: "a",
  आ: "A",
  इ: "i",
  ई: "I",
  उ: "u",
  ऊ: "U",
  ऋ: "R^i",
  ॠ: "R^I",
  ऌ: "L^i",
  ॡ: "L^I",
  "\u090E": "e", // short e
  ए: "E",
  ऐ: "ai",
  "\u0912": "o", // short o
  ओ: "O",
  औ: "au",
};

const VOWEL_SIGNS: Record<string, string> = {
  "\u093E": "A",
  "\u093F": "i",
  "\u0940": "I",
  "\u0941": "u",
  "\u0942": "U",
  "\u0943": "R^i",
  "\u0944": "R^I",
  "\u0962": "L^i",
  "\u0963": "L^I",
  "\u0946": "e", // short e
  "\u0947": "E",
  "\u0948": "ai",
  "\u094A": "o", // short o
  "\u094B": "O",
  "\u094C": "au",
};

const CONSONANTS: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "~N",
  च: "ch",
  छ: "Ch",
  ज: "j",
  झ: "jh",
  ञ: "~n",
  ट: "T",
  ठ: "Th",
  ड: "D",
  ढ: "Dh",
  ण: "N",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "Sh",
  स: "s",
  ह: "h",
  ळ: "L",
};

// Nukta letters, written by itrans.ts as letter + U+093C.
const NUKTA = "\u093C";
const NUKTA_CONSONANTS: Record<string, string> = {
  क: "q",
  ख: "K",
  ग: "G",
  ज: "z",
  फ: "f",
  ड: ".D",
  ढ: ".Dh",
};
// The precomposed forms (U+0958–U+095E) read the same; converting them
// back gives letter + U+093C, so such lines are not exact.
const PRECOMPOSED_NUKTA: Record<string, string> = {
  "\u0958": "q",
  "\u0959": "K",
  "\u095A": "G",
  "\u095B": "z",
  "\u095C": ".D",
  "\u095D": ".Dh",
  "\u095E": "f",
};

const OTHER: Record<string, string> = {
  "\u0902": "M", // anusvara
  "\u0903": "H", // visarga
  "\u0901": ".N", // chandrabindu
  ऽ: ".a",
  ॐ: "OM",
  "।": "|",
  "॥": "||",
  "\uA8F3": "(gm)",
  "\uA8F4": "(gg)",
  "\u0951": "'", // svarita
  "\u0952": "_", // anudātta
  "\u1CDA": "'''", // double svarita
};

const VIRAMA = "\u094D";
const ACCENTS = new Set(["'", "_", "'''"]);
const SIGNS = new Set(["M", "H", ".N"]);

/** Converts one line of Devanagari, Kannada or Tamil to ITRANS. */
export function unicodeToItrans(
  line: string,
  opts: Options = {},
): ImportResult {
  const digits = opts.devanagariDigits ?? true;
  const dev = toDevanagari(line);
  const issues = dev.issues.map((i) => i.message);
  const chars = Array.from(dev.text);
  // The line as tokens; each is an ITRANS token or a kept character.
  const tokens: string[] = [];
  // A consonant was written and its vowel is not known yet.
  let consonant = false;
  const unknown = new Set<string>();
  let latin = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (consonant) {
      consonant = false;
      if (ch in VOWEL_SIGNS) {
        tokens.push(VOWEL_SIGNS[ch]!);
        continue;
      }
      if (ch === VIRAMA) {
        // k + a would read as क; .h ends the consonant before a vowel.
        if ((chars[i + 1] ?? "") in INDEPENDENT) tokens.push(".h");
        continue;
      }
      tokens.push("a");
    }
    if (ch in CONSONANTS) {
      if (chars[i + 1] === NUKTA && ch in NUKTA_CONSONANTS) {
        tokens.push(NUKTA_CONSONANTS[ch]!);
        i++;
      } else {
        tokens.push(CONSONANTS[ch]!);
      }
      consonant = true;
    } else if (ch in PRECOMPOSED_NUKTA) {
      tokens.push(PRECOMPOSED_NUKTA[ch]!);
      consonant = true;
    } else if (ch in INDEPENDENT) {
      tokens.push(INDEPENDENT[ch]!);
    } else if (ch in OTHER) {
      tokens.push(OTHER[ch]!);
    } else if (digits && ch >= "\u0966" && ch <= "\u096F") {
      tokens.push(String(ch.charCodeAt(0) - 0x0966));
    } else {
      // Kept characters converted back as they are. Digits, and vowel
      // signs or virama after a kept letter, are not worth a note.
      const c = ch.codePointAt(0)!;
      const indic =
        (c >= 0x0900 && c <= 0x097f) || (c >= 0x1cd0 && c <= 0x1cff);
      const spelled =
        ch in VOWEL_SIGNS ||
        ch === VIRAMA ||
        ch === NUKTA ||
        (c >= 0x0966 && c <= 0x096f);
      if (indic && !spelled) unknown.add(ch);
      if (/[A-Za-z]/.test(ch)) latin = true;
      tokens.push(ch);
    }
  }
  if (consonant) tokens.push("a");

  if (unknown.size > 0)
    issues.push(
      `${[...unknown].map((c) => `${c} U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(", ")}: no ITRANS spelling; kept as is`,
    );
  if (latin) issues.push("Latin letters in the line will be read as ITRANS");

  // Accents are typed before an anusvara, visarga or chandrabindu
  // (bhUmi'M); itrans.ts writes the sign first either way (ADR 0002).
  for (let i = tokens.length - 1; i > 0; i--)
    if (ACCENTS.has(tokens[i]!) && SIGNS.has(tokens[i - 1]!))
      [tokens[i - 1], tokens[i]] = [tokens[i]!, tokens[i - 1]!];

  const convert = (itrans: string) =>
    transliterate(itrans, { devanagariDigits: digits }).text;
  const itrans = join(tokens, convert);
  return { itrans, issues, exact: convert(itrans) === dev.text };
}

/**
 * Joins tokens, putting {} between two that would otherwise read as
 * something else: ka{}i is कइ (kai is कै), |{}| is ।। (|| is ॥). No {} is
 * written where the longer reading converts the same (kSh is क्ष).
 */
function join(tokens: string[], convert: (itrans: string) => string): string {
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    parts.push(tok);
    const next = tokens[i + 1];
    if (next === undefined) continue;
    // Tokens are at most five characters long.
    const merged = ACCENTS.has(tok)
      ? next[0] === tok[0] // ' then ' would read as ''
      : tokenAt(tok + tokens.slice(i + 1, i + 6).join(""), 0) !==
        tokenAt(tok, 0);
    if (merged) parts.push("{}");
  }
  let text = parts.join("");
  if (text.includes("{}")) {
    const expected = convert(text);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] !== "{}") continue;
      parts[i] = "";
      const shorter = parts.join("");
      if (convert(shorter) === expected) text = shorter;
      else parts[i] = "{}";
    }
  }
  return text;
}
