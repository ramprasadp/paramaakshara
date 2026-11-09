// SPDX-License-Identifier: GPL-3.0-or-later

// The Vedic symbol catalogue (TECH_SPEC §6.2--6.4), shown by the palette and
// documented in docs/vedic-symbols.md. Unicode names and categories are
// from the Unicode Character Database 13.0.0 (generated with
// Python's unicodedata; do not edit by hand). Traditional names are given
// only where verified against the project's sample texts.

export interface Symbol {
  cp: number;
  name: string;
  /** Unicode general category: Mn/Mc combining, Lo letter, Po punctuation. */
  category: string;
}

export interface TraditionMark {
  cp: number;
  /** Traditional name in this tradition. */
  label: string;
  /** Input sequence in the ITRANS pane, if any. */
  input?: string;
  /** Where the usage was verified. */
  source: string;
}

export interface Tradition {
  id: string;
  label: string;
  note: string;
  marks: TraditionMark[];
}

export const TRADITIONS: Tradition[] = [
  {
    id: "rigveda",
    label: "Ṛgveda (Śākala)",
    note: "Udātta is unmarked.",
    marks: [
      {
        cp: 0x0952,
        label: "Anudātta",
        input: "_",
        source: "testdata/vedic/baraha/purusha-sukta",
      },
      {
        cp: 0x0951,
        label: "Svarita",
        input: "'",
        source: "testdata/vedic/baraha/purusha-sukta",
      },
    ],
  },
  {
    id: "taittiriya",
    label: "Taittirīya (Kṛṣṇa Yajurveda)",
    note: "Udātta is unmarked.",
    marks: [
      {
        cp: 0x0952,
        label: "Anudātta",
        input: "_",
        source: "testdata/vedic/baraha/viraja-homa",
      },
      {
        cp: 0x0951,
        label: "Svarita",
        input: "'",
        source: "testdata/vedic/baraha/viraja-homa",
      },
      {
        cp: 0x1cda,
        label: "Double (dīrgha) svarita",
        input: "'''",
        source: "testdata/vedic/baraha/viraja-homa",
      },
    ],
  },
];

/** Common Devanagari signs, by Unicode name. */
export const SIGNS: Symbol[] = [
  { cp: 0x0901, name: "DEVANAGARI SIGN CANDRABINDU", category: "Mn" },
  { cp: 0x0902, name: "DEVANAGARI SIGN ANUSVARA", category: "Mn" },
  { cp: 0x0903, name: "DEVANAGARI SIGN VISARGA", category: "Mc" },
  { cp: 0x093d, name: "DEVANAGARI SIGN AVAGRAHA", category: "Lo" },
  { cp: 0x0950, name: "DEVANAGARI OM", category: "Lo" },
  { cp: 0x0964, name: "DEVANAGARI DANDA", category: "Po" },
  { cp: 0x0965, name: "DEVANAGARI DOUBLE DANDA", category: "Po" },
  { cp: 0x0953, name: "DEVANAGARI GRAVE ACCENT", category: "Mn" },
  { cp: 0x0954, name: "DEVANAGARI ACUTE ACCENT", category: "Mn" },
];

