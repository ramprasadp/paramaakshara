// SPDX-License-Identifier: GPL-3.0-or-later

// Opening, saving, conflicts, import and recovery against a real daemon
// (TECH_SPEC §9.4, §10). See playwright.config.ts for the test daemon.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../../playwright.config";

const DOCS = join(E2E, "docs");

/** Signs in with the daemon's current launch token and waits for startup. */
async function signIn(page: Page, recovery: "discard" | "keep" = "discard") {
  const session = JSON.parse(
    readFileSync(join(E2E, "session.json"), "utf8"),
  ) as { token: string };
  // Open shows the system file picker, which a browser test cannot
  // drive: answer as a daemon without one does, so Open lists the
  // document folder. Tests that pick a file route the call themselves.
  await page.route("**/api/files/pick", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "unavailable", message: "No file picker." },
      }),
    }),
  );
  await page.goto(`/auth?token=${session.token}`);
  await page.waitForFunction(() => window.paramaakshara !== undefined);
  // Startup may offer unsaved work left by earlier tests.
  for (;;) {
    const done = await page.evaluate(() =>
      Promise.race([
        window.paramaakshara.ready.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 300)),
      ]),
    );
    if (done || recovery === "keep") return;
    if (await page.locator("dialog[open]").isVisible())
      await button(page, "Discard").click();
  }
}

/** A button in the open dialog. */
function button(page: Page, name: string) {
  return page
    .locator("dialog[open]")
    .getByRole("button", { name, exact: true });
}

async function typeSource(page: Page, text: string) {
  await page.click("#source .cm-content");
  await page.keyboard.type(text);
}

async function texts(page: Page) {
  return page.evaluate(() => {
    const d = window.paramaakshara.doc;
    return {
      source: d.source.state.doc.toString(),
      output: d.output.state.doc.toString(),
    };
  });
}

/** Waits until both panes show the expected text. */
async function expectTexts(
  page: Page,
  expected: { source: string; output: string },
) {
  await expect.poll(() => texts(page)).toEqual(expected);
}

async function saveAs(page: Page, path: string) {
  await page.click("#file-save-as");
  await page.locator("dialog input.path").fill(path);
  await button(page, "Save").click();
}

async function snapshotCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const r = (await (await fetch("/api/recovery")).json()) as {
      snapshots: unknown[];
    };
    return r.snapshots.length;
  });
}

test("without signing in, files are unavailable and the editor still works", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#banner")).toContainText("Not signed in");
  await expect(page.locator("#file-save")).toBeDisabled();
  await typeSource(page, "aa");
  expect((await texts(page)).output).toBe("आ");
});

test("save as .itx keeps only the ITRANS; reopen regenerates the output", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  // The example of TECH_SPEC §5.3 (Ṛgveda 1.1.1).
  await typeSource(page, "a_gnimii'LE\npu_rOhi'taM");
  await expect(page.locator("#docname")).toHaveText("Untitled •");
  // The extension is added (§10.3).
  await saveAs(page, `rv/${browserName}-purusha`);
  const name = `${browserName}-purusha.itx`;
  await expect(page.locator("#docname")).toHaveText(name);
  await expect(page.locator("#save-state")).toHaveText("Saved");
  expect(readFileSync(join(DOCS, "rv", name), "utf8")).toBe(
    "a_gnimii'LE\npu_rOhi'taM",
  );

  await page.click("#file-new");
  await expectTexts(page, { source: "", output: "" });
  await page.click("#file-open");
  await page.locator("dialog input.filter").fill(name);
  await button(page, `rv/${name}`).click();
  await expectTexts(page, {
    source: "a_gnimii'LE\npu_rOhi'taM",
    output:
      "अ\u0952ग\u094Dन\u093Fम\u0940\u0951ळ\u0947\n" +
      "प\u0941\u0952र\u094Bह\u093F\u0951त\u0902",
  });
  await expect(page.locator("#counts")).toHaveText("2 lines");
  await expect(page.locator("#save-state")).toHaveText("Saved");
});

