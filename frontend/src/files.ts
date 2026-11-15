// SPDX-License-Identifier: GPL-3.0-or-later

// Opening, saving, importing, exporting and recovering documents
// (TECH_SPEC §10).

import { barahaToItrans } from "./conversion/baraha";
import type { EditorDocument } from "./editor/document";
import { ApiError, api, type ClientConfig } from "./services/api";
import { alertBox, closeDialog, confirmBox, el, show } from "./ui/dialog";
import { printLines, rememberedOptions } from "./ui/pdf";

interface Current {
  name: string;
  root: string | null;
  path: string | null;
  revision: string;
  bom: boolean;
  lineEnding: "lf" | "crlf";
}

const untitled = (): Current => ({
  name: "Untitled",
  root: null,
  path: null,
  revision: "",
  bom: false,
  lineEnding: "lf",
});

/** Documents are saved as ITRANS text (§10.3). */
const EXTENSION = ".itx";

export class Files {
  private current = untitled();
  /** ITRANS text at the last open or save; null forces dirty. */
  private saved: string | null;
  private lastSnapshot = "";
  private quitting = false;
  /** Folders chosen in the system folder picker, until the page closes. */
  private picked: { root: string; name: string }[] = [];
  private lastExportRoot: string | null = null;
  private readonly recoveryKey: string;
  private readonly onStatus: (name: string, dirty: boolean) => void;

  constructor(
    private readonly doc: EditorDocument,
    private readonly config: ClientConfig,
    onStatus: (name: string, dirty: boolean) => void,
    /** Opens Import Unicode with a file's text (§6.9). */
    private readonly importUnicode: (text: string, title: string) => unknown,
  ) {
    this.onStatus = onStatus;
    this.saved = this.doc.sourceText();
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

  dirty(): boolean {
    return this.doc.sourceText() !== this.saved;
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

  private setDocument(text: string, current: Current, clean: boolean): void {
    this.doc.load(text);
    this.current = current;
    this.saved = clean ? text : null;
    this.report();
  }

  async newDocument(): Promise<void> {
    if (!(await this.discardOk())) return;
    this.setDocument("", untitled(), true);
    await this.dropSnapshot();
  }

  /**
   * Open (§10.1b): the system file picker, so any .itx or .txt file can
   * be opened; the list of document folders where there is no picker
   * (for example in the container).
   */
  async open(): Promise<void> {
    if (!(await this.discardOk())) return;
    let choice: { root: string; path: string } | null;
    try {
      const p = await api.pickFile(this.current.root ?? this.config.roots[0]!);
      if (!p) return;
      if (!this.picked.some((x) => x.root === p.root))
        this.picked.push({ root: p.root, name: p.name });
      choice = { root: p.root, path: p.path };
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "unavailable"))
        return this.fail("Could not open", e);
      choice = await this.pickFile();
    }
    if (choice) await this.openFile(choice.root, choice.path);
  }

