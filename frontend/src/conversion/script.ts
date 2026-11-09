// SPDX-License-Identifier: GPL-3.0-or-later

// Script conversion between Devanagari, Kannada and Tamil (TECH_SPEC §7).
// Text is first brought to Devanagari, then written in the target script.
// Characters a script cannot represent are kept and reported; nothing is
// dropped. Vedic accents, dandas and other shared characters pass through.
//
// Tamil follows the superscript-numeral convention (§7.3, docs/
// script-conversion.md): aspirated and voiced stops are the plain Tamil
// letter followed by ², ³ or ⁴ after its vowel sign or virama and
// accents, before any anusvara or visarga. Anusvara is written ம்.

import { KANNADA, TAMIL } from "./script-tables";

export type Script = "devanagari" | "kannada" | "tamil";

export const SCRIPTS: { id: Script; label: string }[] = [
  { id: "devanagari", label: "Devanagari" },
  { id: "kannada", label: "Kannada" },
  { id: "tamil", label: "Tamil" },
];

export interface ScriptIssue {
  /** The source character(s) concerned. */
  text: string;
  message: string;
}

export interface ScriptResult {
  text: string;
  issues: ScriptIssue[];
}

const invert = (m: ReadonlyMap<number, number>) =>
  new Map([...m].map(([a, b]) => [b, a]));
const FROM_KANNADA = invert(KANNADA);
const FROM_TAMIL = invert(TAMIL);

const SUP: Record<string, string> = {
  "2": "\u00B2",
  "3": "\u00B3",
  "4": "\u2074",
};
const SUP_DIGIT: Record<string, number> = {
  "\u00B2": 2,
  "\u00B3": 3,
  "\u2074": 4,
};

// Devanagari consonants written in Tamil as base letter + superscript.
const TAMIL_SUPERSCRIPT: Record<string, [string, number]> = {
  "\u0916": ["\u0B95", 2], // ख  க²
  "\u0917": ["\u0B95", 3], // ग  க³
  "\u0918": ["\u0B95", 4], // घ  க⁴
  "\u091B": ["\u0B9A", 2], // छ  ச²
  "\u091D": ["\u0B9C", 2], // झ  ஜ²
  "\u0920": ["\u0B9F", 2], // ठ  ட²
  "\u0921": ["\u0B9F", 3], // ड  ட³
  "\u0922": ["\u0B9F", 4], // ढ  ட⁴
  "\u0925": ["\u0BA4", 2], // थ  த²
  "\u0926": ["\u0BA4", 3], // द  த³
  "\u0927": ["\u0BA4", 4], // ध  த⁴
  "\u092B": ["\u0BAA", 2], // फ  ப²
  "\u092C": ["\u0BAA", 3], // ब  ப³
  "\u092D": ["\u0BAA", 4], // भ  ப⁴
};
// Reverse: Tamil base + superscript → Devanagari.
const FROM_TAMIL_SUPERSCRIPT = new Map(
  Object.entries(TAMIL_SUPERSCRIPT).map(([dev, [tam, n]]) => [
    `${tam}${n}`,
    dev,
  ]),
);

// Vocalic r/l have no Tamil letters; written approximately (not reversible).
const TAMIL_APPROX: Record<string, string> = {
  "\u090B": "\u0BB0\u0BC1", // ऋ  ரு
  "\u0960": "\u0BB0\u0BC2", // ॠ  ரூ
  "\u090C": "\u0BB2\u0BC1", // ऌ  லு
  "\u0961": "\u0BB2\u0BC2", // ॡ  லூ
};
const TAMIL_APPROX_SIGN: Record<string, string> = {
  "\u0943": "\u0BCD\u0BB0\u0BC1", // ृ  ்ரு
  "\u0944": "\u0BCD\u0BB0\u0BC2", // ॄ  ்ரூ
  "\u0962": "\u0BCD\u0BB2\u0BC1", // ॢ  ்லு
  "\u0963": "\u0BCD\u0BB2\u0BC2", // ॣ  ்லூ
};

// Kannada has no OM sign; ओं is the usual spelling (not reversible).
const KANNADA_APPROX: Record<string, string> = { "\u0950": "\u0C93\u0C82" };

export function scriptOf(ch: string): Script | null {
  const c = ch.codePointAt(0)!;
  if (c >= 0x0900 && c <= 0x097f) return "devanagari";
  if (c >= 0x0c80 && c <= 0x0cff) return "kannada";
  if (c >= 0x0b80 && c <= 0x0bff) return "tamil";
  return null;
}

const isDevConsonant = (c: number) =>
  (c >= 0x0915 && c <= 0x0939) || (c >= 0x0958 && c <= 0x095f);
// Marks that belong to the preceding syllable: nukta, vowel signs, virama,
// candrabindu/anusvara/visarga, Vedic accents.
const isSyllableMark = (c: number) =>
  c === 0x093c ||
  (c >= 0x093e && c <= 0x094d) ||
  (c >= 0x0900 && c <= 0x0903) ||
  (c >= 0x0951 && c <= 0x0954) ||
  (c >= 0x0962 && c <= 0x0963) ||
  (c >= 0x1cd0 && c <= 0x1cff);

