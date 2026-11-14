// SPDX-License-Identifier: GPL-3.0-or-later

// Opening, saving, importing, exporting and recovering documents
// (TECH_SPEC §10).

import { barahaToItrans } from "./conversion/baraha";
import { CONVERTER_VERSION } from "./conversion/itrans";
import type { EditorDocument } from "./editor/document";
import {
  FormatError,
  fileKind,
  load,
  lostOnSave,
  serialise,
  toProject,
  type FileKind,
  type Loaded,
  type Settings,
} from "./model/project";
import { fromProject, projectScript } from "./model/project";
import type { Script } from "./conversion/script";
import { outputText, sourceText, type Context } from "./model/segments";
import { ApiError, api, type ClientConfig } from "./services/api";
import { alertBox, closeDialog, confirmBox, el, show } from "./ui/dialog";
import { printLines, rememberedOptions } from "./ui/pdf";

interface Current {
  name: string;
  root: string | null;
  path: string | null;
  kind: FileKind;
  revision: string;
  bom: boolean;
  lineEnding: "lf" | "crlf";
}

const untitled = (): Current => ({
  name: "Untitled",
  root: null,
  path: null,
  kind: "project",
  revision: "",
  bom: false,
  lineEnding: "lf",
});

export class Files {
  private current = untitled();
  /** Project serialisation at the last open or save; "" forces dirty. */
  private saved: string;
  private lastSnapshot = "";
  private quitting = false;
  /** Folders chosen in the system folder picker, until the page closes. */
  private picked: { root: string; name: string }[] = [];
  private lastExportRoot: string | null = null;
  private settings: Settings;
  private readonly recoveryKey: string;
  private readonly onStatus: (name: string, dirty: boolean) => void;

