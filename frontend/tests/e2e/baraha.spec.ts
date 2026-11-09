// SPDX-License-Identifier: GPL-3.0-or-later

// Pasting text typed in Baraha into the ITRANS pane.

import { expect, test, type Page } from "@playwright/test";

const BARAHA =
  "sa bhUmi#M viqshvato# vRuqtvAtya#tiShThaddashA~gguqlam || 10.090.01";
const ITRANS =
  "sa bhUmi'M vi_shvato' vR^i_tvAtya'tiShThaddashA~Ngu_lam || 10.090.01";
const OUTPUT = "स भूमिं॑ वि॒श्वतो॑ वृ॒त्वात्य॑तिष्ठद्दशाङ्गु॒लम् ॥ १०.०९०.०१";

async function texts(page: Page) {
  return page.evaluate(() => {
    const d = window.paramaakshara.doc;
    return {
      source: d.source.state.doc.toString(),
      output: d.output.state.doc.toString(),
    };
  });
}

/** Simulates pasting text into the ITRANS pane. */
async function pasteIntoSource(page: Page, text: string) {
  await page.click("#source .cm-content");
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    window.paramaakshara.doc.source.contentDOM.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.paramaakshara !== undefined);
});

test("the Baraha dialog previews and inserts the converted text", async ({
  page,
}) => {
  await page.click("#baraha");
  const dialog = page.locator("dialog[open]");
  await dialog.locator("textarea").fill(BARAHA);
  await expect(dialog.locator(".baraha-itrans").first()).toHaveText(ITRANS);
  await expect(dialog.locator(".baraha-output").first()).toHaveText(OUTPUT);
  await expect(dialog).toContainText("1 line");
  await dialog.getByRole("button", { name: "Insert as ITRANS" }).click();
  await expect
    .poll(() => texts(page))
    .toEqual({ source: ITRANS, output: OUTPUT });
});

// Firefox ignores clipboardData on synthetic paste events, so the paste
// tests run in Chromium and WebKit; a real paste in Firefox carries it.
const SKIP_FIREFOX = "synthetic paste carries no clipboard data in Firefox";

test("pasting Baraha text into the ITRANS pane offers to convert it", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "firefox", SKIP_FIREFOX);
  await pasteIntoSource(page, BARAHA);
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("This looks like Baraha text");
  await dialog.getByRole("button", { name: "Insert as ITRANS" }).click();
  await expect
    .poll(() => texts(page))
    .toEqual({ source: ITRANS, output: OUTPUT });
});

test("pasting ordinary ITRANS goes straight in", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "firefox", SKIP_FIREFOX);
  await pasteIntoSource(page, ITRANS);
  await expect
    .poll(() => texts(page))
    .toEqual({ source: ITRANS, output: OUTPUT });
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});
