// SPDX-License-Identifier: GPL-3.0-or-later

// M1 spike measurements. These record how each editor behaves with Vedic
// text; they do not assert a preferred behaviour. Results are written to
// test-results/spike-<browser>.json and summarised in
// docs/adr/0001-editor-component.md.

import { writeFileSync, mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

// First line of the Purusha Sukta plus forms not in it: double svarita
// U+1CDA, accent on ")", accent before anusvara, Dravidian short e.
const TEXT =
  "स॒हस्र॑शीर्षा॒ पुरु॑ष: सहस्रा॒क्ष: स॒हस्र॑पात् । स्वाहा᳚ भू॑यास॒(ग्ग्)॒ सर्व॒ं मॆ॑";

type Target = "left" | "plain";

const cps = (s: string) =>
  Array.from(s)
    .map(
      (c) =>
        "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"),
    )
    .join(" ");

async function setText(page: Page, t: Target, text: string) {
  await page.evaluate(
    ([t, text]) => {
      const s = window.spike;
      if (t === "left") {
        s.left.dispatch({
          changes: { from: 0, to: s.left.state.doc.length, insert: text },
        });
      } else {
        s.plain.value = text;
      }
    },
    [t, text] as const,
  );
}

async function focusAt(page: Page, t: Target, pos: number) {
  await page.evaluate(
    ([t, pos]) => {
      const s = window.spike;
      if (t === "left") {
        s.left.focus();
        s.left.dispatch({ selection: { anchor: pos } });
      } else {
        s.plain.focus();
        s.plain.setSelectionRange(pos, pos);
      }
    },
    [t, pos] as const,
  );
}

async function state(
  page: Page,
  t: Target,
): Promise<{ text: string; pos: number }> {
  return page.evaluate((t) => {
    const s = window.spike;
    return t === "left"
      ? {
          text: s.left.state.doc.toString(),
          pos: s.left.state.selection.main.head,
        }
      : { text: s.plain.value, pos: s.plain.selectionStart };
  }, t);
}

// Cursor positions visited by pressing a key repeatedly from `start`.
async function walk(page: Page, t: Target, key: string, start: number) {
  await focusAt(page, t, start);
  const stops = [start];
  for (let i = 0; i < TEXT.length + 5; i++) {
    await page.keyboard.press(key);
    const { pos } = await state(page, t);
    if (pos === stops[stops.length - 1]) break;
    stops.push(pos);
  }
  return stops;
}

function classify(stops: number[]) {
  const inside = stops.filter(
    (p) => p > 0 && p < TEXT.length && /\p{M}/u.test(TEXT[p]!),
  );
  const inConjunct = stops.filter((p) => TEXT[p - 1] === "्");
  return {
    stops: stops.length,
    beforeCombiningMark: inside.map(
      (p) => `${p} (${cps(TEXT.slice(p - 1, p + 1))})`,
    ),
    afterVirama: inConjunct.length,
  };
}

async function backspaceAt(page: Page, t: Target, end: number) {
  await setText(page, t, TEXT);
  await focusAt(page, t, end);
  await page.keyboard.press("Backspace");
  const { text } = await state(page, t);
  const removedLen = TEXT.length - text.length;
  return cps(TEXT.slice(end - removedLen, end));
}

async function deleteAt(page: Page, t: Target, start: number) {
  await setText(page, t, TEXT);
  await focusAt(page, t, start);
  await page.keyboard.press("Delete");
  const { text } = await state(page, t);
  return cps(TEXT.slice(start, start + TEXT.length - text.length));
}

const endOf = (s: string) => TEXT.indexOf(s) + s.length;

test("measure editor behaviour with Vedic text", async ({
  page,
  browserName,
}) => {
  await page.goto("/spike/editor.html");
  await page.waitForFunction(() => window.spike !== undefined);

  const graphemes = await page.evaluate((text) => {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.index);
  }, TEXT);

  const result: Record<string, unknown> = {
    browser: browserName,
    textLength: TEXT.length,
  };
  result.intlGraphemeBoundaries = graphemes.length;

  for (const t of ["left", "plain"] as const) {
    const name = t === "left" ? "codemirror" : "textarea";
    await setText(page, t, TEXT);
    const right = await walk(page, t, "ArrowRight", 0);
    const left = await walk(page, t, "ArrowLeft", TEXT.length);
    const r: Record<string, unknown> = {
      arrowRight: classify(right),
      arrowLeft: classify(left),
      arrowRightMatchesIntl:
        JSON.stringify(right.filter((p) => p < TEXT.length)) ===
        JSON.stringify(graphemes),
      backspace: {
        "after स॒ (accent)": await backspaceAt(page, t, 2),
        "after स्र॑ (svarita on conjunct)": await backspaceAt(
          page,
          t,
          endOf("स॒हस्र॑"),
        ),
        "after हा᳚ (double svarita)": await backspaceAt(
          page,
          t,
          endOf("स्वाहा᳚"),
        ),
        "after र्व॒ं (accent + anusvara)": await backspaceAt(
          page,
          t,
          endOf("सर्व॒ं"),
        ),
        "after (ग्ग्)॒ (accent on paren)": await backspaceAt(
          page,
          t,
          endOf("(ग्ग्)॒"),
        ),
      },
      delete: {
        "before स॒": await deleteAt(page, t, 0),
        "before स्र॑": await deleteAt(page, t, TEXT.indexOf("स्र॑")),
      },
    };

    // Insert a svarita after "स॒ह" with the keyboard path, then undo.
    const at = "स॒ह".length;
    await setText(page, t, TEXT);
    await focusAt(page, t, at);
    await page.keyboard.insertText("\u0951");
    const inserted = (await state(page, t)).text;
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+z" : "Control+z",
    );
    const undone = (await state(page, t)).text;
    r.insertAccent =
      inserted === TEXT.slice(0, at) + "\u0951" + TEXT.slice(at)
        ? "ok"
        : `unexpected: ${cps(inserted.slice(0, 5))}`;
    r.undoRestoresText = undone === TEXT;

    // Typing the whole text as committed input (as an input method would).
    await setText(page, t, "");
    await focusAt(page, t, 0);
    await page.keyboard.insertText(TEXT);
    r.typedTextExact = (await state(page, t)).text === TEXT;

    result[name] = r;
  }

  // Clipboard: copy from CodeMirror, paste into the textarea and back.
  try {
    if (browserName === "chromium") {
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await setText(page, "left", TEXT);
    await page.evaluate(() => window.spike.left.focus());
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+c`);
    await setText(page, "plain", "");
    await focusAt(page, "plain", 0);
    await page.keyboard.press(`${mod}+v`);
    const pasted = (await state(page, "plain")).text;
    result.copyCodeMirrorPasteTextarea =
      pasted === TEXT
        ? "identical"
        : pasted === ""
          ? "nothing pasted (headless clipboard)"
          : `differs: ${cps(pasted.slice(0, 6))}`;
  } catch (e) {
    result.copyCodeMirrorPasteTextarea = `not measurable: ${(e as Error).message}`;
  }

  // Screenshots of both samples for visual review.
  mkdirSync("test-results", { recursive: true });
  for (const sample of ["purusha", "viraja"] as const) {
    await page.selectOption("#sample", sample);
    await page.click("#load");
    await page.screenshot({
      path: `test-results/spike-${browserName}-${sample}.png`,
      fullPage: true,
    });
  }

  writeFileSync(
    `test-results/spike-${browserName}.json`,
    JSON.stringify(result, null, 2),
  );
  expect(result.codemirror).toBeDefined();
});
