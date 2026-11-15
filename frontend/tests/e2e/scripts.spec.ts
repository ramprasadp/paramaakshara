// SPDX-License-Identifier: GPL-3.0-or-later

// Output script switching (TECH_SPEC §4.5, §7).

import { expect, test, type Page } from "@playwright/test";

async function texts(page: Page) {
  return page.evaluate(() => {
    const d = window.paramaakshara.doc;
    return {
      source: d.source.state.doc.toString(),
      output: d.output.state.doc.toString(),
    };
  });
}

async function typeSource(page: Page, text: string) {
  await page.click("#source .cm-content");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.paramaakshara !== undefined);
});

test("switching to Kannada regenerates the output; new typing follows; switching back restores it", async ({
  page,
}) => {
  await typeSource(page, "a_gnimii'LE");
  await page.selectOption("#script-select", "kannada");
  await expect
    .poll(() => texts(page))
    .toEqual({ source: "a_gnimii'LE", output: "ಅ॒ಗ್ನಿಮೀ॑ಳೇ" });
  await expect(page.locator("#converter")).toHaveText("ITRANS 5.3 → Kannada");

  await typeSource(page, "\npu_rOhi'taM");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("ಅ॒ಗ್ನಿಮೀ॑ಳೇ\nಪು॒ರೋಹಿ॑ತಂ");

  await page.selectOption("#script-select", "devanagari");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("अ॒ग्निमी॑ळे\nपु॒रोहि॑तं");
  await typeSource(page, " ||");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("अ॒ग्निमी॑ळे\nपु॒रोहि॑तं ॥");
});

test("Tamil approximations are marked and reported", async ({ page }) => {
  // Chandrabindu (.N), which Tamil cannot write.
  await typeSource(page, "bhagavadgItA\nkRRiShNa\ntA.N");
  await page.selectOption("#script-select", "tamil");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("ப⁴க³வத்³கீ³தா\nக்ருஷ்ண\nதாँ");
  await expect(page.locator("#counts")).toContainText("2 with ITRANS errors");
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("Line 2");
  await expect(dialog).toContainText("Line 3");
  await expect(dialog).toContainText("no Tamil equivalent");
  await dialog.getByRole("button", { name: "OK" }).click();
});

test("short e/o and long E/O stay distinct across scripts", async ({
  page,
}) => {
  await typeSource(page, "veMkaTEsha\nkola kOla");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("वॆंकटेश\nकॊल कोल");
  await page.selectOption("#script-select", "kannada");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("ವೆಂಕಟೇಶ\nಕೊಲ ಕೋಲ");
  await page.selectOption("#script-select", "tamil");
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("வெம்கடேஶ\nகொல கோல");
});
