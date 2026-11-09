// SPDX-License-Identifier: GPL-3.0-or-later

import "./styles.css";
import { transliterate } from "./conversion/itrans";
import { fromDevanagari, type Script } from "./conversion/script";
import { switchScript } from "./model/switch";
import { EditorDocument, type Counts } from "./editor/document";
import { Files } from "./files";
import { fetchHealth } from "./health";
import type { Context } from "./model/segments";
import { ApiError, api, type ClientConfig } from "./services/api";
import { looksLikeBaraha } from "./conversion/baraha";
import { barahaDialog } from "./ui/baraha";
import { cleanupCommand } from "./ui/cleanup";
import { alertBox, confirmBox, el, show } from "./ui/dialog";
import { Palette } from "./ui/palette";

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface LineResult {
  text: string;
  issues: string[];
}

/**
 * Converts an ITRANS line to the given script, with a cache per script,
 * since markers and output both need the result.
 */
function converter(
  devanagariDigits: boolean,
): (line: string, script: Script) => LineResult {
  const caches = new Map<Script, Map<string, LineResult>>();
  return (line, script) => {
    let cache = caches.get(script);
    if (!cache) caches.set(script, (cache = new Map()));
    let r = cache.get(line);
    if (!r) {
      if (cache.size > 20_000) cache.clear();
      const dev = transliterate(line, { devanagariDigits });
      const out = fromDevanagari(dev.text, script);
      r = {
        text: out.text,
        issues: [
          ...dev.issues.map((i) => i.message),
          ...out.issues.map((i) => i.message),
        ],
      };
      cache.set(line, r);
    }
    return r;
  };
}

function showCounts(c: Counts): void {
  const parts = [`${c.segments} ${c.segments === 1 ? "line" : "lines"}`];
  if (c.detached) parts.push(`${c.detached} edited`);
  if (c.stale) parts.push(`${c.stale} out of date`);
  if (c.outputOnly) parts.push(`${c.outputOnly} output-only`);
  if (c.errors) parts.push(`${c.errors} with ITRANS errors`);
  byId("counts").textContent = parts.join(" · ");
}

/** Lists lines that could not be converted exactly (§4.6). */
async function reportSwitch(
  to: Script,
  issues: { line: number; messages: string[] }[],
): Promise<void> {
  const list = el("ul", { className: "issue-list" });
  for (const i of issues.slice(0, 50))
    list.append(el("li", {}, `Line ${i.line}: ${i.messages.join("; ")}`));
  if (issues.length > 50)
    list.append(el("li", {}, `… and ${issues.length - 50} more lines`));
  await show(
    "Some lines could not be converted exactly",
    [
      `Converted to ${to}. These lines were kept or written approximately; Undo (⌘Z in the output pane) switches back.`,
      list,
    ],
    [{ label: "OK", value: true, primary: true }],
  );
}

