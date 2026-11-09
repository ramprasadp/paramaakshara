// SPDX-License-Identifier: GPL-3.0-or-later

// Clean up text (TECH_SPEC §6.8): explicit fixes for look-alike
// characters in text from other tools, chiefly Baraha. Nothing here runs
// automatically; the editor applies a fix only when the user asks.

export type Fix =
  | "visarga"
  | "double-svarita"
  | "sanskrit-e-o"
  | "accent-order"
  | "taittiriya-anusvara";

export const ALL_FIXES: readonly Fix[] = [
  "visarga",
  "double-svarita",
  "sanskrit-e-o",
  "accent-order",
  "taittiriya-anusvara",
];

const ACCENTS = "\u0951\u0952\u1CDA\u0953";
// Anusvara, visarga, chandrabindu (Devanagari and Kannada).
const SIGNS = "\u0902\u0903\u0901\u0C82\u0C83\u0C81";

// Dravidian short e/o, which Sanskrit does not use, to long e/o.
const SHORT_TO_LONG: Record<string, string> = {
  "\u0946": "\u0947", // vowel sign short e → e
  "\u094A": "\u094B", // vowel sign short o → o
  "\u090E": "\u090F", // letter short e → e
  "\u0912": "\u0913", // letter short o → o
};

/** Is ch a Devanagari or Kannada letter, sign, vowel sign or Vedic mark? */
function indic(ch: string): "deva" | "knda" | null {
  const c = ch.codePointAt(0)!;
  if (
    (c >= 0x0900 && c <= 0x097f) ||
    (c >= 0x1cd0 && c <= 0x1cff) ||
    (c >= 0xa8e0 && c <= 0xa8ff)
  )
    return "deva";
  if (c >= 0x0c80 && c <= 0x0cff) return "knda";
  return null;
}

export interface Result {
  text: string;
  counts: Record<Fix, number>;
}

/** Applies the selected fixes to text and counts the changes. */
export function cleanup(
  text: string,
  fixes: readonly Fix[] = ALL_FIXES,
): Result {
  const counts: Record<Fix, number> = {
    visarga: 0,
    "double-svarita": 0,
    "sanskrit-e-o": 0,
    "accent-order": 0,
    "taittiriya-anusvara": 0,
  };
  const on = new Set(fixes);
  let out = text;

  if (on.has("double-svarita")) {
    out = out.replace(/\u0953/g, () => {
      counts["double-svarita"]++;
      return "\u1CDA";
    });
  }
  if (on.has("sanskrit-e-o")) {
    out = out.replace(/[\u0946\u094A\u090E\u0912]/g, (m) => {
      counts["sanskrit-e-o"]++;
      return SHORT_TO_LONG[m]!;
    });
  }
  if (on.has("visarga")) {
    // An ASCII colon directly after Devanagari or Kannada text.
    const chars = Array.from(out);
    for (let i = 1; i < chars.length; i++) {
      if (chars[i] !== ":") continue;
      const script = indic(chars[i - 1]!);
      if (script) {
        chars[i] = script === "deva" ? "\u0903" : "\u0C83";
        counts.visarga++;
      }
    }
    out = chars.join("");
  }
  if (on.has("taittiriya-anusvara")) {
    // Baraha's (ग्म्)/(ग्ग्) → U+A8F3/U+A8F4 (ITRANS (gm)/(gg)).
    out = out.replace(
      /\(\u0917\u094D(\u092E|\u0917)\u094D\)/g,
      (_m, second: string) => {
        counts["taittiriya-anusvara"]++;
        return second === "\u092E" ? "\uA8F3" : "\uA8F4";
      },
    );
  }
  if (on.has("accent-order")) {
    // Accent(s) followed by anusvara, visarga or chandrabindu: put the
    // signs first (ADR 0002).
    out = out.replace(
      new RegExp(`([${ACCENTS}]+)([${SIGNS}]+)`, "g"),
      (_m, accents: string, signs: string) => {
        counts["accent-order"]++;
        return signs + accents;
      },
    );
  }
  return { text: out, counts };
}
