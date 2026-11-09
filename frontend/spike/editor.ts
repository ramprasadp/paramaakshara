// SPDX-License-Identifier: GPL-3.0-or-later

// M1 editor spike: compares CodeMirror 6 and a plain textarea with Vedic
// text. Throwaway code; see docs/adr/0001-editor-component.md.

import { EditorState, RangeSet, type Extension } from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  lineNumbers,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

import purusha from "../../testdata/vedic/baraha/purusha-sukta.unicode.txt?raw";
import viraja from "../../testdata/vedic/baraha/viraja-homa.unicode.txt?raw";

const samples: Record<string, string> = { purusha, viraja };

class Mark extends GutterMarker {
  override toDOM(): Node {
    const span = document.createElement("span");
    span.className = "gutter-mark";
    span.textContent = "✎";
    return span;
  }
}
const mark = new Mark();

// Marks every third line, to check that a custom gutter works with Indic
// text and line wrapping.
const demoGutter = gutter({
  markers(view) {
    const marks = [];
    for (let n = 3; n <= view.state.doc.lines; n += 3) {
      marks.push(mark.range(view.state.doc.line(n).from));
    }
    return RangeSet.of(marks);
  },
});

function makeEditor(parent: HTMLElement, extra: Extension[]): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged) {
            inspect(u.state.doc.toString(), u.state.selection.main.head);
          }
        }),
        ...extra,
      ],
    }),
  });
}

const left = makeEditor(document.getElementById("left")!, []);
const right = makeEditor(document.getElementById("right")!, [demoGutter]);
const plain = document.getElementById("plain") as HTMLTextAreaElement;

function setAll(text: string): void {
  for (const v of [left, right]) {
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  }
  plain.value = text;
}

function cp(ch: string): string {
  return "U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
}

const inspector = document.getElementById("inspector")!;

// Shows the code points on either side of the cursor.
function inspect(text: string, pos: number): void {
  const before = Array.from(text.slice(Math.max(0, pos - 6), pos));
  const after = Array.from(text.slice(pos, pos + 6));
  inspector.textContent =
    `offset ${pos}\n` +
    `before: ${before.map((c) => `${c} ${cp(c)}`).join("  ")}\n` +
    `after:  ${after.map((c) => `${c} ${cp(c)}`).join("  ")}`;
}

plain.addEventListener("selectionchange", () =>
  inspect(plain.value, plain.selectionStart),
);
plain.addEventListener("keyup", () =>
  inspect(plain.value, plain.selectionStart),
);
plain.addEventListener("click", () =>
  inspect(plain.value, plain.selectionStart),
);

const sampleSelect = document.getElementById("sample") as HTMLSelectElement;
document.getElementById("load")!.addEventListener("click", () => {
  setAll(samples[sampleSelect.value] ?? "");
});

document.getElementById("font")!.addEventListener("change", (e) => {
  document.documentElement.style.setProperty(
    "--font",
    (e.target as HTMLSelectElement).value,
  );
});

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-insert]")) {
  b.addEventListener("click", () => {
    const text = b.dataset.insert!;
    right.dispatch(right.state.replaceSelection(text));
    right.focus();
  });
}

document.getElementById("compare")!.addEventListener("click", () => {
  const want = samples[sampleSelect.value] ?? "";
  const got = {
    "CodeMirror left": left.state.doc.toString(),
    "CodeMirror right": right.state.doc.toString(),
    textarea: plain.value,
  };
  inspector.textContent = Object.entries(got)
    .map(
      ([name, text]) =>
        `${name}: ${text === want ? "identical to sample" : describeDiff(want, text)}`,
    )
    .join("\n");
});

function describeDiff(want: string, got: string): string {
  let i = 0;
  while (i < want.length && i < got.length && want[i] === got[i]) i++;
  const w = Array.from(want.slice(i, i + 4))
    .map(cp)
    .join(" ");
  const g = Array.from(got.slice(i, i + 4))
    .map(cp)
    .join(" ");
  return `DIFFERS at offset ${i}: sample [${w}] pane [${g}]`;
}

setAll(purusha);

// Exposed for the Playwright measurements in tests/e2e/spike.spec.ts.
declare global {
  interface Window {
    spike: {
      left: EditorView;
      right: EditorView;
      plain: HTMLTextAreaElement;
      samples: typeof samples;
    };
  }
}
window.spike = { left, right, plain, samples };