/** Stops the daemon after confirming unsaved work (§9.7). */
async function quitApp(files: Files): Promise<void> {
  if (
    files.dirty() &&
    !(await confirmBox(
      "Quit with unsaved changes?",
      "Your changes are kept as a recovery snapshot and offered the next time Paramaakshara starts.",
      "Quit",
    ))
  )
    return;
  await files.saveSnapshotNow();
  try {
    await api.shutdown();
  } catch (e) {
    await alertBox(
      "Could not quit",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }
  window.onbeforeunload = null;
  document.body.replaceChildren(
    el(
      "main",
      { className: "stopped" },
      el("h1", {}, "Paramaakshara has stopped"),
      el("p", {}, "You can close this tab."),
    ),
  );
}

function showStatus(name: string, dirty: boolean): void {
  byId("docname").textContent = dirty ? `${name} •` : name;
  byId("save-state").textContent = dirty ? "Unsaved changes" : "Saved";
  document.title = `${dirty ? "• " : ""}${name} — Paramaakshara`;
}

function showBanner(e: unknown): void {
  const banner = byId("banner");
  banner.textContent =
    e instanceof ApiError && e.code === "unauthorized"
      ? "Not signed in, so files cannot be opened or saved. Run the paramaakshara command again to open a signed-in window."
      : `Files are unavailable: ${e instanceof Error ? e.message : String(e)}`;
  banner.hidden = false;
}

async function start(): Promise<{ doc: EditorDocument; files: Files | null }> {
  fetchHealth()
    .then((h) => (byId("version").textContent = h.version))
    .catch(() => (byId("version").textContent = "(daemon not reachable)"));

  let config: ClientConfig | null = null;
  try {
    config = await api.config();
  } catch (e) {
    showBanner(e);
  }

  const convert = converter(config?.editor.digits !== "ascii");
  const scriptSelect = byId<HTMLSelectElement>("script-select");
  const configured = config?.editor.output_script;
  let script: Script =
    configured === "kannada" || configured === "tamil"
      ? configured
      : "devanagari";
  let nextId = 0;
  const context: Context = {
    convert: (s) => convert(s, script).text,
    newId: () => `s${++nextId}`,
  };
  let files: Files | null = null;
  const showScript = () => {
    scriptSelect.value = script;
    byId("converter").textContent =
      `ITRANS 5.3 → ${scriptSelect.selectedOptions[0]?.textContent ?? script}`;
  };
  const doc = new EditorDocument({
    sourceParent: byId("source"),
    outputParent: byId("output"),
    context,
    script,
    // Also called by undo and when a file in another script is opened.
    onScript: (s) => {
      script = s;
      showScript();
      files?.setOutputScript(s);
    },
    issues: (s) => convert(s, script).issues,
    // Baraha text pasted into the ITRANS pane would convert wrongly
    // (q is a letter in ITRANS), so offer to rewrite it first.
    onSourcePaste: (text) => {
      if (!looksLikeBaraha(text)) return false;
      void barahaDialog(doc, (line) => convert(line, script), text);
      return true;
    },
    onChange: (c) => {
      showCounts(c);
      files?.changed();
    },
    confirm: (message) => window.confirm(message),
  });
  showScript();
  scriptSelect.addEventListener("change", () => {
    const to = scriptSelect.value as Script;
    let issues: { line: number; messages: string[] }[] = [];
    doc.switchScript(to, (segs) => {
      const r = switchScript(segs, to, context);
      issues = r.issues;
      return r.segments;
    });
    if (issues.length > 0) void reportSwitch(to, issues);
  });

  byId("regen-line").addEventListener("click", () => doc.regenerateLine());
  byId("regen-all").addEventListener("click", () => doc.regenerateAll());
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-insert]",
  )) {
    // Keep focus (and the cursor) in the output pane.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => doc.insertInOutput(b.dataset.insert!));
  }
  byId("file-export").addEventListener("click", () => files?.exportText());
  byId("cleanup").addEventListener("click", () => void cleanupCommand(doc));
  byId("baraha").addEventListener(
    "click",
    () => void barahaDialog(doc, (line) => convert(line, script)),
  );

  let tradition = config?.editor.vedic_tradition ?? "rigveda";
  const palette = new Palette(byId("palette"), {
    doc,
    tradition: () => files?.tradition() ?? tradition,
    setTradition: (id) => {
      tradition = id;
      files?.setTradition(id);
    },
  });
  byId("palette-toggle").addEventListener("click", () => palette.toggle());
  doc.source.focus();
  if (!config) return { doc, files };

  const f = new Files(doc, context, config, showStatus, (s) =>
    doc.setScript(s),
  );
  files = f;
  const actions: Record<string, () => unknown> = {
    "file-new": () => f.newDocument(),
    "file-open": () => f.open(),
    "file-save": () => f.save(),
    "file-save-as": () => f.saveAs(),
    "file-import": () => f.importFile(),
  };
  const quit = byId<HTMLButtonElement>("quit");
  quit.disabled = false;
  quit.addEventListener("click", () => void quitApp(f));
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
  return { doc, files };
}

// For browser tests: the editor, the file controller and a promise that
// resolves once startup (including the recovery offer) is complete.
declare global {
  interface Window {
    paramaakshara: {
      doc: EditorDocument;
      files: () => Files | null;
      ready: Promise<void>;
    };
  }
}
void start().then(async ({ doc, files }) => {
  let done!: () => void;
  const ready = new Promise<void>((r) => (done = r));
  window.paramaakshara = { doc, files: () => files, ready };
  if (files) await files.offerRecovery();
  done();
});
