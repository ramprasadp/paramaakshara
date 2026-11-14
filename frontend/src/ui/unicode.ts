// SPDX-License-Identifier: GPL-3.0-or-later

// Pasting Unicode text (Devanagari, Kannada or Tamil): shows the text
// rewritten in ITRANS and how it converts, then inserts the ITRANS at the
// input cursor (TECH_SPEC §6.9).

import { scriptOf, type Script } from "../conversion/script";
import { unicodeToItrans, type Options } from "../conversion/unicode";
import type { EditorDocument } from "../editor/document";
import type { LinePreview } from "./baraha";
import { el, show } from "./dialog";

const PREVIEW_LINES = 6;

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
  const toItrans = (text: string) =>
    text.split("\n").map((line) => unicodeToItrans(line, opts));
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
  input.addEventListener("input", render);
  render();

  const choice = await show(
    start?.title ??
      (pasted === undefined
        ? "Paste Unicode text"
        : "This looks like Unicode text"),
    [
      "Devanagari, Kannada or Tamil text is rewritten in ITRANS. Lines marked ⚠ will change when converted (for example an accent before an anusvara is moved after it); hover over a line for details.",
      input,
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