/** Vedic Extensions, U+1CD0--U+1CFF. */
export const VEDIC_EXTENSIONS: Symbol[] = [
  { cp: 0x1cd0, name: "VEDIC TONE KARSHANA", category: "Mn" },
  { cp: 0x1cd1, name: "VEDIC TONE SHARA", category: "Mn" },
  { cp: 0x1cd2, name: "VEDIC TONE PRENKHA", category: "Mn" },
  { cp: 0x1cd3, name: "VEDIC SIGN NIHSHVASA", category: "Po" },
  { cp: 0x1cd4, name: "VEDIC SIGN YAJURVEDIC MIDLINE SVARITA", category: "Mn" },
  {
    cp: 0x1cd5,
    name: "VEDIC TONE YAJURVEDIC AGGRAVATED INDEPENDENT SVARITA",
    category: "Mn",
  },
  {
    cp: 0x1cd6,
    name: "VEDIC TONE YAJURVEDIC INDEPENDENT SVARITA",
    category: "Mn",
  },
  {
    cp: 0x1cd7,
    name: "VEDIC TONE YAJURVEDIC KATHAKA INDEPENDENT SVARITA",
    category: "Mn",
  },
  { cp: 0x1cd8, name: "VEDIC TONE CANDRA BELOW", category: "Mn" },
  {
    cp: 0x1cd9,
    name: "VEDIC TONE YAJURVEDIC KATHAKA INDEPENDENT SVARITA SCHROEDER",
    category: "Mn",
  },
  { cp: 0x1cda, name: "VEDIC TONE DOUBLE SVARITA", category: "Mn" },
  { cp: 0x1cdb, name: "VEDIC TONE TRIPLE SVARITA", category: "Mn" },
  { cp: 0x1cdc, name: "VEDIC TONE KATHAKA ANUDATTA", category: "Mn" },
  { cp: 0x1cdd, name: "VEDIC TONE DOT BELOW", category: "Mn" },
  { cp: 0x1cde, name: "VEDIC TONE TWO DOTS BELOW", category: "Mn" },
  { cp: 0x1cdf, name: "VEDIC TONE THREE DOTS BELOW", category: "Mn" },
  {
    cp: 0x1ce0,
    name: "VEDIC TONE RIGVEDIC KASHMIRI INDEPENDENT SVARITA",
    category: "Mn",
  },
  {
    cp: 0x1ce1,
    name: "VEDIC TONE ATHARVAVEDIC INDEPENDENT SVARITA",
    category: "Mc",
  },
  { cp: 0x1ce2, name: "VEDIC SIGN VISARGA SVARITA", category: "Mn" },
  { cp: 0x1ce3, name: "VEDIC SIGN VISARGA UDATTA", category: "Mn" },
  { cp: 0x1ce4, name: "VEDIC SIGN REVERSED VISARGA UDATTA", category: "Mn" },
  { cp: 0x1ce5, name: "VEDIC SIGN VISARGA ANUDATTA", category: "Mn" },
  { cp: 0x1ce6, name: "VEDIC SIGN REVERSED VISARGA ANUDATTA", category: "Mn" },
  { cp: 0x1ce7, name: "VEDIC SIGN VISARGA UDATTA WITH TAIL", category: "Mn" },
  { cp: 0x1ce8, name: "VEDIC SIGN VISARGA ANUDATTA WITH TAIL", category: "Mn" },
  { cp: 0x1ce9, name: "VEDIC SIGN ANUSVARA ANTARGOMUKHA", category: "Lo" },
  { cp: 0x1cea, name: "VEDIC SIGN ANUSVARA BAHIRGOMUKHA", category: "Lo" },
  { cp: 0x1ceb, name: "VEDIC SIGN ANUSVARA VAMAGOMUKHA", category: "Lo" },
  {
    cp: 0x1cec,
    name: "VEDIC SIGN ANUSVARA VAMAGOMUKHA WITH TAIL",
    category: "Lo",
  },
  { cp: 0x1ced, name: "VEDIC SIGN TIRYAK", category: "Mn" },
  { cp: 0x1cee, name: "VEDIC SIGN HEXIFORM LONG ANUSVARA", category: "Lo" },
  { cp: 0x1cef, name: "VEDIC SIGN LONG ANUSVARA", category: "Lo" },
  { cp: 0x1cf0, name: "VEDIC SIGN RTHANG LONG ANUSVARA", category: "Lo" },
  { cp: 0x1cf1, name: "VEDIC SIGN ANUSVARA UBHAYATO MUKHA", category: "Lo" },
  { cp: 0x1cf2, name: "VEDIC SIGN ARDHAVISARGA", category: "Lo" },
  { cp: 0x1cf3, name: "VEDIC SIGN ROTATED ARDHAVISARGA", category: "Lo" },
  { cp: 0x1cf4, name: "VEDIC TONE CANDRA ABOVE", category: "Mn" },
  { cp: 0x1cf5, name: "VEDIC SIGN JIHVAMULIYA", category: "Lo" },
  { cp: 0x1cf6, name: "VEDIC SIGN UPADHMANIYA", category: "Lo" },
  { cp: 0x1cf7, name: "VEDIC SIGN ATIKRAMA", category: "Mc" },
  { cp: 0x1cf8, name: "VEDIC TONE RING ABOVE", category: "Mn" },
  { cp: 0x1cf9, name: "VEDIC TONE DOUBLE RING ABOVE", category: "Mn" },
  {
    cp: 0x1cfa,
    name: "VEDIC SIGN DOUBLE ANUSVARA ANTARGOMUKHA",
    category: "Lo",
  },
];

