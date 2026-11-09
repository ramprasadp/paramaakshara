// SPDX-License-Identifier: GPL-3.0-or-later

// Clean up text (TECH_SPEC §6.8) and the symbol palette (§6.4).

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cleanup } from "../../src/conversion/cleanup";

const sample = (name: string) =>
  readFileSync(
    new URL(`../../../testdata/vedic/baraha/${name}`, import.meta.url),
    "utf8",
  ).replace(/\n$/, "");

async function output(page: Page) {
  return page.evaluate(() =>
    window.paramaakshara.doc.output.state.doc.toString(),
  );
}

/** Pastes text into the empty output pane, as from Baraha. */
async function paste(page: Page, text: string) {
  await page.evaluate((text) => {
    const v = window.paramaakshara.doc.output;
    v.focus();
    v.dispatch({
      changes: { from: 0, insert: text },
      selection: { anchor: text.length },
      userEvent: "input.paste",
    });
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.paramaakshara !== undefined);
});

test("Clean up text fixes Baraha's Purusha Sukta, as one undo step", async ({
  page,
}) => {
  const baraha = sample("purusha-sukta.unicode.txt");
  await paste(page, baraha);
  await page.click("#cleanup");
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("the whole output");
  await expect(dialog).toContainText("sign first (भूमि॑ं → भूमिं॑) — 20");
  await expect(dialog).toContainText("visarga (ः ಃ) — 27");
  const changed = baraha
    .split("\n")
    .filter((l) => cleanup(l).text !== l).length;
  await expect(dialog).toContainText(`${changed} lines will change.`);
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => output(page)).toBe(cleanup(baraha).text);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await output(page)).toBe(baraha);
});

test("Clean up text acts on the selected lines only", async ({ page }) => {
  const original = sample("viraja-homa.unicode.txt").split("\n").slice(0, 3);
  await paste(page, original.join("\n"));
  await page.evaluate(() => {
    const v = window.paramaakshara.doc.output;
    const line = v.state.doc.line(2);
    v.dispatch({ selection: { anchor: line.from, head: line.to } });
  });
  await page.click("#cleanup");
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("1 selected lines");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => output(page)).not.toBe(original.join("\n"));
  const lines = (await output(page)).split("\n");
  expect(lines[0]).toBe(original[0]);
  expect(lines[1]).toBe(cleanup(original[1]!).text);
  expect(lines[1]).not.toBe(original[1]);
  expect(lines[2]).toBe(original[2]);
});

test("the palette inserts accents by tradition and marks missing glyphs", async ({
  page,
}) => {
  await paste(page, "स्वाहा");
  await page.click("#palette-toggle");
  const palette = page.locator("#palette");
  await expect(palette).toBeVisible();
  await palette.locator("select").selectOption("taittiriya");
  await expect(palette).toContainText("Double (dīrgha) svarita");
  await palette
    .getByRole("button", { name: /Double \(dīrgha\) svarita/ })
    .click();
  expect(await output(page)).toBe("स्वाहा᳚");

  await palette.locator("input[type=search]").fill("atikrama");
  const atikrama = palette.getByRole("button", { name: /atikrama/i });
  await expect(atikrama).toBeVisible();
  await expect(atikrama).toContainText("no glyph");
  await expect(palette.getByRole("button", { name: /svarita/i })).toHaveCount(
    0,
  );

  await palette.locator("input[type=search]").press("Escape");
  await expect(palette).toBeHidden();
});
