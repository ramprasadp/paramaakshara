// SPDX-License-Identifier: GPL-3.0-or-later

import "./styles.css";
import { EditorDocument, type Counts } from "./editor/document";
import { Files } from "./files";
import { fetchHealth } from "./health";
import type { Context } from "./model/segments";
import { ApiError, api } from "./services/api";

let nextId = 0;
// Placeholder until the ITRANS converter (M6): output equals the input.
const context: Context = { convert: (s) => s, newId: () => `s${++nextId}` };
let files: Files | null = null;

const doc = new EditorDocument({
  sourceParent: document.getElementById("source")!,
  outputParent: document.getElementById("output")!,
  context,
  onChange: (c) => {
    showCounts(c);
    files?.changed();
  },
  confirm: (message) => window.confirm(message),
});

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function showCounts(c: Counts): void {
  const parts = [`${c.segments} ${c.segments === 1 ? "line" : "lines"}`];
  if (c.detached) parts.push(`${c.detached} edited`);
  if (c.stale) parts.push(`${c.stale} out of date`);
  if (c.outputOnly) parts.push(`${c.outputOnly} output-only`);
  byId("counts").textContent = parts.join(" · ");
}

function showStatus(name: string, dirty: boolean): void {
  byId("docname").textContent = dirty ? `${name} •` : name;
  byId("save-state").textContent = dirty ? "Unsaved changes" : "Saved";
  document.title = `${dirty ? "• " : ""}${name} — Paramaakshara`;
}

byId("regen-line").addEventListener("click", () => doc.regenerateLine());
byId("regen-all").addEventListener("click", () => doc.regenerateAll());
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-insert]")) {
  // Keep focus (and the cursor) in the output pane.
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", () => doc.insertInOutput(b.dataset.insert!));
}

async function start(): Promise<void> {
  fetchHealth()
    .then((h) => (byId("version").textContent = h.version))
    .catch(() => (byId("version").textContent = "(daemon not reachable)"));

  let config;
  try {
    config = await api.config();
  } catch (e) {
    const banner = byId("banner");
    banner.textContent =
      e instanceof ApiError && e.code === "unauthorized"
        ? "Not signed in, so files cannot be opened or saved. Run the paramaakshara command again to open a signed-in window."
        : `Files are unavailable: ${e instanceof Error ? e.message : String(e)}`;
    banner.hidden = false;
    return;
  }
  const f = new Files(doc, context, config, showStatus);
  files = f;
  const actions: Record<string, () => unknown> = {
    "file-new": () => f.newDocument(),
    "file-open": () => f.open(),
    "file-save": () => f.save(),
    "file-save-as": () => f.saveAs(),
    "file-import": () => f.importFile(),
  };
  for (const [id, action] of Object.entries(actions)) {
    const b = byId<HTMLButtonElement>(id);
    b.disabled = false;
    b.addEventListener("click", () => void action());
  }
  // ⌘S, ⇧⌘S and ⌘O replace the browser's own save and open (§3.5).
  document.addEventListener(
    "keydown",
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void (e.shiftKey ? f.saveAs() : f.save());
      } else if (key === "o" && !e.shiftKey) {
        e.preventDefault();
        void f.open();
      }
    },
    true,
  );
  await f.offerRecovery();
}

byId("file-export").addEventListener("click", () => {
  if (files) files.exportText();
});

doc.source.focus();
const ready = start();

// For browser tests.
declare global {
  interface Window {
    paramaakshara: {
      doc: EditorDocument;
      files: () => Files | null;
      ready: Promise<void>;
    };
  }
}
window.paramaakshara = { doc, files: () => files, ready };
