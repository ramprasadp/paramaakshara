// SPDX-License-Identifier: GPL-3.0-or-later

// ITRANS → Devanagari (TECH_SPEC §5). ITRANS 5.3 with the project's Vedic
// accent sequences (§5.3) and a few Baraha spellings (marked "Baraha").
// Deviations from ITRANS 5.3 are listed in docs/itrans-mappings.md. One
// line is converted at a time; there is no state between calls.

export const CONVERTER_VERSION = "itrans-5.3+pak/4";

export interface Issue {
  /** Offset and length in the source line (UTF-16 units). */
  offset: number;
  length: number;
  message: string;
}

export interface Result {
  text: string;
  issues: Issue[];
}

/**
 * How e and o are read. "sanskrit": e and E are the same (long) vowel, as
 * are o and O. "dravidian": e and o are the short vowels of Kannada and
 * Tamil (Devanagari ऎ ॆ ऒ ॊ), E and O the long ones (as in Baraha).
 */
export type EoLength = "sanskrit" | "dravidian";

export interface Options {
  /** Convert 0–9 to Devanagari digits (default true). */
  devanagariDigits?: boolean;
  /** Reading of e/E and o/O (default "sanskrit"). */
  eo?: EoLength;
}

// Independent vowel and vowel sign ("" for the inherent a).
const VOWELS: Record<string, [string, string]> = {
  a: ["अ", ""],
  aa: ["आ", "ा"],
  A: ["आ", "ा"],
  i: ["इ", "ि"],
  ii: ["ई", "ी"],
  I: ["ई", "ी"],
  u: ["उ", "ु"],
  uu: ["ऊ", "ू"],
  U: ["ऊ", "ू"],
  RRi: ["ऋ", "ृ"],
  "R^i": ["ऋ", "ृ"],
  RRI: ["ॠ", "ॄ"],
  "R^I": ["ॠ", "ॄ"],
  Ru: ["ऋ", "ृ"], // Baraha
  RU: ["ॠ", "ॄ"], // Baraha
  LLi: ["ऌ", "ॢ"],
  "L^i": ["ऌ", "ॢ"],
  LLI: ["ॡ", "ॣ"],
  "L^I": ["ॡ", "ॣ"],
  e: ["ए", "े"],
  E: ["ए", "े"],
  ai: ["ऐ", "ै"],
  o: ["ओ", "ो"],
  O: ["ओ", "ो"],
  au: ["औ", "ौ"],
};

// Short e and o, for e/o in "dravidian" reading.
const SHORT_E_O: Record<string, [string, string]> = {
  e: ["\u090E", "\u0946"], // ऎ ॆ
  o: ["\u0912", "\u094A"], // ऒ ॊ
};

// Consonants and conjuncts written as one ITRANS token.
const CONSONANTS: Record<string, string> = {
  k: "क",
  kh: "ख",
  g: "ग",
  gh: "घ",
  "~N": "ङ",
  "~g": "ङ", // Baraha
  ch: "च",
  Ch: "छ",
  chh: "छ",
  j: "ज",
  jh: "झ",
  "~n": "ञ",
  "~j": "ञ", // Baraha
  JN: "ञ",
  T: "ट",
  Th: "ठ",
  D: "ड",
  Dh: "ढ",
  N: "ण",
  t: "त",
  th: "थ",
  d: "द",
  dh: "ध",
  n: "न",
  p: "प",
  ph: "फ",
  b: "ब",
  bh: "भ",
  m: "म",
  y: "य",
  r: "र",
  l: "ल",
  v: "व",
  w: "व",
  sh: "श",
  Sh: "ष",
  shh: "ष",
  s: "स",
  h: "ह",
  L: "ळ",
  ld: "ळ",
  x: "क्ष",
  kSh: "क्ष",
  GY: "ज्ञ",
  "j~n": "ज्ञ",
  dny: "ज्ञ",
  // Nukta letters (ITRANS 5.3), not used in Sanskrit.
  q: "क़",
  K: "ख़",
  G: "ग़",
  z: "ज़",
  f: "फ़",
  ".D": "ड़",
  ".Dh": "ढ़",
};

// Signs that follow a vowel.
const SIGNS: Record<string, string> = {
  M: "ं",
  ".n": "ं",
  H: "ः",
  ".N": "ँ",
  "~M": "ँ", // Baraha
};

const OTHER: Record<string, string> = {
  ".a": "ऽ",
  OM: "ॐ",
  "||": "॥",
  "|": "।",
};