/** Brings Kannada and Tamil characters to Devanagari; others are kept. */
export function toDevanagari(text: string): ScriptResult {
  const issues: ScriptIssue[] = [];
  let out = "";
  // Index in out of the last Devanagari consonant from a Tamil letter,
  // which a following superscript modifies.
  let lastTamilConsonant = -1;
  let lastTamilBase = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const script = scriptOf(ch);
    if (script === "kannada") {
      const d = FROM_KANNADA.get(c);
      if (d === undefined)
        issues.push({
          text: ch,
          message: `Kannada ${ch} has no Devanagari equivalent; kept`,
        });
      out += d === undefined ? ch : String.fromCodePoint(d);
      lastTamilConsonant = -1;
    } else if (script === "tamil") {
      const d = FROM_TAMIL.get(c);
      if (d === undefined)
        issues.push({
          text: ch,
          message: `Tamil ${ch} has no Devanagari equivalent; kept`,
        });
      if (d !== undefined && isDevConsonant(d)) {
        lastTamilConsonant = out.length;
        lastTamilBase = ch;
      }
      out += d === undefined ? ch : String.fromCodePoint(d);
    } else if (ch in SUP_DIGIT && lastTamilConsonant >= 0) {
      const dev = FROM_TAMIL_SUPERSCRIPT.get(
        `${lastTamilBase}${SUP_DIGIT[ch]}`,
      );
      if (dev) {
        out =
          out.slice(0, lastTamilConsonant) +
          dev +
          out.slice(lastTamilConsonant + 1);
      } else {
        out += ch;
        issues.push({
          text: ch,
          message: `superscript ${ch} after ${lastTamilBase} has no meaning; kept`,
        });
      }
      lastTamilConsonant = -1;
    } else {
      out += ch;
      if (!isSyllableMark(c)) lastTamilConsonant = -1;
    }
  }
  return { text: out, issues };
}

/** Writes Devanagari text in the target script. */
export function fromDevanagari(text: string, to: Script): ScriptResult {
  if (to === "devanagari") return { text, issues: [] };
  const issues: ScriptIssue[] = [];
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const c = ch.codePointAt(0)!;
    if (c >= 0xa8e0 && c <= 0xa8ff) {
      // Devanagari Extended (e.g. Taittirīya ꣳ ꣴ): no Kannada/Tamil form.
      out += ch;
      issues.push({
        text: ch,
        message: `${ch} has no ${to === "kannada" ? "Kannada" : "Tamil"} equivalent; kept`,
      });
      continue;
    }
    if (scriptOf(ch) !== "devanagari") {
      out += ch;
      continue;
    }
    if (to === "kannada") {
      if (ch in KANNADA_APPROX) {
        out += KANNADA_APPROX[ch];
        issues.push({
          text: ch,
          message: `${ch} is written ${KANNADA_APPROX[ch]} in Kannada (not reversible)`,
        });
        continue;
      }
      const k = KANNADA.get(c);
      if (k === undefined && !isShared(c))
        issues.push({
          text: ch,
          message: `${ch} has no Kannada equivalent; kept`,
        });
      out += k === undefined ? ch : String.fromCodePoint(k);
      continue;
    }
    // Tamil.
    if (ch in TAMIL_SUPERSCRIPT) {
      const [base, n] = TAMIL_SUPERSCRIPT[ch]!;
      // Write the vowel sign or virama and accents, then the superscript;
      // anusvara, visarga and chandrabindu follow it.
      let j = i + 1;
      let marks = "";
      while (
        j < chars.length &&
        isSyllableMark(chars[j]!.codePointAt(0)!) &&
        !isSign(chars[j]!.codePointAt(0)!)
      ) {
        marks += chars[j];
        j++;
      }
      const rest = fromDevanagari(marks, "tamil");
      issues.push(...rest.issues);
      out += base + rest.text + SUP[String(n)];
      i = j - 1;
      continue;
    }
    if (c === 0x0902) {
      // Anusvara is written ம், as in printed Tamil Sanskrit texts; it reads
      // back as म् (documented convention, not reported).
      out += "\u0BAE\u0BCD";
      continue;
    }
    if (ch in TAMIL_APPROX || ch in TAMIL_APPROX_SIGN) {
      const t = TAMIL_APPROX[ch] ?? TAMIL_APPROX_SIGN[ch]!;
      out += t;
      issues.push({
        text: ch,
        message: `${ch} is written approximately as ${t} in Tamil (not reversible)`,
      });
      continue;
    }
    const t = TAMIL.get(c);
    if (t === undefined && !isShared(c))
      issues.push({ text: ch, message: `${ch} has no Tamil equivalent; kept` });
    out += t === undefined ? ch : String.fromCodePoint(t);
  }
  return { text: out, issues };
}

/** Converts text in any of the three scripts to the target script. */
export function convertScript(text: string, to: Script): ScriptResult {
  const dev = toDevanagari(text);
  const out = fromDevanagari(dev.text, to);
  return { text: out.text, issues: [...dev.issues, ...out.issues] };
}

// Shared by all Indic scripts: dandas and Vedic accents.
function isShared(c: number): boolean {
  return c === 0x0964 || c === 0x0965 || (c >= 0x0951 && c <= 0x0954);
}

// Candrabindu, anusvara, visarga.
function isSign(c: number): boolean {
  return c >= 0x0900 && c <= 0x0903;
}
