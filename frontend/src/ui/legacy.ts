// SPDX-License-Identifier: GPL-3.0-or-later

// Importing a PDF typeset with legacy (non-Unicode) fonts such as
// Shree-Lipi: the daemon converts its text with the font tables, the user
// chooses pages, and the text goes on to the Import Unicode dialog, which
// rewrites it in ITRANS (TECH_SPEC §6.10, §6.9).

import { api, ApiError, type LegacyDocument } from "../services/api";
import { alertBox, el, show } from "./dialog";

const PREVIEW_LINES = 12;

/** The lines of pages from to to, with a blank line between pages. */
export function pageText(
  doc: LegacyDocument,
  from: number,
  to: number,
): string {
  return doc.pages
    .filter((p) => p.number >= from && p.number <= to)
    .map((p) => p.lines.join("\n"))
    .join("\n\n");
}

/** What the dialog says about the fonts and unconverted glyphs. */
export function summary(
  doc: LegacyDocument,
): { text: string; warn: boolean }[] {
  const out: { text: string; warn: boolean }[] = [];
  const converted = doc.fonts.filter((f) => f.table);
  const plain = doc.fonts.filter((f) => !f.table);
  const n = doc.pages.length;
  out.push({ text: `${n} ${n === 1 ? "page" : "pages"}.`, warn: false });
  if (converted.length > 0)
    out.push({
      text: `Converted: ${converted
        .map((f) => (f.table === f.name ? f.name : `${f.name} (as ${f.table})`))
        .join(", ")}.`,
      warn: false,
    });
  else
    out.push({
      text: "None of the fonts in this PDF has a table, so nothing was converted. If the PDF uses Unicode fonts, copy the text from the PDF viewer instead.",
      warn: true,
    });
  if (plain.length > 0)
    out.push({
      text: `Read as plain text (no table): ${plain.map((f) => f.name).join(", ")}.`,
      warn: converted.length === 0,
    });
  if (doc.unmapped.length > 0) {
    const total = doc.unmapped.reduce((s, u) => s + u.count, 0);
    const list = doc.unmapped
      .map((u) => `${u.code} ×${u.count} in ${u.font}`)
      .join(", ");
    out.push({
      text: `${total} ${total === 1 ? "glyph has" : "glyphs have"} no table entry and ${total === 1 ? "is" : "are"} kept as ‹code›: ${list}.`,
      warn: true,
    });
  }
  return out;
}

function pickPdf(): Promise<File | null> {
  const input = el("input", { type: "file", accept: ".pdf,application/pdf" });
  return new Promise((resolve) => {
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), {
      once: true,
    });
    input.click();
  });
}

/**
 * Asks for a PDF, converts it and shows the result; the chosen pages are
 * passed to next with a title for the Import Unicode dialog.
 */
export async function legacyPdfImport(
  next: (text: string, title: string) => Promise<void>,
): Promise<void> {
  const file = await pickPdf();
  if (!file) return;
  let doc: LegacyDocument;
  try {
    doc = await api.importLegacyPdf(file);
  } catch (e) {
    await alertBox(
      "Cannot import",
      e instanceof ApiError ? e.message : String(e),
    );
    return;
  }
  const last = doc.pages.at(-1)?.number ?? 0;
  if (!doc.pages.some((p) => p.lines.length > 0)) {
    await alertBox(
      "No text",
      `${file.name} has no text to convert; its pages may be scanned images.`,
    );
    return;
  }

  const range = (value: number) =>
    el("input", {
      type: "number",
      min: "1",
      max: String(last),
      value: String(value),
      className: "legacy-page",
    });
  const from = range(1);
  const to = range(last);
  const pages = (): [number, number] => {
    const clamp = (v: number, d: number) =>
      Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 1), last) : d;
    const a = clamp(from.valueAsNumber, 1);
    const b = clamp(to.valueAsNumber, last);
    return a <= b ? [a, b] : [b, a];
  };
  const preview = el("div", { className: "legacy-preview" });
  const render = () => {
    const lines = pageText(doc, ...pages()).split("\n");
    preview.replaceChildren(
      el("p", { className: "muted" }, `${lines.length} lines`),
      ...lines
        .slice(0, PREVIEW_LINES)
        .map((l) => el("div", { className: "legacy-line" }, l || " ")),
      ...(lines.length > PREVIEW_LINES
        ? [el("p", { className: "muted" }, "…")]
        : []),
    );
  };
  from.addEventListener("input", render);
  to.addEventListener("input", render);
  render();

  const choice = await show(
    `Import ${file.name}`,
    [
      ...summary(doc).map((s) =>
        el("p", { className: s.warn ? "error" : "muted" }, s.text),
      ),
      el("label", {}, "Pages ", from, " to ", to, ` of ${last}`),
      preview,
      "The text is shown as the PDF draws it, including its typos. Next it is rewritten in ITRANS, where you can still edit it.",
    ],
    [
      { label: "Cancel", value: false },
      { label: "Continue", value: true, primary: true },
    ],
  );
  if (!choice) return;
  const [a, b] = pages();
  await next(
    pageText(doc, a, b),
    `${file.name}, ${a === b ? `page ${a}` : `pages ${a}–${b}`}`,
  );
}
