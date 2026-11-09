// SPDX-License-Identifier: GPL-3.0-or-later

// The Vedic symbol palette (TECH_SPEC §6.4): accents by tradition, common
// signs and the Vedic Unicode blocks, searchable, inserted at the output
// cursor. Symbols the bundled font has no glyph for are marked.

import type { EditorDocument } from "../editor/document";
import { coveredCodePoints } from "../fonts/cmap";
import {
  BY_CODE_POINT,
  DEVANAGARI_EXTENDED,
  SIGNS,
  TRADITIONS,
  VEDIC_EXTENSIONS,
  codePoint,
  type Symbol,
} from "../vedic/catalogue";
import { el } from "./dialog";

const BUNDLED_FONT = "/fonts/NotoSerifDevanagari-Regular.ttf";

let coverage: Promise<Set<number> | null> | null = null;

function fontCoverage(): Promise<Set<number> | null> {
  coverage ??= fetch(BUNDLED_FONT)
    .then((r) => r.arrayBuffer())
    .then(coveredCodePoints)
    .catch(() => null);
  return coverage;
}

/** The glyph as displayed: combining marks on a dotted circle. */
function display(s: { cp: number; category?: string }): string {
  const ch = String.fromCodePoint(s.cp);
  return s.category === "Mn" || s.category === "Mc" ? "◌" + ch : ch;
}

export interface PaletteOptions {
  doc: EditorDocument;
  tradition: () => string;
  setTradition: (id: string) => void;
  /** True when the bundled font is in use, so coverage is known. */
  bundledFont: () => boolean;
}

export class Palette {
  private readonly root: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly opts: PaletteOptions,
  ) {
    this.root = root;
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else void this.show();
  }

  close(): void {
    this.root.hidden = true;
    this.opts.doc.output.focus();
  }

  async show(): Promise<void> {
    const covered = this.opts.bundledFont() ? await fontCoverage() : null;
    const search = el("input", {
      type: "search",
      placeholder: "Search by name or U+code",
      className: "filter",
    });
    const select = el("select", { title: "Vedic tradition" });
    for (const t of TRADITIONS) {
      select.append(
        el(
          "option",
          { value: t.id, selected: t.id === this.opts.tradition() },
          t.label,
        ),
      );
    }
    const body = el("div", { className: "palette-body" });

    const button = (s: Symbol, label?: string, input?: string) => {
      const missing = covered !== null && !covered.has(s.cp);
      const b = el(
        "button",
        {
          type: "button",
          className: missing ? "symbol missing" : "symbol",
          title: `${label ? label + " — " : ""}${s.name} ${codePoint(s.cp)}${missing ? " — no glyph in the bundled font" : ""}`,
        },
        el("span", { className: "glyph" }, display(s)),
        el("span", { className: "label" }, label ?? s.name.toLowerCase()),
        el(
          "span",
          { className: "code" },
          codePoint(s.cp) +
            (input ? `  ${input}` : "") +
            (missing ? "  no glyph" : ""),
        ),
      );
      b.dataset.search =
        `${label ?? ""} ${s.name} ${codePoint(s.cp)}`.toLowerCase();
      // Keep the output cursor where it is.
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () =>
        this.opts.doc.insertInOutput(String.fromCodePoint(s.cp)),
      );
      return b;
    };

    const group = (
      title: string,
      note: string | null,
      buttons: HTMLElement[],
    ) =>
      el(
        "section",
        { className: "palette-group" },
        el("h3", {}, title),
        ...(note ? [el("p", { className: "muted" }, note)] : []),
        el("div", { className: "palette-grid" }, ...buttons),
      );

    const render = () => {
      const t = TRADITIONS.find((x) => x.id === select.value) ?? TRADITIONS[0]!;
      body.replaceChildren(
        group(
          `Accents — ${t.label}`,
          t.note,
          t.marks.map((m) =>
            button(
              BY_CODE_POINT.get(m.cp) ?? {
                cp: m.cp,
                name: codePoint(m.cp),
                category: "Mn",
              },
              m.label,
              m.input,
            ),
          ),
        ),
        group(
          "Signs",
          null,
          SIGNS.map((s) => button(s)),
        ),
        group(
          "Vedic Extensions",
          "Unicode names; traditional meanings not yet verified.",
          VEDIC_EXTENSIONS.map((s) => button(s)),
        ),
        group(
          "Devanagari Extended",
          "Includes Sāmaveda numerals and candrabindu forms.",
          DEVANAGARI_EXTENDED.map((s) => button(s)),
        ),
      );
      filter();
    };

    const filter = () => {
      const q = search.value.trim().toLowerCase();
      for (const b of body.querySelectorAll<HTMLElement>("button.symbol")) {
        b.hidden = q !== "" && !b.dataset.search!.includes(q);
      }
      for (const g of body.querySelectorAll<HTMLElement>(".palette-group")) {
        g.hidden =
          g.querySelectorAll("button.symbol:not([hidden])").length === 0;
      }
    };

    select.addEventListener("change", () => {
      this.opts.setTradition(select.value);
      render();
    });
    search.addEventListener("input", filter);
    const close = el(
      "button",
      { type: "button", title: "Close (Esc)" },
      "Close",
    );
    close.addEventListener("click", () => this.close());

    this.root.replaceChildren(
      el(
        "div",
        { className: "palette-head" },
        el("strong", {}, "Vedic symbols"),
        select,
        search,
        close,
      ),
      body,
      ...(covered === null && !this.opts.bundledFont()
        ? [
            el(
              "p",
              { className: "muted" },
              "Glyph coverage is checked only for the bundled Noto font.",
            ),
          ]
        : []),
    );
    render();
    this.root.hidden = false;
    search.focus();
  }
}
