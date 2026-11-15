// SPDX-License-Identifier: GPL-3.0-or-later

// Clean up in Import Unicode (TECH_SPEC §6.8) and the symbol palette (§6.4).

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cleanup } from "../../src/conversion/cleanup";

const sample = (name: string) =>
  readFileSync(
    new URL(`../../../testdata/vedic/baraha/${name}`, import.meta.url),
    "utf8",
  ).replace(/\n$/, "");

async function texts(page: Page) {
  return page.evaluate(() => {
    const d = window.paramaakshara.doc;
    return { source: d.sourceText(), output: d.outputText() };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.paramaakshara !== undefined);
});

test("Import Unicode offers Clean up for Baraha's Purusha Sukta", async ({
  page,
}) => {
  const baraha = sample("purusha-sukta.unicode.txt");
  await page.getByRole("button", { name: "Import Unicode" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("textarea").fill(baraha);
  await expect(dialog).toContainText("Clean up before converting");
  await expect(dialog).toContainText("sign first (भूमि॑ं → भूमिं॑) — 20");
  await expect(dialog).toContainText("visarga (ः ಃ) — 27");
  const summary = dialog.locator(".unicode-preview p").first();
  const withFixes = await summary.textContent();
  // Declining a fix leaves more lines that will not convert back exactly.
  const accentOrder = dialog
    .locator("label")
    .filter({ hasText: "sign first" })
    .locator("input");
  await accentOrder.uncheck();
  await expect(summary).not.toHaveText(withFixes!);
  await accentOrder.check();
  await expect(summary).toHaveText(withFixes!);
  await dialog.getByRole("button", { name: "Insert as ITRANS" }).click();
  // The output is the cleaned-up text.
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe(cleanup(baraha).text);
});

test("the palette inserts ITRANS, or the character, into the input", async ({
  page,
}) => {
  await page.click("#source .cm-content");
  await page.keyboard.type("svAhA");
  await page.click("#palette-toggle");
  const palette = page.locator("#palette");
  await expect(palette).toBeVisible();
  await palette.locator("select").selectOption("taittiriya");
  await expect(palette).toContainText("Double (dīrgha) svarita");
  await palette
    .getByRole("button", { name: /Double \(dīrgha\) svarita/ })
    .click();
  // ''' gives the double svarita U+1CDA (TECH_SPEC §5.3).
  await expect
    .poll(() => texts(page))
    .toEqual({ source: "svAhA'''", output: "स्वाहा᳚" });

  // A sign with no ITRANS spelling is inserted as itself.
  await palette.locator("input[type=search]").fill("atikrama");
  const atikrama = palette.getByRole("button", { name: /atikrama/i });
  await expect(atikrama).toBeVisible();
  await expect(atikrama).toContainText("no glyph");
  await expect(palette.getByRole("button", { name: /svarita/i })).toHaveCount(
    0,
  );
  await atikrama.click();
  await expect
    .poll(() => texts(page))
    .toEqual({
      source: "svAhA'''᳷",
      output: "स्वाहा᳚᳷",
    });

  await palette.locator("input[type=search]").press("Escape");
  await expect(palette).toBeHidden();
});
