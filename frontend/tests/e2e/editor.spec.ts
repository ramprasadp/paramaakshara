// SPDX-License-Identifier: GPL-3.0-or-later

// The two-pane editor in a real browser (TECH_SPEC §4). Most tests type
// Devanagari letters, which the ITRANS converter passes through
// unchanged, so the editing rules can be checked with output = input.

import { expect, test, type Page } from "@playwright/test";

const undo = "ControlOrMeta+z";
const redo = "ControlOrMeta+Shift+z";

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
  await typeSource(page, "agnim\niiLE");
  expect(await texts(page)).toEqual({
    source: "agnim\niiLE",
    output: "अग्निम्\nईळे",
  });
});

test("Vedic accents and the conversion-error marker", async ({ page }) => {
  await typeSource(page, "a_gnimii'LE\nbhUmi'M svAhA'''\nraBa");
  expect((await texts(page)).output).toBe(
    "अ\u0952ग्निमी\u0951ळे\nभूमि\u0902\u0951 स्वाहा\u1CDA\nरBअ",
  );
  expect(await markers(page, "source")).toEqual(["", "", "⚠"]);
  expect(await markers(page, "output")).toEqual(["", "", "⚠"]);
  await expect(page.locator("#counts")).toHaveText(
    "3 lines · 1 with ITRANS errors",
  );
});

test("the output pane is read-only", async ({ page }) => {
  await typeSource(page, "कक\nखख");
  await select(page, "output", 2); // end of line 1
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Delete");
  expect(await texts(page)).toEqual({ source: "कक\nखख", output: "कक\nखख" });
});

test("undo in the output pane undoes the last ITRANS edit", async ({
  page,
}) => {
  // Two separate undo steps.
  await page.evaluate(() => {
    const d = window.paramaakshara.doc;
    d.insertInSource("ka");
    d.insertInSource("\nkha");
  });
  await select(page, "output", 0);
  await page.keyboard.press(undo);
  expect(await texts(page)).toEqual({ source: "ka", output: "क" });
  await page.keyboard.press(redo);
  expect(await texts(page)).toEqual({ source: "ka\nkha", output: "क\nख" });
});

test("deleting an input line removes its output line", async ({ page }) => {
  await typeSource(page, "कक\nखख\nगग");
  await select(page, "source", 3, 6); // "खख\n"
  await page.keyboard.press("Backspace");
  expect(await texts(page)).toEqual({ source: "कक\nगग", output: "कक\nगग" });
  await page.keyboard.press(undo);
  expect(await texts(page)).toEqual({
    source: "कक\nखख\nगग",
    output: "कक\nखख\nगग",
  });
});

test("the reference sheet shows hard-to-type letters and accents", async ({
  page,
}) => {
  await page.click("#reference");
  const rows = page.locator("dialog[open] table.reference tbody tr");
  // Expected outputs from docs/itrans-mappings.md and TECH_SPEC §5.3.
  await expect(rows.filter({ hasText: "j~ja" })).toContainText("ज्ञ");
  await expect(rows.filter({ hasText: "kaa'''" })).toContainText("का\u1CDA");
  await expect(rows.filter({ hasText: "ra(gm)" })).toContainText("र\uA8F3");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("status bar counts lines", async ({ page }) => {
  await typeSource(page, "ka\nkha");
  await expect(page.locator("#counts")).toHaveText("2 lines");
});

test("the page title is paramaakshara", async ({ page }) => {
  await expect(page).toHaveTitle("paramaakshara");
  await typeSource(page, "aa");
  await expect(page).toHaveTitle("paramaakshara");
});

/** Line numbers (1-based) highlighted as the current line in a pane. */
async function paired(page: Page, pane: "source" | "output") {
  return page.evaluate((pane) => {
    const d = window.paramaakshara.doc;
    const view = pane === "source" ? d.source : d.output;
    return [...view.dom.querySelectorAll(".cm-line.paired-line")].map(
      (el) => view.state.doc.lineAt(view.posAtDOM(el)).number,
    );
  }, pane);
}

test("the current line is highlighted in both panes until focus leaves", async ({
  page,
}) => {
  await typeSource(page, "ka\nkha\nga");
  await select(page, "source", 4); // line 2
  await expect.poll(() => paired(page, "output")).toEqual([2]);
  expect(await paired(page, "source")).toEqual([2]);
  // A selection over several lines highlights all of them.
  await select(page, "source", 0, 4);
  await expect.poll(() => paired(page, "output")).toEqual([1, 2]);
  // From the output pane too.
  await select(page, "output", 5); // line 3
  await expect.poll(() => paired(page, "source")).toEqual([3]);
  // Clicking outside both panes removes it.
  await page.click(".status");
  await expect.poll(() => paired(page, "output")).toEqual([]);
  expect(await paired(page, "source")).toEqual([]);
});

test("the other pane scrolls to show the highlighted line", async ({
  page,
}) => {
  await page.evaluate(() => {
    const d = window.paramaakshara.doc;
    d.insertInSource(Array.from({ length: 120 }, () => "agnim").join("\n"));
  });
  // Bring both panes to the top, then put the cursor on line 100.
  await page.evaluate(() => {
    const d = window.paramaakshara.doc;
    d.output.scrollDOM.scrollTop = 0;
    d.source.focus();
    d.source.dispatch({
      selection: { anchor: d.source.state.doc.line(100).from },
      scrollIntoView: true,
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const out = window.paramaakshara.doc.output;
        const line = out.dom.querySelector(".cm-line.paired-line");
        if (!line) return false;
        const box = line.getBoundingClientRect();
        const view = out.scrollDOM.getBoundingClientRect();
        return box.top >= view.top && box.bottom <= view.bottom;
      }),
    )
    .toBe(true);
});
