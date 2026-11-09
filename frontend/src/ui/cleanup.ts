// SPDX-License-Identifier: GPL-3.0-or-later

// The Clean up text command (TECH_SPEC §6.8): shows what each fix would
// change in the selection (or the whole output), with a preview, and
// applies the chosen fixes as one undoable step.

import { ALL_FIXES, cleanup, type Fix } from "../conversion/cleanup";
import type { EoLength } from "../conversion/itrans";
import type { EditorDocument } from "../editor/document";
import { alertBox, el, show } from "./dialog";

const LABELS: Record<Fix, string> = {
  "accent-order":
    "Accent before anusvara, visarga or chandrabindu → sign first (भूमि॑ं → भूमिं॑)",
  "double-svarita": "Baraha double svarita U+0953 → U+1CDA",
  "sanskrit-e-o": "Short e/o (ॆ ॊ ऎ ऒ) → Sanskrit e/o (े ो ए ओ)",
  visarga: "Colon after Devanagari or Kannada → visarga (ः ಃ)",
  "taittiriya-anusvara": "Taittirīya (ग्म्) (ग्ग्) → ꣳ ꣴ",
};

const PREVIEW_LINES = 5;

/**
 * With the Kannada/Tamil e/o reading ("dravidian"), short e/o are
 * intended, so that fix starts unchecked.
 */
export async function cleanupCommand(
  doc: EditorDocument,
  eo: EoLength = "sanskrit",
): Promise<void> {
  const lines = doc.outputLines();
  const scope =
    lines.length === doc.output.state.doc.lines
      ? "the whole output"
      : `${lines.length} selected lines`;
  const totals = cleanup(lines.map((l) => l.text).join("\n")).counts;
  const available = ALL_FIXES.filter((f) => totals[f] > 0);
  if (available.length === 0) {
    await alertBox("Clean up text", `Nothing to clean up in ${scope}.`);
    return;
  }

  const boxes = new Map<Fix, HTMLInputElement>();
  const list = el("div", { className: "cleanup-fixes" });
  for (const f of available) {
    const keepShort = f === "sanskrit-e-o" && eo === "dravidian";
    const box = el("input", { type: "checkbox", checked: !keepShort });
    boxes.set(f, box);
    list.append(
      el(
        "label",
        {},
        box,
        `${LABELS[f]} — ${totals[f]}` +
          (keepShort
            ? " (off: this document uses short e/o for Kannada/Tamil)"
            : ""),
      ),
    );
  }
  const preview = el("div", { className: "cleanup-preview" });
  const chosen = () => available.filter((f) => boxes.get(f)!.checked);
  const result = () =>
    lines
      .map((l) => ({
        index: l.index,
        before: l.text,
        after: cleanup(l.text, chosen()).text,
      }))
      .filter((l) => l.after !== l.before);
  const render = () => {
    const changed = result();
    preview.replaceChildren(
      el(
        "p",
        { className: "muted" },
        `${changed.length} ${changed.length === 1 ? "line" : "lines"} will change.`,
      ),
    );
    for (const l of changed.slice(0, PREVIEW_LINES)) {
      preview.append(
        el(
          "div",
          { className: "cleanup-line" },
          el("span", { className: "before" }, l.before),
        ),
        el(
          "div",
          { className: "cleanup-line" },
          el("span", { className: "after" }, l.after),
        ),
      );
    }
    if (changed.length > PREVIEW_LINES)
      preview.append(el("p", { className: "muted" }, "…"));
  };
  for (const box of boxes.values()) box.addEventListener("change", render);
  render();

  const ok = await show(
    "Clean up text",
    [
      `Fixes found in ${scope}. Changed lines are marked as edited (✎); this is one undo step.`,
      list,
      preview,
    ],
    [
      { label: "Cancel", value: false },
      { label: "Apply", value: true, primary: true },
    ],
  );
  if (!ok) return;
  doc.replaceOutputLines(
    result().map((l) => ({ index: l.index, text: l.after })),
    "input.cleanup",
  );
  doc.output.focus();
}
