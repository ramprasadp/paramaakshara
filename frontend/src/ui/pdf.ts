// SPDX-License-Identifier: GPL-3.0-or-later

// Export PDF: prints the output text on its own, in the bundled fonts,
// through the browser's print engine ("Save as PDF"). The browser shapes
// Devanagari, Kannada and Tamil and the Vedic accents exactly as on
// screen and embeds the fonts; PDF libraries in JavaScript cannot shape
// these scripts correctly.

import { el, show } from "./dialog";

export interface PdfOptions {
  title: string;
  page: "A4" | "Letter";
  sizePt: number;
}

const STORAGE_KEY = "paramaakshara-pdf";
const SIZES = [14, 18, 22, 28];

function remembered(): Partial<PdfOptions> {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<PdfOptions>;
  } catch {
    return {};
  }
}

function remember(o: PdfOptions): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ page: o.page, sizePt: o.sizePt }),
    );
  } catch {
    // Storage unavailable: defaults next time.
  }
}

/** Asks for title, page and text size, then opens the print dialog. */
export async function exportPdf(
  lines: string[],
  documentName: string,
): Promise<void> {
  const saved = remembered();
  const title = el("input", {
    type: "text",
    className: "path",
    value: documentName.replace(/\.(paramaakshara\.json|txt|itx|json)$/i, ""),
  });
  const page = el("select");
  for (const p of ["A4", "Letter"])
    page.append(
      el("option", { value: p, selected: p === (saved.page ?? "A4") }, p),
    );
  const size = el("select");
  for (const s of SIZES) {
    size.append(
      el(
        "option",
        { value: String(s), selected: s === (saved.sizePt ?? 18) },
        `${s} pt`,
      ),
    );
  }
  const ok = await show(
    "Export PDF",
    [
      el("label", {}, "Title ", title),
      el("label", {}, "Page ", page, " Text size ", size),
      el(
        "p",
        { className: "muted" },
        "In the print dialog, choose Save as PDF (Chrome: Destination → Save as PDF; " +
          "Safari: PDF → Save as PDF; Firefox: Save to PDF). Turn off “Headers and footers” for a clean page.",
      ),
    ],
    [
      { label: "Cancel", value: false },
      { label: "Print / Save as PDF", value: true, primary: true },
    ],
  );
  if (!ok) return;
  const options: PdfOptions = {
    title: title.value.trim(),
    page: page.value as PdfOptions["page"],
    sizePt: Number(size.value),
  };
  remember(options);
  await printLines(lines, options);
}

/** Fills the print view, prints, and clears it again. */
export async function printLines(
  lines: string[],
  o: PdfOptions,
): Promise<void> {
  const view = document.getElementById("print-view")!;
  const pageStyle = document.getElementById("print-page") as HTMLStyleElement;
  pageStyle.textContent = `@page { size: ${o.page}; margin: 18mm 16mm; }`;
  view.style.fontSize = `${o.sizePt}pt`;
  view.replaceChildren(
    ...(o.title ? [el("h1", {}, o.title)] : []),
    // Empty lines keep their height, so stanza breaks survive.
    ...lines.map((line) =>
      el(
        "p",
        { className: line === "" ? "blank" : "" },
        line === "" ? " " : line,
      ),
    ),
  );
  const previousTitle = document.title;
  // Browsers suggest the page title as the PDF file name.
  if (o.title) document.title = o.title;
  await document.fonts.ready;
  const done = () => {
    view.replaceChildren();
    document.title = previousTitle;
  };
  window.addEventListener("afterprint", done, { once: true });
  window.print();
}
