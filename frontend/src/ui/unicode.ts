// SPDX-License-Identifier: GPL-3.0-or-later

// Pasting Unicode text (Devanagari, Kannada or Tamil): offers the Clean up
// fixes (TECH_SPEC §6.8), shows the text rewritten in ITRANS and how it
// converts, then inserts the ITRANS at the input cursor (§6.9).

import { ALL_FIXES, cleanup, type Fix } from "../conversion/cleanup";
import { scriptOf, type Script } from "../conversion/script";
import { unicodeToItrans, type Options } from "../conversion/unicode";
import type { EditorDocument } from "../editor/document";
import type { LinePreview } from "./baraha";
import { el, show } from "./dialog";

const PREVIEW_LINES = 6;

const FIX_LABELS: Record<Fix, string> = {
  "accent-order":
    "Accent before anusvara, visarga or chandrabindu → sign first (भ\u0942म\u093F\u0951\u0902 → भ\u0942म\u093F\u0902\u0951)",
  "double-svarita": "Baraha double svarita U+0953 → U+1CDA",
  "sanskrit-e-o":
    "Short e/o (\u0946 \u094A ऎ ऒ) → Sanskrit e/o (\u0947 \u094B ए ओ)",
  visarga: "Colon after Devanagari or Kannada → visarga (\u0903 \u0C83)",
  "taittiriya-anusvara": "Taittirīya (ग\u094Dम\u094D) (ग\u094Dग\u094D) → ꣳ ꣴ",
};

/** The Indic script the text is written in, or null if none is used. */
export function indicScript(text: string): Script | null {
  for (const ch of text) {
    const s = scriptOf(ch);
    if (s) return s;
  }
  return null;
}

/**
 * Whether pasted text is probably Unicode rather than ITRANS: it has
 * more Devanagari, Kannada or Tamil characters than Latin letters.
 */
export function looksLikeUnicode(text: string): boolean {
  let indic = 0;
  let latin = 0;
  for (const ch of text) {
    if (scriptOf(ch)) indic++;
    else if (/[A-Za-z]/.test(ch)) latin++;
  }
  return indic > latin;
}

const NAMES: Record<Script, string> = {
  devanagari: "Devanagari",
  kannada: "Kannada",
  tamil: "Tamil",
};

/** Text the Unicode dialog starts with. */
export interface Start {
  text: string;
  /** The text was pasted into the ITRANS pane: offer to keep it unchanged. */
  pasted?: boolean;
  title?: string;
}

/**
 * Opens the Unicode dialog, empty or with start text. With pasted text,
 * it also offers to insert the text unchanged.
 */
export async function unicodeDialog(
  doc: EditorDocument,
  convert: (itrans: string) => LinePreview,
  script: Script,
  opts: Options,
  start?: Start,
): Promise<void> {
  const pasted = start?.pasted ? start.text : undefined;
  const input = el("textarea", {
    className: "unicode-input",
    rows: 8,
    spellcheck: false,
    placeholder:
      "Paste Unicode text here, e.g.  अ\u0952ग\u094Dन\u093Fम\u0940\u0951ळ\u0947 प\u0941\u0952र\u094Bह\u093F\u0951त\u0902",
    value: start?.text ?? "",
  });
  const preview = el("div", { className: "unicode-preview" });
  // Clean up (§6.8): the fixes found in the text, all chosen at first.
  const fixes = el("div", { className: "cleanup-fixes" });
  const declined = new Set<Fix>();
  const chosen = () => ALL_FIXES.filter((f) => !declined.has(f));
  const toItrans = (text: string) =>
    cleanup(text, chosen())
      .text.split("\n")
      .map((line) => unicodeToItrans(line, opts));
  const renderFixes = () => {
    const counts = cleanup(input.value).counts;
    const found = ALL_FIXES.filter((f) => counts[f] > 0);
    fixes.replaceChildren(
      ...(found.length > 0
        ? [el("p", { className: "muted" }, "Clean up before converting:")]
        : []),
      ...found.map((f) => {
        const box = el("input", {
          type: "checkbox",
          checked: !declined.has(f),
        });
        box.addEventListener("change", () => {
          if (box.checked) declined.delete(f);
          else declined.add(f);
          render();
        });
        return el("label", {}, box, `${FIX_LABELS[f]} — ${counts[f]}`);
      }),
    );
  };
  const render = () => {
    const lines = toItrans(input.value);
    const changed = lines.filter((l) => !l.exact).length;
    const noted = lines.filter((l) => l.issues.length > 0).length;
    const from = indicScript(input.value);
    const summary = [
      `${lines.length} ${lines.length === 1 ? "line" : "lines"}`,
      ...(changed ? [`${changed} will not convert back exactly (⚠)`] : []),
      ...(noted ? [`${noted} with notes`] : []),
    ];
    preview.replaceChildren(
      el("p", { className: changed ? "error" : "muted" }, summary.join(" · ")),
    );
    if (from && from !== script)
      preview.append(
        el(
          "p",
          { className: "muted" },
          `The text is ${NAMES[from]}; it will be written in ${NAMES[script]}, the output script.`,
        ),
      );
    lines.slice(0, PREVIEW_LINES).forEach((line) => {
      const result = convert(line.itrans);
      const notes = [
        ...(line.exact
          ? []
          : ["converting the ITRANS does not give back this line exactly"]),
        ...line.issues,
        ...result.issues,
      ];
      preview.append(
        el("div", { className: "unicode-itrans" }, line.itrans),
        el(
          "div",
          { className: "unicode-output", title: notes.join("; ") },
          (line.exact ? "" : "⚠ ") + result.text,
        ),
      );
    });
    if (lines.length > PREVIEW_LINES)
      preview.append(el("p", { className: "muted" }, "…"));
  };
  input.addEventListener("input", () => {
    renderFixes();
    render();
  });
  renderFixes();
  render();

  const choice = await show(
    start?.title ??
      (pasted === undefined
        ? "Paste Unicode text"
        : "This looks like Unicode text"),
    [
      "Devanagari, Kannada or Tamil text is rewritten in ITRANS. Lines marked ⚠ will change when converted (for example an accent before an anusvara is moved after it); hover over a line for details.",
      input,
      fixes,
      preview,
    ],
    [
      { label: "Cancel", value: "cancel" },
      ...(pasted !== undefined
        ? [{ label: "Paste unchanged", value: "raw" }]
        : []),
      { label: "Insert as ITRANS", value: "convert", primary: true },
    ],
  );
  if (choice === "convert")
    doc.insertInSource(
      toItrans(input.value)
        .map((l) => l.itrans)
        .join("\n"),
    );
  else if (choice === "raw" && pasted !== undefined) doc.insertInSource(pasted);
}
