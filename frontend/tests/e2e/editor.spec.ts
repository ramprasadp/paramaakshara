// SPDX-License-Identifier: GPL-3.0-or-later

// The two-pane editor in a real browser (TECH_SPEC §4). The converter is
// still the placeholder, so linked output equals the ITRANS input.

import { expect, test, type Page } from "@playwright/test";

const undo = "ControlOrMeta+z";

async function texts(page: Page) {
  return page.evaluate(() => {
    const d = window.paramaakshara.doc;
    return {
      source: d.source.state.doc.toString(),
      output: d.output.state.doc.toString(),
    };
  });
}

/** Gutter markers per line of a pane, e.g. ["", "✎", "+"]. */
async function markers(page: Page, pane: "source" | "output") {
  return page.evaluate((pane) => {
    const d = window.paramaakshara.doc;
    const view = pane === "source" ? d.source : d.output;
    const out: string[] = [];
    for (let n = 1; n <= view.state.doc.lines; n++) out.push("");
    const gutter = view.dom.querySelector(".seg-gutter");
    for (const el of gutter?.querySelectorAll<HTMLElement>(
      ".cm-gutterElement",
    ) ?? []) {
      const marker = el.querySelector(".seg-marker");
      if (!marker) continue;
      const pos = view.posAtCoords({
        x: view.contentDOM.getBoundingClientRect().left + 1,
        y: el.getBoundingClientRect().top + 4,
      });
      if (pos !== null)
        out[view.state.doc.lineAt(pos).number - 1] = marker.textContent ?? "";
    }
    return out;
  }, pane);
}

/** Puts the cursor (or a selection) in a pane and focuses it. */
async function select(
  page: Page,
  pane: "source" | "output",
  anchor: number,
  head = anchor,
) {
  await page.evaluate(
    ([pane, anchor, head]) => {
      const d = window.paramaakshara.doc;
      const view = pane === "source" ? d.source : d.output;
      view.focus();
      view.dispatch({ selection: { anchor, head } });
    },
    [pane, anchor, head] as const,
  );
}

async function typeSource(page: Page, text: string) {
  await page.click("#source .cm-content");
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.waitForFunction(() => window.paramaakshara !== undefined);
});

test("typing ITRANS fills the output line by line", async ({ page }) => {
  await typeSource(page, "agnim\niiLe");
  expect(await texts(page)).toEqual({
    source: "agnim\niiLe",
    output: "agnim\niiLe",
  });
});

test("a manual output edit detaches only that line", async ({ page }) => {
  await typeSource(page, "aa\nbb");
  await select(page, "output", 2); // end of line 1
  await page.keyboard.type("!");
  expect((await texts(page)).output).toBe("aa!\nbb");
  expect(await markers(page, "output")).toEqual(["✎", ""]);
  expect(await markers(page, "source")).toEqual(["✎", ""]);
  // Line 2 still follows the source; line 1 keeps the manual edit.
  await select(page, "source", 5);
  await page.keyboard.type("x");
  await select(page, "source", 2);
  await page.keyboard.type("y");
  expect(await texts(page)).toEqual({ source: "aay\nbbx", output: "aa!\nbbx" });
  expect(await markers(page, "output")).toEqual(["✎!", ""]);
});

test("Regenerate line restores the generated output", async ({ page }) => {
  await typeSource(page, "aa\nbb");
  await select(page, "output", 2);
  await page.keyboard.type("!");
  await select(page, "output", 0);
  await page.click("#regen-line");
  expect((await texts(page)).output).toBe("aa\nbb");
  expect(await markers(page, "output")).toEqual(["", ""]);
  // Regeneration is one undo step in the output pane.
  await select(page, "output", 0);
  await page.keyboard.press(undo);
  expect((await texts(page)).output).toBe("aa!\nbb");
});

test("deleting an output line removes its source; undo restores both", async ({
  page,
}) => {
  await typeSource(page, "aa\nbb\ncc");
  await select(page, "output", 3, 6); // "bb\n"
  await page.keyboard.press("Backspace");
  expect(await texts(page)).toEqual({ source: "aa\ncc", output: "aa\ncc" });
  await page.keyboard.press(undo);
  expect(await texts(page)).toEqual({
    source: "aa\nbb\ncc",
    output: "aa\nbb\ncc",
  });
  expect(await markers(page, "output")).toEqual(["", "", ""]);
});

test("undoing a manual edit re-links the line", async ({ page }) => {
  await typeSource(page, "aa");
  await select(page, "output", 2);
  await page.keyboard.type("!");
  expect(await markers(page, "output")).toEqual(["✎"]);
  await page.keyboard.press(undo);
  expect((await texts(page)).output).toBe("aa");
  expect(await markers(page, "output")).toEqual([""]);
});

test("undo in the input pane keeps manual output edits", async ({ page }) => {
  await typeSource(page, "aa\nbb"); // "\nbb" is the last undo step
  await select(page, "output", 5);
  await page.keyboard.type("!");
  await select(page, "source", 5);
  await page.keyboard.press(undo);
  // The typed line is gone from the input; its manual output stays.
  expect(await texts(page)).toEqual({ source: "aa", output: "aa\nbb!" });
  expect(await markers(page, "output")).toEqual(["", "+"]);
});

test("Enter at the end of an output line adds an output-only line", async ({
  page,
}) => {
  await typeSource(page, "aa\nbb");
  await select(page, "output", 2);
  await page.keyboard.press("Enter");
  await page.keyboard.type("note");
  expect(await texts(page)).toEqual({
    source: "aa\nbb",
    output: "aa\nnote\nbb",
  });
  expect(await markers(page, "output")).toEqual(["", "+", ""]);
});

test("accent buttons insert at the output cursor", async ({ page }) => {
  await typeSource(page, "sa");
  await select(page, "output", 1);
  await page.click('button[data-insert="॒"]');
  expect((await texts(page)).output).toBe("s॒a");
  await page.keyboard.press(undo);
  expect((await texts(page)).output).toBe("sa");
});

test("status bar counts edited and output-only lines", async ({ page }) => {
  await typeSource(page, "aa\nbb");
  await select(page, "output", 2);
  await page.keyboard.type("!");
  await page.keyboard.press("End");
  await select(page, "output", 6);
  await page.keyboard.press("Enter");
  await expect(page.locator("#counts")).toHaveText(
    "3 lines · 1 edited · 1 output-only",
  );
});