test("a .txt file opens as ITRANS and Save asks for a .itx name", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  const txt = `${browserName}-plain.txt`;
  writeFileSync(join(DOCS, txt), "Eka\r\n");
  await page.click("#file-open");
  await page.locator("dialog input.filter").fill(txt);
  await button(page, txt).click();
  await expectTexts(page, { source: "Eka\n", output: "एक\n" });

  await typeSource(page, "dvi");
  await page.keyboard.press("ControlOrMeta+s");
  const input = page.locator("dialog input.path");
  await expect(input).toHaveValue(`${browserName}-plain.itx`);
  await button(page, "Save").click();
  await expect(page.locator("#docname")).toHaveText(`${browserName}-plain.itx`);
  // A new file is written with LF; the .txt is untouched.
  expect(readFileSync(join(DOCS, `${browserName}-plain.itx`), "utf8")).toBe(
    "Eka\ndvi",
  );
  expect(readFileSync(join(DOCS, txt), "utf8")).toBe("Eka\r\n");

  // ⌘S now saves to the same file.
  await typeSource(page, "!");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator("#save-state")).toHaveText("Saved");
  expect(readFileSync(join(DOCS, `${browserName}-plain.itx`), "utf8")).toBe(
    "Eka\ndvi!",
  );
});

test("a file changed on disk is not overwritten without asking", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await typeSource(page, "mine");
  const name = `${browserName}-conflict.itx`;
  await saveAs(page, name);
  await expect(page.locator("#save-state")).toHaveText("Saved");
  writeFileSync(join(DOCS, name), "changed by another program\n");
  await typeSource(page, "!");
  await page.click("#file-save");
  await expect(page.locator("dialog[open]")).toContainText("changed on disk");
  expect(readFileSync(join(DOCS, name), "utf8")).toBe(
    "changed by another program\n",
  );
  await button(page, "Overwrite").click();
  await expect(page.locator("#save-state")).toHaveText("Saved");
  expect(readFileSync(join(DOCS, name), "utf8")).toBe("mine!");
});

test("Export all writes the ITRANS, Unicode and PDF files", async ({
  page,
  browserName,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  await typeSource(page, "Eka\ndvi");
  const base = `export/${browserName}-sukta`;
  const exportAll = async () => {
    await page.click("#export-all");
    await page.locator("dialog input.path").fill(base);
    await button(page, "Export").click();
  };
  // Enter in the name field presses Export, not Cancel.
  await page.click("#export-all");
  await page.locator("dialog input.path").fill(base);
  await page.locator("dialog input.path").press("Enter");
  await expect(page.locator("dialog[open]")).toContainText("Exported", {
    timeout: 30_000,
  });
  await button(page, "OK").click();
  expect(readFileSync(join(DOCS, `${base}.itrans.txt`), "utf8")).toBe(
    "Eka\ndvi",
  );
  expect(readFileSync(join(DOCS, `${base}.uni.txt`), "utf8")).toBe("एक\nद्वि");
  const pdf = readFileSync(join(DOCS, `${base}.pdf`));
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.includes("NotoSerifDevanagari-Regular")).toBe(true);
  // Exporting does not save the document.
  await expect(page.locator("#docname")).toHaveText("Untitled •");

  // Existing files are replaced only after asking.
  await typeSource(page, "!");
  await exportAll();
  await expect(page.locator("dialog[open]")).toContainText("already exists");
  await button(page, "Cancel").click();
  expect(readFileSync(join(DOCS, `${base}.itrans.txt`), "utf8")).toBe(
    "Eka\ndvi",
  );
  await exportAll();
  await button(page, "Replace").click();
  await expect(page.locator("dialog[open]")).toContainText("Exported", {
    timeout: 30_000,
  });
  expect(readFileSync(join(DOCS, `${base}.itrans.txt`), "utf8")).toBe(
    "Eka\ndvi!",
  );
  expect(readFileSync(join(DOCS, `${base}.pdf`)).equals(pdf)).toBe(false);
});

