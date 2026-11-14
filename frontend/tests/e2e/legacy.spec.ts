// SPDX-License-Identifier: GPL-3.0-or-later

// Importing a PDF typeset with legacy fonts (TECH_SPEC §6.10) against the
// test daemon. The PDF draws उप॑ मा॒ in SHREE-SAN-0962 with the codes of
// mantrastotra.pdf page 22, and ॥ on a second page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";

function legacyPdf(): Buffer {
  const pages = [
    'BT /S 18 Tf 1 0 0 1 72 700 Tm (\\355T"] X"p\\205) Tj ET',
    "BT /S 18 Tf 1 0 0 1 72 700 Tm ($$) Tj ET",
  ];
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /Resources << /Font << /S 7 0 R >> >> >>",
    "<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>",
    ...pages.map((s) => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
    "<< /Type /Font /Subtype /TrueType /BaseFont /SHREE-SAN-0962 >>",
  ];
  const body = objs.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
  return Buffer.from(
    `%PDF-1.7\n${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`,
    "latin1",
  );
}

const PAGE1 = "उप॑ मा॒";
const PAGE2 = "॥";

async function signIn(page: Page) {
  const session = JSON.parse(
    readFileSync(join(E2E, "session.json"), "utf8"),
  ) as { token: string };
  await page.goto(`/auth?token=${session.token}`);
  await page.waitForFunction(() => window.paramaakshara !== undefined);
  for (;;) {
    const done = await page.evaluate(() =>
      Promise.race([
        window.paramaakshara.ready.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 300)),
      ]),
    );
    if (done) return;
    if (await page.locator("dialog[open]").isVisible())
      await button(page, "Discard").click();
  }
}

function button(page: Page, name: string) {
  return page
    .locator("dialog[open]")
    .getByRole("button", { name, exact: true });
}

async function choose(page: Page, buffer: Buffer, name = "legacy.pdf") {
  const chooser = page.waitForEvent("filechooser");
  await page.click("#legacy-pdf");
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer });
}

async function output(page: Page) {
  return page.evaluate(() =>
    window.paramaakshara.doc.output.state.doc.toString(),
  );
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a legacy-font PDF is converted and inserted as ITRANS", async ({
  page,
}) => {
  await choose(page, legacyPdf());
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("h2")).toHaveText("Import legacy.pdf");
  await expect(dialog).toContainText("2 pages.");
  await expect(dialog).toContainText("Converted: SHREE-SAN-0962.");
  await expect(dialog.locator(".legacy-line").first()).toHaveText(PAGE1);
  await button(page, "Continue").click();

  await expect(dialog.locator("h2")).toHaveText("legacy.pdf, pages 1–2");
  await expect(dialog.locator("textarea")).toHaveValue(`${PAGE1}\n\n${PAGE2}`);
  await button(page, "Insert as ITRANS").click();
  await expect.poll(() => output(page)).toBe(`${PAGE1}\n\n${PAGE2}`);
});

test("only the chosen pages are imported", async ({ page }) => {
  await choose(page, legacyPdf());
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input.legacy-page").first().fill("2");
  await expect(dialog.locator(".legacy-line")).toHaveText([PAGE2]);
  await button(page, "Continue").click();
  await expect(dialog.locator("h2")).toHaveText("legacy.pdf, page 2");
  await button(page, "Insert as ITRANS").click();
  await expect.poll(() => output(page)).toBe(PAGE2);
});

test("a file that is not a PDF is reported", async ({ page }) => {
  await choose(page, Buffer.from("hello"), "notes.pdf");
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("h2")).toHaveText("Cannot import");
  await expect(dialog).toContainText("could not be read as a PDF");
  await button(page, "OK").click();
  expect(await output(page)).toBe("");
});
