// SPDX-License-Identifier: GPL-3.0-or-later

// Pasting text typed in Baraha: shows the text rewritten in ITRANS and
// how it converts, then inserts the ITRANS at the input cursor.

import { barahaToItrans } from "../conversion/baraha";
import type { EoLength } from "../conversion/itrans";
import type { EditorDocument } from "../editor/document";
import { el, show } from "./dialog";

export interface LinePreview {
  text: string;
  issues: string[];
}

const PREVIEW_LINES = 6;

/**
 * Opens the Baraha dialog. With pasted text, it also offers to insert the
 * text unchanged (it may have been ITRANS after all).
 */
export async function barahaDialog(
  doc: EditorDocument,
  convert: (itrans: string) => LinePreview,
  eo: () => EoLength,
  pasted?: string,
): Promise<void> {
  const input = el("textarea", {
    className: "baraha-input",
    rows: 8,
    spellcheck: false,
    placeholder:
      "Paste Baraha text here, e.g.  sa bhUmi#M viqshvato# vRuqtvAtya#…",
    value: pasted ?? "",
  });
  const preview = el("div", { className: "baraha-preview" });
  const render = () => {
    const lines = barahaToItrans(input.value, eo()).split("\n");
    const results = lines.map(convert);
    const problems = results.filter((r) => r.issues.length > 0).length;
    preview.replaceChildren(
      el(
        "p",
        { className: problems ? "error" : "muted" },
        `${lines.length} ${lines.length === 1 ? "line" : "lines"}` +
          (problems
            ? ` · ${problems} with problems (shown with ⚠ after inserting)`
            : ""),
      ),
    );
    lines.slice(0, PREVIEW_LINES).forEach((line, i) => {
      preview.append(
        el("div", { className: "baraha-itrans" }, line),
        el(
          "div",
          { className: "baraha-output", title: results[i]!.issues.join("; ") },
          results[i]!.text,
        ),
      );
    });
    if (lines.length > PREVIEW_LINES)
      preview.append(el("p", { className: "muted" }, "…"));
  };
  input.addEventListener("input", render);
  render();

  const choice = await show(
    pasted === undefined ? "Paste Baraha text" : "This looks like Baraha text",
    [
      "Baraha keys are rewritten in ITRANS: q → _, # → ', $ → ''', : → H, & → .a, S → sh, c → ch, B → bh, G → gh, K → kh, P → ph, J → jh, ou → au, oum → OM, Ru → R^i, ~g → ~N, ~j → ~n.",
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
    doc.insertInSource(barahaToItrans(input.value, eo()));
  else if (choice === "raw" && pasted !== undefined) doc.insertInSource(pasted);
}