test("Export all can use a folder chosen in the system folder picker", async ({
  page,
  browserName,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  // The system picker cannot be driven from a browser test: answer as
  // the daemon does after a pick, with the Documents folder.
  await page.route("**/api/folders/pick", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ root: "Documents", name: "Chosen" }),
    }),
  );
  await typeSource(page, "Eka");
  await page.click("#export-all");
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Choose…" }).click();
  await expect(dialog.locator("select")).toHaveValue("Documents");
  await expect(dialog.locator("select option:checked")).toHaveText("Chosen");
  const base = `${browserName}-chosen`;
  await dialog.locator("input.path").fill(base);
  await button(page, "Export").click();
  await expect(page.locator("dialog[open]")).toContainText("in Chosen.", {
    timeout: 30_000,
  });
  await button(page, "OK").click();
  expect(readFileSync(join(DOCS, `${base}.uni.txt`), "utf8")).toBe("एक");
  // The next Export all starts in the same folder.
  await page.click("#export-all");
  await expect(page.locator("dialog[open] select option:checked")).toHaveText(
    "Chosen",
  );
});

test("Save as and Open can use a folder chosen in the system folder picker", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  // As in the Export all test: answer as the daemon does after a pick.
  await page.route("**/api/folders/pick", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ root: "Documents", name: "Chosen" }),
    }),
  );
  await typeSource(page, "Eka");
  await page.click("#file-save-as");
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Choose…" }).click();
  await expect(dialog.locator("select option:checked")).toHaveText("Chosen");
  const name = `${browserName}-chosen.itx`;
  await dialog.locator("input.path").fill(name);
  await button(page, "Save").click();
  await expect(page.locator("#docname")).toHaveText(name);
  expect(readFileSync(join(DOCS, name), "utf8")).toBe("Eka");
  // The chosen folder stays in the list for Open.
  await page.click("#file-open");
  await expect(dialog.locator("select option:checked")).toHaveText("Chosen");
  await button(page, "Cancel").click();
});

test("Open opens a file chosen in the system file picker", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  const name = `${browserName}-direct.itx`;
  writeFileSync(join(DOCS, name), "shrIH");
  // As for folders: answer as the daemon does after a pick.
  await page.route("**/api/files/pick", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ root: "Documents", name: "Chosen", path: name }),
    }),
  );
  await page.click("#file-open");
  await expectTexts(page, { source: "shrIH", output: "श्रीः" });
  await expect(page.locator("#docname")).toHaveText(name);
  // Save writes back to the same file.
  await typeSource(page, " ||");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator("#save-state")).toHaveText("Saved");
  expect(readFileSync(join(DOCS, name), "utf8")).toBe("shrIH ||");
});

test("without a browser for PDFs, Export all opens the print dialog", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await page.route("**/api/export/pdf", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "unavailable", message: "No browser." },
      }),
    }),
  );
  await page.evaluate(() => {
    (window as unknown as { printedAs: string }).printedAs = "";
    window.print = () => {
      (window as unknown as { printedAs: string }).printedAs = document.title;
    };
  });
  await typeSource(page, "Eka");
  const base = `export/${browserName}-fallback`;
  await page.click("#export-all");
  await page.locator("dialog input.path").fill(base);
  await button(page, "Export").click();
  await expect(page.locator("dialog[open]")).toContainText(
    `${base}.pdf in the same folder`,
  );
  await button(page, "Print / Save as PDF").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { printedAs: string }).printedAs,
      ),
    )
    .toBe(`${browserName}-fallback`);
  expect(readFileSync(join(DOCS, `${base}.uni.txt`), "utf8")).toBe("एक");
});

