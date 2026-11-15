// SPDX-License-Identifier: GPL-3.0-or-later

// The two editor panes (TECH_SPEC §4, ADR 0006). The input pane holds the
// document, the ITRANS text. The output pane is read-only: output line n
// is always the conversion of input line n, so it is regenerated after
// every input change and has no history of its own. Undo in either pane
// undoes the last input edit (§4.6).

import {
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  drawSelection,
  gutter,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";

import { outputOf } from "../model/lines";

export type Pane = "source" | "output";

export interface Counts {
  lines: number;
  errors: number;
}

const setMarkers = StateEffect.define<RangeSet<GutterMarker>>();

const markersField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMarkers)) return e.value;
    return value.map(tr.changes);
  },
});

// The lines at the cursor or selection, in both panes, while either pane
// has focus (§4.4).
const setPaired = StateEffect.define<DecorationSet>();
const pairedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setPaired)) return e.value;
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
const pairedLine = Decoration.line({ class: "paired-line" });

class ErrorMarker extends GutterMarker {
  constructor(readonly title: string) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof ErrorMarker && other.title === this.title;
  }
  override toDOM(): Node {
    const span = document.createElement("span");
    span.className = "seg-marker seg-error";
    span.textContent = "⚠";
    span.title = this.title;
    return span;
  }
}

export interface Options {
  sourceParent: HTMLElement;
  outputParent: HTMLElement;
  /** Converts one ITRANS line to one output line in the output script. */
  convert: (line: string) => string;
  /** Conversion problems in an ITRANS line, shown as ⚠ (§4.4). */
  issues?: (line: string) => string[];
  /** Initial ITRANS text. */
  text?: string;
  /** Called after every change to the document or its output. */
  onChange?: (counts: Counts) => void;
  /**
   * Called with text pasted into the input pane; returning true means the
   * caller handles it (e.g. offers to convert Baraha text).
   */
  onSourcePaste?: (text: string) => boolean;
}

export class EditorDocument {
  readonly source: EditorView;
  readonly output: EditorView;
  private readonly convert: (line: string) => string;
  private readonly issues: (line: string) => string[];
  private readonly onChange: (counts: Counts) => void;
  private readonly onSourcePaste: (text: string) => boolean;
  private refreshQueued = false;
  private pairQueued = false;

  constructor(opts: Options) {
    this.convert = opts.convert;
    this.issues = opts.issues ?? (() => []);
    this.onChange = opts.onChange ?? (() => {});
    this.onSourcePaste = opts.onSourcePaste ?? (() => false);
    const text = opts.text ?? "";
    this.source = new EditorView({
      parent: opts.sourceParent,
      state: this.sourceState(text),
    });
    this.output = new EditorView({
      parent: opts.outputParent,
      state: this.outputState(text),
    });
    this.refresh();
  }

  /** The document: the ITRANS text of the input pane. */
  sourceText(): string {
    return this.source.state.doc.toString();
  }

  /** The Unicode output, as shown. */
  outputText(): string {
    return this.output.state.doc.toString();
  }

  /** Replaces the whole document, e.g. after opening a file. Clears undo history. */
  load(text: string): void {
    this.source.setState(this.sourceState(text));
    this.output.setState(this.outputState(text));
    this.refresh();
  }