/** Devanagari Extended, U+A8E0--U+A8FF. */
export const DEVANAGARI_EXTENDED: Symbol[] = [
  { cp: 0xa8e0, name: "COMBINING DEVANAGARI DIGIT ZERO", category: "Mn" },
  { cp: 0xa8e1, name: "COMBINING DEVANAGARI DIGIT ONE", category: "Mn" },
  { cp: 0xa8e2, name: "COMBINING DEVANAGARI DIGIT TWO", category: "Mn" },
  { cp: 0xa8e3, name: "COMBINING DEVANAGARI DIGIT THREE", category: "Mn" },
  { cp: 0xa8e4, name: "COMBINING DEVANAGARI DIGIT FOUR", category: "Mn" },
  { cp: 0xa8e5, name: "COMBINING DEVANAGARI DIGIT FIVE", category: "Mn" },
  { cp: 0xa8e6, name: "COMBINING DEVANAGARI DIGIT SIX", category: "Mn" },
  { cp: 0xa8e7, name: "COMBINING DEVANAGARI DIGIT SEVEN", category: "Mn" },
  { cp: 0xa8e8, name: "COMBINING DEVANAGARI DIGIT EIGHT", category: "Mn" },
  { cp: 0xa8e9, name: "COMBINING DEVANAGARI DIGIT NINE", category: "Mn" },
  { cp: 0xa8ea, name: "COMBINING DEVANAGARI LETTER A", category: "Mn" },
  { cp: 0xa8eb, name: "COMBINING DEVANAGARI LETTER U", category: "Mn" },
  { cp: 0xa8ec, name: "COMBINING DEVANAGARI LETTER KA", category: "Mn" },
  { cp: 0xa8ed, name: "COMBINING DEVANAGARI LETTER NA", category: "Mn" },
  { cp: 0xa8ee, name: "COMBINING DEVANAGARI LETTER PA", category: "Mn" },
  { cp: 0xa8ef, name: "COMBINING DEVANAGARI LETTER RA", category: "Mn" },
  { cp: 0xa8f0, name: "COMBINING DEVANAGARI LETTER VI", category: "Mn" },
  { cp: 0xa8f1, name: "COMBINING DEVANAGARI SIGN AVAGRAHA", category: "Mn" },
  { cp: 0xa8f2, name: "DEVANAGARI SIGN SPACING CANDRABINDU", category: "Lo" },
  { cp: 0xa8f3, name: "DEVANAGARI SIGN CANDRABINDU VIRAMA", category: "Lo" },
  {
    cp: 0xa8f4,
    name: "DEVANAGARI SIGN DOUBLE CANDRABINDU VIRAMA",
    category: "Lo",
  },
  { cp: 0xa8f5, name: "DEVANAGARI SIGN CANDRABINDU TWO", category: "Lo" },
  { cp: 0xa8f6, name: "DEVANAGARI SIGN CANDRABINDU THREE", category: "Lo" },
  { cp: 0xa8f7, name: "DEVANAGARI SIGN CANDRABINDU AVAGRAHA", category: "Lo" },
  { cp: 0xa8f8, name: "DEVANAGARI SIGN PUSHPIKA", category: "Po" },
  { cp: 0xa8f9, name: "DEVANAGARI GAP FILLER", category: "Po" },
  { cp: 0xa8fa, name: "DEVANAGARI CARET", category: "Po" },
  { cp: 0xa8fb, name: "DEVANAGARI HEADSTROKE", category: "Lo" },
  { cp: 0xa8fc, name: "DEVANAGARI SIGN SIDDHAM", category: "Po" },
  { cp: 0xa8fd, name: "DEVANAGARI JAIN OM", category: "Lo" },
  { cp: 0xa8fe, name: "DEVANAGARI LETTER AY", category: "Lo" },
  { cp: 0xa8ff, name: "DEVANAGARI VOWEL SIGN AY", category: "Mn" },
];

/** The Devanagari stress signs used as Vedic accents. */
export const STRESS_SIGNS: Symbol[] = [
  { cp: 0x0951, name: "DEVANAGARI STRESS SIGN UDATTA", category: "Mn" },
  { cp: 0x0952, name: "DEVANAGARI STRESS SIGN ANUDATTA", category: "Mn" },
];

/** Every catalogued symbol by code point (for names). */
export const BY_CODE_POINT = new Map<number, Symbol>(
  [...STRESS_SIGNS, ...SIGNS, ...VEDIC_EXTENSIONS, ...DEVANAGARI_EXTENDED].map(
    (s) => [s.cp, s],
  ),
);

export function codePoint(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}