test("import a text file as Unicode text or as ITRANS", async ({ page }) => {
  await signIn(page);
  const unicode = "\uFEFFअग\u094Dन\u093F\r\nम\u0940ळ\u0947";
  const importAs = async (choice: string) => {
    const chooser = page.waitForEvent("filechooser");
    await page.click("#file-import");
    if (await page.locator("dialog[open]").isVisible())
      await button(page, "Discard").click();
    await (
      await chooser
    ).setFiles({
      name: "agni.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(unicode),
    });
    await button(page, choice).click();
  };
  // As Unicode: rewritten in ITRANS through Import Unicode (§6.9); the
  // output gives back the file's text.
  await importAs("Unicode text");
  await expect(page.locator("dialog[open]")).toContainText("2 lines");
  await button(page, "Insert as ITRANS").click();
  await expect
    .poll(async () => (await texts(page)).output)
    .toBe("अग\u094Dन\u093F\nम\u0940ळ\u0947");
  expect((await texts(page)).source).toMatch(/^[\x20-\x7E\n]+$/);
  await expect(page.locator("#docname")).toHaveText("agni.txt •");
  // As ITRANS: Devanagari passes through unchanged.
  await importAs("ITRANS");
  await expectTexts(page, {
    source: "अग\u094Dन\u093F\nम\u0940ळ\u0947",
    output: "अग\u094Dन\u093F\nम\u0940ळ\u0947",
  });
  await expect(page.locator("#docname")).toHaveText("agni.txt •");
});

test("importing invalid UTF-8 changes nothing", async ({ page }) => {
  await signIn(page);
  await typeSource(page, "keep");
  const chooser = page.waitForEvent("filechooser");
  await page.click("#file-import");
  await button(page, "Discard").click();
  await (
    await chooser
  ).setFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0x61, 0xff, 0x62]),
  });
  await expect(page.locator("dialog[open]")).toContainText("not valid UTF-8");
  await button(page, "OK").click();
  expect((await texts(page)).source).toBe("keep");
});

test("unsaved work is offered for recovery after the page is closed", async ({
  page,
  context,
  browserName,
}) => {
  await signIn(page);
  // Start from no snapshots, so the only one offered is this test's.
  await page.evaluate(async () => {
    const { snapshots } = (await (await fetch("/api/recovery")).json()) as {
      snapshots: { key: string }[];
    };
    for (const s of snapshots)
      await fetch(`/api/recovery/${s.key}`, { method: "DELETE" });
  });
  // ITRANS that differs per browser, so this test only restores its own work.
  const marker = { chromium: "punaH", firefox: "punar", webkit: "punA" }[
    browserName
  ]!;
  await typeSource(page, marker);
  // The test daemon's recovery interval is 1 s.
  await expect.poll(() => snapshotCount(page)).toBe(1);
  await page.close();

  const next = await context.newPage();
  await signIn(next, "keep");
  await expect(next.locator("dialog[open]")).toContainText("Untitled");
  await expect(next.locator("dialog[open]")).toContainText("was not saved");
  await button(next, "Restore").click();
  await expectTexts(next, {
    source: marker,
    output: { punaH: "पुनः", punar: "पुनर्", punA: "पुना" }[marker]!,
  });
  await expect(next.locator("#save-state")).toHaveText("Unsaved changes");
});

test("the output script is remembered in the browser, not in the file", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await typeSource(page, "bhagavadgItA");
  await page.selectOption("#script-select", "tamil");
  await expectTexts(page, { source: "bhagavadgItA", output: "ப⁴க³வத்³கீ³தா" });
  const name = `${browserName}-tamil.itx`;
  await saveAs(page, name);
  await expect(page.locator("#save-state")).toHaveText("Saved");
  expect(readFileSync(join(DOCS, name), "utf8")).toBe("bhagavadgItA");

  await signIn(page);
  await expect(page.locator("#script-select")).toHaveValue("tamil");
  await page.click("#file-open");
  await page.locator("dialog input.filter").fill(name);
  await button(page, name).click();
  await expectTexts(page, { source: "bhagavadgItA", output: "ப⁴க³வத்³கீ³தா" });
});

test("Quit asks first when there are unsaved changes", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("#quit")).toBeEnabled();
  await typeSource(page, "eka");
  await page.click("#quit");
  await expect(page.locator("dialog[open]")).toContainText(
    "Quit with unsaved changes?",
  );
  // Cancel: actually quitting would stop the daemon the other tests use.
  await button(page, "Cancel").click();
  await expect(page.locator("#source")).toBeVisible();
  const health = await page.evaluate(
    async () => (await fetch("/api/health")).status,
  );
  expect(health).toBe(200);
});