  private sourceState(text: string): EditorState {
    return EditorState.create({
      doc: text,
      extensions: [
        ...this.common("source"),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.domEventHandlers({
          paste: (event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text || !this.onSourcePaste(text)) return false;
            event.preventDefault();
            return true;
          },
        }),
      ],
    });
  }

  private outputState(text: string): EditorState {
    const src = () => this.source;
    return EditorState.create({
      doc: outputOf(text, this.convert),
      extensions: [
        ...this.common("output"),
        EditorState.readOnly.of(true),
        // The output has no history: undo and redo act on the input.
        keymap.of([
          { key: "Mod-z", run: () => undo(src()), preventDefault: true },
          {
            key: "Mod-y",
            mac: "Mod-Shift-z",
            run: () => redo(src()),
            preventDefault: true,
          },
          {
            linux: "Ctrl-Shift-z",
            run: () => redo(src()),
            preventDefault: true,
          },
          ...defaultKeymap,
        ]),
      ],
    });
  }

  private common(pane: Pane): Extension[] {
    return [
      lineNumbers(),
      markersField,
      pairedField,
      gutter({
        class: "seg-gutter",
        markers: (v) => v.state.field(markersField),
      }),
      drawSelection(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => this.update(pane, u)),
    ];
  }

  private update(pane: Pane, u: ViewUpdate): void {
    if (pane === "source" && u.docChanged) this.queueRefresh();
    if (u.selectionSet || u.focusChanged || u.docChanged) this.queuePair();
  }

  // A pane cannot be updated while it is updating, so the output follows
  // straight after the current update.
  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh();
    });
  }

  /**
   * Regenerates the output from the input and updates the markers and
   * counts. Also called when the output script changes (§4.5).
   */
  refresh(): void {
    const text = this.sourceText();
    const want = outputOf(text, this.convert);
    const problems = text.split("\n").map((l) => this.issues(l));
    this.source.dispatch({
      effects: setMarkers.of(markers(text, problems)),
      annotations: Transaction.addToHistory.of(false),
    });
    this.output.dispatch({
      changes: textChange(this.outputText(), want),
      effects: setMarkers.of(markers(want, problems)),
    });
    this.onChange(this.counts());
  }

  counts(): Counts {
    const text = this.sourceText();
    if (text === "") return { lines: 0, errors: 0 };
    const lines = text.split("\n");
    return {
      lines: lines.length,
      errors: lines.filter((l) => this.issues(l).length > 0).length,
    };
  }

  private queuePair(): void {
    if (this.pairQueued) return;
    this.pairQueued = true;
    queueMicrotask(() => {
      this.pairQueued = false;
      this.pair();
    });
  }

  /**
   * Highlights the lines touched by the focused pane's selection, in both
   * panes, scrolling the other pane to show them; clears the highlight
   * when neither pane has focus.
   */
  private pair(): void {
    const focused = this.source.hasFocus
      ? this.source
      : this.output.hasFocus
        ? this.output
        : null;
    let first = 0;
    let last = -1;
    if (focused) {
      const { doc, selection } = focused.state;
      first = doc.lineAt(selection.main.from).number;
      last = doc.lineAt(selection.main.to).number;
    }
    for (const view of [this.source, this.output]) {
      const doc = view.state.doc;
      const ranges = [];
      for (let n = first; n <= Math.min(last, doc.lines); n++)
        ranges.push(pairedLine.range(doc.line(n).from));
      const deco = Decoration.set(ranges);
      const old = view.state.field(pairedField);
      if (old.size === 0 && deco.size === 0) continue;
      // The panes scroll separately; bring the matching line into view.
      const scroll =
        focused && view !== focused && first <= doc.lines
          ? [
              EditorView.scrollIntoView(doc.line(first).from, {
                y: "nearest",
                yMargin: 48,
              }),
            ]
          : [];
      view.dispatch({ effects: [setPaired.of(deco), ...scroll] });
    }
  }

  /**
   * Inserts text at the input cursor as one undo step, e.g. imported
   * ITRANS or a symbol from the palette.
   */
  insertInSource(text: string, userEvent = "input.paste"): void {
    this.source.dispatch(this.source.state.replaceSelection(text), {
      userEvent,
      scrollIntoView: true,
    });
    this.source.focus();
  }
}

/** ⚠ markers at the start of each line of text that has problems. */
function markers(text: string, problems: string[][]): RangeSet<GutterMarker> {
  const b = new RangeSetBuilder<GutterMarker>();
  let pos = 0;
  text.split("\n").forEach((line, i) => {
    const p = problems[i] ?? [];
    if (p.length > 0)
      b.add(pos, pos, new ErrorMarker(`Cannot convert: ${p.join("; ")}`));
    pos += line.length + 1;
  });
  return b.finish();
}

/** The single replacement turning a into b (common prefix and suffix kept). */
export function textChange(
  a: string,
  b: string,
): { from: number; to: number; insert: string } {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p > 0 && isHighSurrogate(a.charCodeAt(p - 1))) p--; // never split a surrogate pair
  let s = 0;
  while (
    s < a.length - p &&
    s < b.length - p &&
    a[a.length - 1 - s] === b[b.length - 1 - s]
  )
    s++;
  if (s > 0 && isHighSurrogate(a.charCodeAt(a.length - 1 - s))) s--;
  return { from: p, to: a.length - s, insert: b.slice(p, b.length - s) };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
