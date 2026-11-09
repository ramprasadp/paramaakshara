// SPDX-License-Identifier: GPL-3.0-or-later

// Export PDF: the print view holds only the output text, and printing it
// produces a PDF with the bundled fonts embedded.

import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const OUTPUT =
  "स॒हस्र॑शीर्षा॒ पुरु॑षः सहस्रा॒क्षः स॒हस्र॑पात् ।\nस भूमिं॑ वि॒श्वतो॑ वृ॒त्वा ॥\n\nतस्मा᳚द् वि॒राळ॑जायत";

async function fillOutput(page: Page) {
  await page.evaluate((text) => {
    const v = window.paramaakshara.doc.output;
    v.dispatch({ changes: { from: 0, insert: text } });
  }, OUTPUT);
}

/** Opens Export PDF and confirms; window.print is replaced to capture the view. */
async function exportWithStub(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { printed: string[] }).printed = [];
    window.print = () => {
      const view = document.getElementById("print-view")!;
      (window as unknown as { printed: string[] }).printed = [
        ...view.children,
      ].map((c) => `${c.tagName}:${c.textContent}`);
    };
  });
  await page.click("#export-pdf");
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input.path").fill("Purusha Sukta");
  await dialog.getByRole("button", { name: "Print / Save as PDF" }).click();
  await page.waitForFunction(
    () => (window as unknown as { printed: string[] }).printed.length > 0,
  );
  return page.evaluate(
    () => (window as unknown as { printed: string[] }).printed,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.paramaakshara !== undefined);
});

test("the print view holds the title and the output lines only", async ({
  page,
}) => {
  await fillOutput(page);
  const printed = await exportWithStub(page);
  expect(printed).toEqual([
    "H1:Purusha Sukta",
    "P:स॒हस्र॑शीर्षा॒ पुरु॑षः सहस्रा॒क्षः स॒हस्र॑पात् ।",
    "P:स भूमिं॑ वि॒श्वतो॑ वृ॒त्वा ॥",
    "P:\u00A0",
    "P:तस्मा᳚द् वि॒राळ॑जायत",
  ]);
  // In print media only the view is shown.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".panes")).toBeHidden();
});

test("printing produces a PDF with the bundled fonts", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "page.pdf() is Chromium only");
  await fillOutput(page);
  // Keep the view filled: do not let the stub's afterprint clear it.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.click("#export-pdf");
  await page
    .locator("dialog[open]")
    .locator("input.path")
    .fill("Purusha Sukta");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Print / Save as PDF" })
    .click();
  await expect(page.locator("#print-view h1")).toHaveText("Purusha Sukta");
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const raw = pdf.toString("latin1");
  expect(raw.startsWith("%PDF")).toBe(true);
  expect(raw).toMatch(/NotoSerifDevanagari/);
  expect((raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  writeFileSync(test.info().outputPath("export.pdf"), pdf);
});