  constructor(
    private readonly doc: EditorDocument,
    private readonly ctx: Context,
    private readonly config: ClientConfig,
    onStatus: (name: string, dirty: boolean) => void,
    /** Sets the output script before a project in that script is read. */
    private readonly useScript: (script: Script) => void = () => {},
  ) {
    this.onStatus = onStatus;
    const e = config.editor;
    // Only the document settings of §10.3 go into project files.
    this.settings = {
      input_scheme: e.input_scheme,
      output_script: e.output_script,
      tamil_convention: e.tamil_convention,
      vedic_tradition: e.vedic_tradition,
    };
    this.saved = this.project();
    this.recoveryKey = recoveryKey();
    setInterval(
      () => void this.snapshot(),
      config.recovery_interval_seconds * 1000,
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.snapshot(true);
    });
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty() && !this.quitting) e.preventDefault();
    });
    this.report();
  }

  private project(): string {
    return toProject(this.doc.segments, this.settings, CONVERTER_VERSION);
  }

  /** The output script is a document setting (§4.6), saved with it. */
  setOutputScript(script: Script): void {
    if (this.settings.output_script === script) return;
    this.settings = { ...this.settings, output_script: script };
    this.report();
  }

  private useProjectScript(json: string): void {
    const s = projectScript(json);
    if (s) this.useScript(s);
  }

  /** The document's Vedic tradition (§6.4); stored in the project file. */
  tradition(): string {
    return this.settings.vedic_tradition;
  }

  setTradition(id: string): void {
    this.settings = { ...this.settings, vedic_tradition: id };
    this.report();
  }

  dirty(): boolean {
    return this.project() !== this.saved;
  }

  /** Called after every change to the document. */
  changed(): void {
    this.report();
  }

  private report(): void {
    this.onStatus(this.current.name, this.dirty());
  }

  private async discardOk(): Promise<boolean> {
    return (
      !this.dirty() ||
      confirmBox(
        "Discard unsaved changes?",
        `${this.current.name} has unsaved changes.`,
        "Discard",
      )
    );
  }

  private setDocument(loaded: Loaded, current: Current, clean: boolean): void {
    this.doc.load(loaded.segments);
    if (loaded.settings) this.settings = loaded.settings;
    this.current = current;
    this.saved = clean ? this.project() : "";
    this.report();
    if (loaded.changedByConverter > 0) {
      const n = loaded.changedByConverter;
      void alertBox(
        "Some lines were kept as saved",
        `${n} ${n === 1 ? "line differs" : "lines differ"} from what the current converter produces. ` +
          "The saved text was kept and marked out of date (✎!); use Regenerate to update it.",
      );
    }
  }

  async newDocument(): Promise<void> {
    if (!(await this.discardOk())) return;
    this.setDocument(
      { segments: [], settings: null, changedByConverter: 0 },
      untitled(),
      true,
    );
    await this.dropSnapshot();
  }

  async open(): Promise<void> {
    if (!(await this.discardOk())) return;
    const choice = await this.pickFile();
    if (choice) await this.openFile(choice.root, choice.path);
  }

  private async openFile(root: string, path: string): Promise<void> {
    try {
      const d = await api.open(root, path);
      const kind = fileKind(path);
      if (kind === "project") this.useProjectScript(d.content);
      const loaded = load(kind, d.content, this.ctx);
      this.setDocument(
        loaded,
        {
          name: basename(path),
          root,
          path,
          kind,
          revision: d.revision,
          bom: d.bom,
          lineEnding: d.line_ending,
        },
        true,
      );
      await this.dropSnapshot();
    } catch (e) {
      await this.fail(`Could not open ${path}`, e);
    }
  }

  /** Lists the documents of a folder and lets the user pick one. */
  private async pickFile(): Promise<{ root: string; path: string } | null> {
    let root = this.current.root ?? this.config.roots[0]!;
    let picked: { root: string; path: string } | null = null;
    const list = el("ul", { className: "file-list" });
    const filter = el("input", {
      type: "search",
      placeholder: "Filter",
      className: "filter",
    });
    const select = el("select");
    for (const r of this.config.roots)
      select.append(el("option", { value: r, selected: r === root }, r));
    const fill = async () => {
      list.replaceChildren(el("li", { className: "muted" }, "Loading…"));
      try {
        const entries = await api.list(root);
        const f = filter.value.toLowerCase();
        const shown = entries.filter((e) => e.path.toLowerCase().includes(f));
        list.replaceChildren();
        if (shown.length === 0)
          list.append(el("li", { className: "muted" }, "No documents."));
        for (const e of shown) {
          const b = el("button", { type: "button", className: "file" }, e.path);
          b.addEventListener("click", () => {
            picked = { root, path: e.path };
            closeDialog();
          });
          list.append(el("li", {}, b));
        }
      } catch (e) {
        list.replaceChildren(
          el(
            "li",
            { className: "error" },
            e instanceof Error ? e.message : String(e),
          ),
        );
      }
    };
    select.addEventListener("change", () => {
      root = select.value;
      void fill();
    });
    filter.addEventListener("input", () => void fill());
    const body: Node[] = [];
    if (this.config.roots.length > 1)
      body.push(el("label", {}, "Folder ", select));
    body.push(filter, list);
    const done = show("Open", body, [{ label: "Cancel", value: null }]);
    await fill();
    await done;
    return picked;
  }

  async save(): Promise<void> {
    if (this.current.root === null || this.current.path === null)
      return this.saveAs();
    await this.write(
      this.current.root,
      this.current.path,
      this.current.revision,
    );
  }

  async saveAs(): Promise<void> {
    const select = el("select");
    for (const r of this.config.roots) {
      select.append(
        el(
          "option",
          {
            value: r,
            selected: r === (this.current.root ?? this.config.roots[0]),
          },
          r,
        ),
      );
    }
    const input = el("input", {
      type: "text",
      value: this.current.path ?? suggestedName(this.current),
      className: "path",
      spellcheck: false,
    });
    const hint = el(
      "p",
      { className: "muted" },
      "Use .paramaakshara.json to keep the ITRANS, the output and the edit markers; .txt for the Unicode output only; .itx for ITRANS only.",
    );
    const ok = await show(
      "Save as",
      [
        el("label", {}, "Folder ", select),
        el("label", {}, "File ", input),
        hint,
      ],
      [
        { label: "Cancel", value: false },
        { label: "Save", value: true, primary: true },
      ],
    );
    if (!ok) return;
    const path = input.value.trim();
    if (path === "") return;
    await this.write(select.value, path, "", true);
  }

  /** Saves to root/path, expecting baseRevision on disk. */
  private async write(
    root: string,
    path: string,
    baseRevision: string,
    isNew = false,
  ): Promise<void> {
    const kind = fileKind(path);
    const lost = lostOnSave(kind, this.doc.segments);
    if (lost && !(await confirmBox("Save as plain file?", lost, "Save")))
      return;
    const same = root === this.current.root && path === this.current.path;
    const content = serialise(
      kind,
      this.doc.segments,
      this.settings,
      CONVERTER_VERSION,
    );
    try {
      const revision = await api.save({
        root,
        path,
        base_revision: baseRevision,
        content,
        bom: same ? this.current.bom : false,
        line_ending: same ? this.current.lineEnding : "lf",
      });
      this.current = {
        ...this.current,
        name: basename(path),
        root,
        path,
        kind,
        revision,
      };
      if (!same)
        this.current = { ...this.current, bom: false, lineEnding: "lf" };
      this.saved = this.project();
      this.report();
      await this.dropSnapshot();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        await this.conflict(root, path, e, isNew);
      } else {
        await this.fail(`Could not save ${path}`, e);
      }
    }
  }

  private async conflict(
    root: string,
    path: string,
    e: ApiError,
    isNew: boolean,
  ): Promise<void> {
    if (isNew && e.currentRevision) {
      if (
        await confirmBox(
          "Replace existing file?",
          `${path} already exists in ${root}.`,
          "Replace",
        )
      ) {
        await this.write(root, path, e.currentRevision);
      }
      return;
    }
    const choice = await show(
      "The file changed on disk",
      [`${e.message} Your changes are not saved yet.`],
      [
        { label: "Cancel", value: "cancel" },
        { label: "Reload from disk", value: "reload" },
        { label: "Save as…", value: "saveas" },
        { label: "Overwrite", value: "overwrite", primary: true },
      ],
    );
    if (choice === "overwrite")
      await this.write(root, path, e.currentRevision ?? "");
    else if (choice === "saveas") await this.saveAs();
    else if (
      choice === "reload" &&
      (await confirmBox(
        "Reload from disk?",
        "Your unsaved changes will be lost.",
        "Reload",
      ))
    ) {
      await this.openFile(root, path);
    }
  }

  /** Imports a file chosen from anywhere on the computer, in the browser. */
  async importFile(): Promise<void> {
    if (!(await this.discardOk())) return;
    const input = el("input", { type: "file", accept: ".txt,.itx,.json" });
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener(
        "change",
        () => resolve(input.files?.[0] ?? null),
        { once: true },
      );
      input.click();
    });
    if (!file) return;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      await alertBox(
        "Cannot import",
        `${file.name} is not valid UTF-8 text. Nothing was changed.`,
      );
      return;
    }
    const bom = text.startsWith("﻿");
    const lineEnding = text.includes("\r\n") ? "crlf" : "lf";
    text = (bom ? text.slice(1) : text).replaceAll("\r\n", "\n");
    let kind = fileKind(file.name);
    if (kind === "text") {
      const as = await show<FileKind | "baraha">(
        "Import as",
        [`How should ${file.name} be read?`],
        [
          { label: "Baraha source", value: "baraha" },
          { label: "ITRANS input", value: "itrans" },
          { label: "Unicode output", value: "text", primary: true },
        ],
      );
      if (!as) return;
      if (as === "baraha") text = barahaToItrans(text);
      kind = as === "baraha" ? "itrans" : as;
    }
    try {
      const loaded = load(kind, text, this.ctx);
      // Not saved anywhere yet: Save asks for a folder and name.
      this.setDocument(
        loaded,
        { ...untitled(), name: file.name, kind, bom, lineEnding },
        false,
      );
    } catch (e) {
      await this.fail(`Could not import ${file.name}`, e);
    }
  }

  documentName(): string {
    return this.current.name;
  }

  /** Downloads the Unicode output as a plain-text file. */
  exportText(): void {
    const blob = new Blob([outputText(this.doc.segments)], {
      type: "text/plain;charset=utf-8",
    });
    const a = el("a", {
      href: URL.createObjectURL(blob),
      download: textName(this.current.name),
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /**
   * Export all (§10.1b): asks for a folder and a name, then writes
   * name.itrans.txt, name.uni.txt and name.pdf there. The daemon makes
   * the PDF with a headless browser; without one, the print dialog opens.
   */
  async exportAll(): Promise<void> {
    const select = el("select");
    const root =
      this.lastExportRoot ?? this.current.root ?? this.config.roots[0]!;
    const addOption = (value: string, label: string) =>
      select.append(el("option", { value, selected: value === root }, label));
    for (const r of this.config.roots) addOption(r, r);
    for (const p of this.picked) addOption(p.root, p.name);
    const choose = el("button", { type: "button" }, "Choose…");
    const pickError = el("p", { className: "error", hidden: true });
    choose.addEventListener("click", () => {
      void (async () => {
        pickError.hidden = true;
        choose.disabled = true;
        try {
          const p = await api.pickFolder(select.value);
          if (!p) return;
          let option = [...select.options].find(
            (o) => o.value === p.root && o.textContent === p.name,
          );
          if (!option) {
            this.picked.push(p);
            option = el("option", { value: p.root }, p.name);
            select.append(option);
          }
          option.selected = true;
        } catch (e) {
          pickError.textContent = e instanceof Error ? e.message : String(e);
          pickError.hidden = false;
        } finally {
          choose.disabled = false;
        }
      })();
    });
    const input = el("input", {
      type: "text",
      value: exportBase(this.current.path ?? this.current.name),
      className: "path",
      spellcheck: false,
    });
    const ok = await show(
      "Export all",
      [
        el("label", {}, "Folder ", select, " ", choose),
        pickError,
        el("label", {}, "Name ", input),
        el(
          "p",
          { className: "muted" },
          "Writes name.itrans.txt (the ITRANS input), name.uni.txt (the Unicode output) and name.pdf in the folder. " +
            "A name may include subfolders, as in rigveda/purusha-sukta.",
        ),
      ],
      [
        { label: "Cancel", value: false },
        { label: "Export", value: true, primary: true },
      ],
    );
    if (!ok) return;
    const base = exportBase(input.value.trim());
    if (base === "") return;
    const folder = select.value;
    const folderName = select.selectedOptions[0]?.textContent ?? folder;
    this.lastExportRoot = folder;
    const lines = outputText(this.doc.segments).split("\n");
    const text = (path: string, content: string) => (rev: string) =>
      api.save({
        root: folder,
        path,
        base_revision: rev,
        content,
        bom: false,
        line_ending: "lf",
      });
    const name = basename(base);
    const pdf = rememberedOptions("", name);
    const exports = [
      {
        path: `${base}.itrans.txt`,
        send: text(`${base}.itrans.txt`, sourceText(this.doc.segments)),
      },
      {
        path: `${base}.uni.txt`,
        send: text(`${base}.uni.txt`, outputText(this.doc.segments)),
      },
      {
        path: `${base}.pdf`,
        send: (rev: string) =>
          api.exportPdf({
            root: folder,
            path: `${base}.pdf`,
            base_revision: rev,
            title: pdf.title,
            page: pdf.page,
            size_pt: pdf.sizePt,
            lines,
          }),
      },
    ];
    let replace = false;
    for (const f of exports) {
      const written = await this.writeExport(folderName, f, replace);
      if (written === "unavailable") return this.printInstead(lines, name, f);
      if (written === null) return;
      replace ||= written === "replaced";
    }
    await alertBox(
      "Exported",
      `Wrote ${exports.map((f) => f.path).join(", ")} in ${folderName}.`,
    );
  }

  /** Without a browser for the daemon, the PDF is printed from here. */
  private async printInstead(
    lines: string[],
    name: string,
    f: { path: string },
  ): Promise<void> {
    const next = await show(
      "Export all: PDF",
      [
        "The text files were written, but no Chrome, Edge or Chromium was found to make the PDF " +
          "(see pdf.browser in the configuration file).",
        `In the print dialog, choose Save as PDF and save ${f.path} in the same folder. ` +
          "Turn off “Headers and footers” for a clean page.",
      ],
      [
        { label: "Skip PDF", value: false },
        { label: "Print / Save as PDF", value: true, primary: true },
      ],
    );
    if (next) await printLines(lines, rememberedOptions("", name));
  }

  /**
   * Writes one exported file, asking before replacing an existing one
   * unless replacing was already confirmed. Resolves with null when
   * cancelled or failed. folderName is only for messages.
   */
  private async writeExport(
    folderName: string,
    f: { path: string; send: (baseRevision: string) => Promise<string> },
    replace: boolean,
    baseRevision = "",
  ): Promise<"written" | "replaced" | "unavailable" | null> {
    // Making a PDF takes a few seconds.
    const pdf = f.path.endsWith(".pdf");
    const busy = pdf ? show("Export all", [`Making ${f.path}…`], []) : null;
    let error: unknown = null;
    try {
      await f.send(baseRevision);
    } catch (e) {
      error = e;
    }
    if (busy) {
      // Its close event fires later; let it pass before the next dialog.
      closeDialog();
      await busy;
    }
    if (error === null) return baseRevision === "" ? "written" : "replaced";
    if (error instanceof ApiError && error.code === "unavailable")
      return "unavailable";
    if (
      error instanceof ApiError &&
      error.code === "conflict" &&
      error.currentRevision &&
      baseRevision === ""
    ) {
      if (
        !replace &&
        !(await confirmBox(
          "Replace existing files?",
          `${f.path} already exists in ${folderName}. Export all replaces the exported files that already exist.`,
          "Replace",
        ))
      )
        return null;
      return this.writeExport(folderName, f, true, error.currentRevision);
    }
    await this.fail(`Could not export ${f.path}`, error);
    return null;
  }

  // --- Recovery (§10.4) ---------------------------------------------------

  private async snapshot(keepalive = false): Promise<void> {
    if (!this.dirty()) return;
    const project = this.project();
    if (project === this.lastSnapshot) return;
    try {
      await api.putSnapshot(
        this.recoveryKey,
        {
          name: this.current.name,
          root: this.current.root ?? undefined,
          path: this.current.path ?? undefined,
          base_revision: this.current.revision,
          project: JSON.parse(project) as unknown,
        },
        keepalive && project.length < 60_000, // browsers cap keepalive bodies at 64 KB
      );
      this.lastSnapshot = project;
    } catch {
      // Retried at the next interval.
    }
  }

  /** Stores a recovery snapshot now if there are unsaved changes. */
  async saveSnapshotNow(): Promise<void> {
    await this.snapshot();
    this.quitting = true;
  }

  private async dropSnapshot(): Promise<void> {
    this.lastSnapshot = "";
    await api.deleteSnapshot(this.recoveryKey).catch(() => {});
  }

  /** Offers to restore unsaved work found at startup. */
  async offerRecovery(): Promise<void> {
    let snapshots;
    try {
      snapshots = await api.snapshots();
    } catch {
      return;
    }
    for (const s of snapshots) {
      const when = new Date(s.saved_at).toLocaleString();
      const choice = await show(
        "Unsaved work found",
        [
          `${s.name}${s.path ? ` (${s.root}/${s.path})` : ""}, last changed ${when}, was not saved.`,
        ],
        [
          { label: "Discard", value: "discard" },
          { label: "Later", value: "later" },
          { label: "Restore", value: "restore", primary: true },
        ],
      );
      if (choice === "discard") await api.deleteSnapshot(s.key).catch(() => {});
      if (choice !== "restore") continue;
      try {
        const full = await api.snapshot(s.key);
        const json = JSON.stringify(full.project);
        this.useProjectScript(json);
        const loaded = fromProject(json, this.ctx);
        const kind = s.path ? fileKind(s.path) : "project";
        this.setDocument(
          loaded,
          {
            ...untitled(),
            name: s.name,
            root: s.root ?? null,
            path: s.path ?? null,
            kind,
            revision: s.base_revision ?? "",
          },
          false,
        );
        // Keep it safe under this tab's key before removing the old one.
        await this.snapshot();
        if (s.key !== this.recoveryKey)
          await api.deleteSnapshot(s.key).catch(() => {});
        return;
      } catch (e) {
        await this.fail("Could not restore", e);
      }
    }
  }

  private async fail(title: string, e: unknown): Promise<void> {
    const message =
      e instanceof ApiError || e instanceof FormatError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    await alertBox(title, message);
  }
}

function recoveryKey(): string {
  const name = "paramaakshara-recovery-key";
  try {
    const existing = sessionStorage.getItem(name);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(name, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function suggestedName(c: Current): string {
  const base = c.name.replace(/\.(paramaakshara\.json|txt|itx|json)$/i, "");
  return `${base === "Untitled" ? "untitled" : base}.paramaakshara.json`;
}

/** A document path or name without its file extension, for Export all. */
function exportBase(name: string): string {
  const base = name.replace(
    /\.(paramaakshara\.json|itrans\.txt|uni\.txt|txt|itx|json|pdf)$/i,
    "",
  );
  return base === "Untitled" ? "untitled" : base;
}

function textName(name: string): string {
  return name.replace(/\.(paramaakshara\.json|txt|itx|json)$/i, "") + ".txt";
}