  private async openFile(root: string, path: string): Promise<void> {
    try {
      const d = await api.open(root, path);
      this.setDocument(
        d.content,
        {
          name: basename(path),
          root,
          path,
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

  /**
   * Lists the documents of a folder and lets the user pick one; Open
   * without a system file picker.
   */
  private async pickFile(): Promise<{ root: string; path: string } | null> {
    let root = this.current.root ?? this.config.roots[0]!;
    let picked: { root: string; path: string } | null = null;
    const list = el("ul", { className: "file-list" });
    const filter = el("input", {
      type: "search",
      placeholder: "Filter",
      className: "filter",
    });
    const folder = this.folderChooser(root, () => {
      root = folder.select.value;
      void fill();
    });
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
    filter.addEventListener("input", () => void fill());
    const done = show(
      "Open",
      [...folder.nodes, filter, list],
      [{ label: "Cancel", value: null }],
    );
    filter.focus();
    await fill();
    await done;
    return picked;
  }

  async save(): Promise<void> {
    // A .txt file is opened as ITRANS but saved only as .itx (§10.1).
    if (
      this.current.root === null ||
      this.current.path === null ||
      !this.current.path.toLowerCase().endsWith(EXTENSION)
    )
      return this.saveAs();
    await this.write(
      this.current.root,
      this.current.path,
      this.current.revision,
    );
  }

  async saveAs(): Promise<void> {
    const folder = this.folderChooser(
      this.current.root ?? this.config.roots[0]!,
    );
    const input = el("input", {
      type: "text",
      value:
        (this.current.path && itxPath(this.current.path)) ??
        suggestedName(this.current),
      className: "path",
      spellcheck: false,
    });
    const hint = el(
      "p",
      { className: "muted" },
      "Saves the ITRANS as a .itx file. To keep the Unicode output, copy it or use Export .txt, Export PDF or Export all.",
    );
    const ok = await show(
      "Save as",
      [...folder.nodes, el("label", {}, "File ", input), hint],
      [
        { label: "Cancel", value: false },
        { label: "Save", value: true, primary: true },
      ],
    );
    if (!ok) return;
    const path = itxPath(input.value.trim());
    if (path === null) return;
    await this.write(folder.select.value, path, "", true);
  }

  /** Saves to root/path, expecting baseRevision on disk. */
  private async write(
    root: string,
    path: string,
    baseRevision: string,
    isNew = false,
  ): Promise<void> {
    const same = root === this.current.root && path === this.current.path;
    const content = this.doc.sourceText();
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
        revision,
      };
      if (!same)
        this.current = { ...this.current, bom: false, lineEnding: "lf" };
      this.saved = content;
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
          `${path} already exists in ${this.folderName(root)}.`,
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

  /**
   * Imports a file chosen from anywhere on the computer, in the browser,
   * as a new untitled document: ITRANS as it is, Baraha source rewritten
   * in ITRANS, or Unicode text through Import Unicode (§6.9).
   */
  async importFile(): Promise<void> {
    if (!(await this.discardOk())) return;
    const input = el("input", { type: "file", accept: ".txt,.itx" });
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
    const bom = text.startsWith("\uFEFF");
    const lineEnding: Current["lineEnding"] = text.includes("\r\n")
      ? "crlf"
      : "lf";
    text = (bom ? text.slice(1) : text).replaceAll("\r\n", "\n");
    const as = file.name.toLowerCase().endsWith(EXTENSION)
      ? "itrans"
      : await show<"itrans" | "baraha" | "unicode">(
          "Import as",
          [`How should ${file.name} be read?`],
          [
            { label: "Baraha source", value: "baraha" },
            { label: "Unicode text", value: "unicode" },
            { label: "ITRANS", value: "itrans", primary: true },
          ],
        );
    if (!as) return;
    // Not saved anywhere yet: Save asks for a folder and name.
    const current = { ...untitled(), name: file.name, bom, lineEnding };
    if (as === "unicode") {
      this.setDocument("", current, false);
      await this.importUnicode(text, `Import ${file.name}`);
      return;
    }
    this.setDocument(
      as === "baraha" ? barahaToItrans(text) : text,
      current,
      false,
    );
  }

  documentName(): string {
    return this.current.name;
  }

  /** Downloads the Unicode output as a plain-text file. */
  exportText(): void {
    const blob = new Blob([this.doc.outputText()], {
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
   * The folder list of the Open, Save as and Export all dialogs, with
   * Choose… for a folder from the system folder picker (§9.4, §10.1b).
   * The onChange callback runs when the selected folder changes.
   */
  private folderChooser(
    selected: string,
    onChange: () => void = () => {},
  ): { select: HTMLSelectElement; nodes: Node[] } {
    const select = el("select");
    const addOption = (value: string, label: string) =>
      select.append(
        el("option", { value, selected: value === selected }, label),
      );
    for (const r of this.config.roots) addOption(r, r);
    for (const p of this.picked) addOption(p.root, p.name);
    select.addEventListener("change", onChange);
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
          onChange();
        } catch (e) {
          pickError.textContent = e instanceof Error ? e.message : String(e);
          pickError.hidden = false;
        } finally {
          choose.disabled = false;
        }
      })();
    });
    return {
      select,
      nodes: [el("label", {}, "Folder ", select, " ", choose), pickError],
    };
  }

  /** The name shown for a folder: picked folders have an opaque root. */
  private folderName(root: string): string {
    return this.picked.find((p) => p.root === root)?.name ?? root;
  }

  /**
   * Export all (§10.1b): asks for a folder and a name, then writes
   * name.itrans.txt, name.uni.txt and name.pdf there. The daemon makes
   * the PDF with a headless browser; without one, the print dialog opens.
   */
  async exportAll(): Promise<void> {
    const folder = this.folderChooser(
      this.lastExportRoot ?? this.current.root ?? this.config.roots[0]!,
    );
    const input = el("input", {
      type: "text",
      value: exportBase(this.current.path ?? this.current.name),
      className: "path",
      spellcheck: false,
    });
    const ok = await show(
      "Export all",
      [
        ...folder.nodes,
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
    const root = folder.select.value;
    const folderName = this.folderName(root);
    this.lastExportRoot = root;
    const lines = this.doc.outputText().split("\n");
    const text = (path: string, content: string) => (rev: string) =>
      api.save({
        root,
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
        send: text(`${base}.itrans.txt`, this.doc.sourceText()),
      },
      {
        path: `${base}.uni.txt`,
        send: text(`${base}.uni.txt`, this.doc.outputText()),
      },
      {
        path: `${base}.pdf`,
        send: (rev: string) =>
          api.exportPdf({
            root,
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
    const itrans = this.doc.sourceText();
    if (itrans === this.lastSnapshot) return;
    try {
      await api.putSnapshot(
        this.recoveryKey,
        {
          name: this.current.name,
          root: this.current.root ?? undefined,
          path: this.current.path ?? undefined,
          base_revision: this.current.revision,
          project: { itrans },
        },
        // Browsers cap keepalive bodies at 64 KB.
        keepalive && JSON.stringify(itrans).length < 60_000,
      );
      this.lastSnapshot = itrans;
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
        const itrans = (full.project as { itrans?: unknown } | undefined)
          ?.itrans;
        if (typeof itrans !== "string")
          throw new Error(
            "This snapshot was made by an older version of Paramaakshara and cannot be restored.",
          );
        this.setDocument(
          itrans,
          {
            ...untitled(),
            name: s.name,
            root: s.root ?? null,
            path: s.path ?? null,
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
    const message = e instanceof Error ? e.message : String(e);
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
  const base = c.name.replace(/\.(itrans\.txt|txt|itx)$/i, "");
  return `${base === "Untitled" ? "untitled" : base}${EXTENSION}`;
}

/** A Save as name as a .itx path (a .txt ending is replaced); null if empty. */
export function itxPath(name: string): string | null {
  const base = name.replace(/\.(itrans\.txt|txt|itx)$/i, "");
  return base === "" ? null : base + EXTENSION;
}

/** A document path or name without its file extension, for Export all. */
function exportBase(name: string): string {
  const base = name.replace(/\.(itrans\.txt|uni\.txt|txt|itx|pdf)$/i, "");
  return base === "Untitled" ? "untitled" : base;
}

function textName(name: string): string {
  return name.replace(/\.(itrans\.txt|txt|itx)$/i, "") + ".txt";
}