// Taittirīya anusvara before sibilants ("gum"), written (gm)/(gg) as in
// Baraha. They carry their own accent, so no reordering applies.
const TAITTIRIYA_ANUSVARA: Record<string, string> = {
  "(gm)": "\uA8F3", // DEVANAGARI SIGN CANDRABINDU VIRAMA
  "(gg)": "\uA8F4", // DEVANAGARI SIGN DOUBLE CANDRABINDU VIRAMA
};

const VIRAMA = "्";
const ACCENT_MARKS = "\u0951\u0952\u1CDA";

const TOKENS = [
  ...Object.keys(VOWELS),
  ...Object.keys(CONSONANTS),
  ...Object.keys(SIGNS),
  ...Object.keys(OTHER),
  ...Object.keys(TAITTIRIYA_ANUSVARA),
  ".h",
  "{}",
].sort((a, b) => b.length - a.length);

/** The longest token at position i, or null. */
function match(line: string, i: number): string | null {
  for (const t of TOKENS) if (line.startsWith(t, i)) return t;
  return null;
}

/** Converts one line of ITRANS to Devanagari. Never throws. */
export function transliterate(line: string, opts: Options = {}): Result {
  const digits = opts.devanagariDigits ?? true;
  const dravidian = opts.eo === "dravidian";
  const issues: Issue[] = [];
  let out = "";
  // A consonant still waiting for its vowel (or for a virama).
  let pending = false;
  // The last syllable has a vowel, so an accent may follow.
  let vowel = false;

  const closeConsonant = () => {
    if (pending) out += VIRAMA;
    pending = false;
  };

  let i = 0;
  while (i < line.length) {
    // Accents: runs of "'" (length 1 or 3) and single "_" (§5.3).
    const ch = line[i]!;
    if (ch === "'" || ch === "_") {
      let n = 1;
      while (line[i + n] === ch) n++;
      const run = line.slice(i, i + n);
      const mark =
        ch === "_"
          ? n === 1
            ? "\u0952"
            : null
          : n === 1
            ? "\u0951"
            : n === 3
              ? "\u1CDA"
              : null;
      if (mark && vowel && !pending) {
        out += mark;
      } else {
        closeConsonant();
        out += run;
        issues.push({
          offset: i,
          length: n,
          message: !mark
            ? `"${run}" is not an accent; use ' (svarita), ''' (double svarita) or _ (anudātta)`
            : `accent "${run}" must follow a vowel`,
        });
        vowel = false;
      }
      i += n;
      continue;
    }

    const tok = match(line, i);
    if (tok === null) {
      closeConsonant();
      vowel = false;
      if (ch >= "0" && ch <= "9") {
        out += digits
          ? String.fromCharCode(0x0966 + (ch.charCodeAt(0) - 48))
          : ch;
      } else if (/[A-Za-z^~]/.test(ch)) {
        out += ch;
        issues.push({ offset: i, length: 1, message: `"${ch}" is not ITRANS` });
      } else {
        out += ch; // spaces, punctuation and non-ASCII text pass through
      }
      i += ch.length;
      continue;
    }
    i += tok.length;

    if (tok === "OM" && pending) {
      // kOM is k + O + M, not k + ॐ.
      out += VOWELS.O![1] + SIGNS.M;
      pending = false;
      vowel = true;
    } else if (tok in VOWELS) {
      const [independent, sign] = (dravidian && SHORT_E_O[tok]) || VOWELS[tok]!;
      out += pending ? sign : independent;
      pending = false;
      vowel = true;
    } else if (tok in CONSONANTS) {
      closeConsonant();
      out += CONSONANTS[tok];
      pending = true;
      vowel = false;
    } else if (tok in SIGNS) {
      closeConsonant();
      // The sign goes before any accent already written (ADR 0002).
      let accents = "";
      while (out.length > 0 && ACCENT_MARKS.includes(out[out.length - 1]!)) {
        accents = out[out.length - 1] + accents;
        out = out.slice(0, -1);
      }
      out += SIGNS[tok] + accents;
    } else if (tok in TAITTIRIYA_ANUSVARA) {
      closeConsonant();
      out += TAITTIRIYA_ANUSVARA[tok];
      vowel = true; // an accent may follow, as in bhU'yAsa_(gg)_
    } else if (tok === ".h") {
      out += VIRAMA;
      pending = false;
      vowel = false;
    } else if (tok === "{}") {
      // Separates tokens and produces nothing; a pending consonant stays.
    } else {
      closeConsonant();
      out += OTHER[tok];
      vowel = false;
    }
  }
  closeConsonant();
  return { text: out, issues };
}
