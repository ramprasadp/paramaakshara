// SPDX-License-Identifier: GPL-3.0-or-later

// Importing Unicode text: the Import Unicode dialog and pasting Unicode
// into the ITRANS pane. The pair is Ṛgveda 10.90.1 (baraha.spec.ts).

import { expect, test, type Page } from "@playwright/test";

const UNICODE =
  "\u0938 \u092D\u0942\u092E\u093F\u0902\u0951 \u0935\u093F\u0952\u0936\u094D\u0935\u0924\u094B\u0951 \u0935\u0943\u0952\u0924\u094D\u0935\u093E\u0924\u094D\u092F\u0951\u0924\u093F\u0937\u094D\u0920\u0926\u094D\u0926\u0936\u093E\u0919\u094D\u0917\u0941\u0952\u0932\u092E\u094D \u0965 \u0967\u0966.\u0966\u096F\u0966.\u0966\u0967";
const ITRANS =
  "sa bhUmi'M vi_shvatO' vR^i_tvAtya'tiShThaddashA~Ngu_lam || 10.090.01";

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

test("the Import Unicode icon converts pasted Unicode to ITRANS", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Import Unicode" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("textarea").fill(UNICODE);
  await expect(dialog.locator(".unicode-itrans").first()).toHaveText(ITRANS);
  await expect(dialog.locator(".unicode-output").first()).toHaveText(UNICODE);
  await expect(dialog).toContainText("1 line");
  await dialog.getByRole("button", { name: "Insert as ITRANS" }).click();
  await expect
    .poll(() => texts(page))
    .toEqual({ source: ITRANS, output: UNICODE });
});

test("a line that will change is marked", async ({ page }) => {
  await page.getByRole("button", { name: "Import Unicode" }).click();
  const dialog = page.locator("dialog[open]");
  // Baraha's order: svarita before anusvara.
  await dialog.locator("textarea").fill("\u092D\u0942\u092E\u093F\u0951\u0902");
  await expect(dialog).toContainText("1 will not convert back exactly");
  await expect(dialog.locator(".unicode-output")).toHaveText(
    "\u26A0 \u092D\u0942\u092E\u093F\u0902\u0951",
  );
});

// Firefox ignores clipboardData on synthetic paste events.
test("pasting Unicode into the ITRANS pane offers to convert it", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "synthetic paste carries no clipboard data in Firefox",
  );
  await pasteIntoSource(page, UNICODE);
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("This looks like Unicode text");
  await dialog.getByRole("button", { name: "Insert as ITRANS" }).click();
  await expect
    .poll(() => texts(page))
    .toEqual({ source: ITRANS, output: UNICODE });
});

test("Regenerate icons have accessible names", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "Regenerate line" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate all" }),
  ).toBeVisible();
});
