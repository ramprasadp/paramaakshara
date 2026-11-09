// SPDX-License-Identifier: GPL-3.0-or-later

import "./styles.css";
import { EditorDocument, type Counts } from "./editor/document";
import { fetchHealth } from "./health";

let nextId = 0;

const doc = new EditorDocument({
  sourceParent: document.getElementById("source")!,
  outputParent: document.getElementById("output")!,
  // Placeholder until the ITRANS converter (M6): output equals the input.
  context: { convert: (s) => s, newId: () => `s${++nextId}` },
  onChange: showCounts,
  confirm: (message) => window.confirm(message),
});

function showCounts(c: Counts): void {
  const parts = [`${c.segments} ${c.segments === 1 ? "line" : "lines"}`];
  if (c.detached) parts.push(`${c.detached} edited`);
  if (c.stale) parts.push(`${c.stale} out of date`);
  if (c.outputOnly) parts.push(`${c.outputOnly} output-only`);
  document.getElementById("counts")!.textContent = parts.join(" · ");
}

document
  .getElementById("regen-line")!
  .addEventListener("click", () => doc.regenerateLine());
document
  .getElementById("regen-all")!
  .addEventListener("click", () => doc.regenerateAll());
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-insert]")) {
  // Keep focus (and the cursor) in the output pane.
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", () => doc.insertInOutput(b.dataset.insert!));
}

fetchHealth()
  .then((h) => {
    document.getElementById("version")!.textContent = h.version;
  })
  .catch(() => {
    document.getElementById("version")!.textContent = "(daemon not reachable)";
  });

doc.source.focus();

// For browser tests.
declare global {
  interface Window {
    paramaakshara: { doc: EditorDocument };
  }
}
window.paramaakshara = { doc };
