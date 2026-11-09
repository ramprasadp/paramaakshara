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

test("save as a project, then reopen with edit markers", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await typeSource(page, "स॒हस्र॑\nपुरु॑षः");
  await page.evaluate(() => {
    const d = window.paramaakshara.doc;
    d.output.focus();
    d.output.dispatch({ selection: { anchor: d.output.state.doc.line(1).to } });
  });
  await page.keyboard.type(" ।");
  await expect(page.locator("#docname")).toHaveText("Untitled •");
  const name = `${browserName}-purusha.paramaakshara.json`;
  await saveAs(page, `rv/${name}`);
  await expect(page.locator("#docname")).toHaveText(name);
  await expect(page.locator("#save-state")).toHaveText("Saved");

  const file = JSON.parse(readFileSync(join(DOCS, "rv", name), "utf8")) as {
    segments: unknown[];
  };
  // Only the document settings of §10.3, nothing else from the config.
  expect(Object.keys(file)).toEqual([
    "format",
    "format_version",
    "converter_version",
    "input_scheme",
    "output_script",
    "tamil_convention",
    "vedic_tradition",
    "segments",
  ]);
  expect(file.segments).toEqual([
    { source: "स॒हस्र॑", output: "स॒हस्र॑ ।", linked: false, stale: false },
    { source: "पुरु॑षः", output: "पुरु॑षः", linked: true },
  ]);

  await page.click("#file-new");
  await expectTexts(page, { source: "", output: "" });
  await page.click("#file-open");
  await page.locator("dialog input.filter").fill(name);
  await button(page, `rv/${name}`).click();
  await expectTexts(page, {
    source: "स॒हस्र॑\nपुरु॑षः",
    output: "स॒हस्र॑ ।\nपुरु॑षः",
  });
  await expect(page.locator("#counts")).toHaveText("2 lines · 1 edited");
  await expect(page.locator("#save-state")).toHaveText("Saved");
});

test("⌘S saves to the same file; plain text warns that ITRANS is dropped", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await typeSource(page, "eka");
  const name = `${browserName}-plain.txt`;
  await saveAs(page, name);
  await expect(page.locator("dialog[open]")).toContainText(
    "ITRANS input is not saved",
  );
  await button(page, "Save").click();
  await expect(page.locator("#docname")).toHaveText(name);
  expect(readFileSync(join(DOCS, name), "utf8")).toBe("एक");

  await typeSource(page, " dvi");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator("dialog[open]")).toContainText(
    "ITRANS input is not saved",
  );
  await button(page, "Save").click();
  await expect(page.locator("#save-state")).toHaveText("Saved");
  expect(readFileSync(join(DOCS, name), "utf8")).toBe("एक द्वि");
});

test("a file changed on disk is not overwritten without asking", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await typeSource(page, "mine");
  const name = `${browserName}-conflict.paramaakshara.json`;
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
  expect(readFileSync(join(DOCS, name), "utf8")).toContain('"source": "mine!"');
});

test("import a text file as Unicode output or as ITRANS", async ({ page }) => {
  await signIn(page);
  for (const [choice, expected] of [
    ["Unicode output", { source: "", output: "अग्नि\nमीळे" }],
    ["ITRANS input", { source: "अग्नि\nमीळे", output: "अग्नि\nमीळे" }],
  ] as const) {
    const chooser = page.waitForEvent("filechooser");
    await page.click("#file-import");
    if (await page.locator("dialog[open]").isVisible())
      await button(page, "Discard").click();
    await (
      await chooser
    ).setFiles({
      name: "agni.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("﻿अग्नि\r\nमीळे"),
    });
    await button(page, choice).click();
    await expectTexts(page, expected);
    await expect(page.locator("#docname")).toHaveText("agni.txt •");
  }
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

test("the output script is saved with the project and restored on open", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await typeSource(page, "bhagavadgItA");
  await page.selectOption("#script-select", "tamil");
  await expectTexts(page, { source: "bhagavadgItA", output: "ப⁴க³வத்³கீ³தா" });
  const name = `${browserName}-tamil.paramaakshara.json`;
  await saveAs(page, name);
  await expect(page.locator("#save-state")).toHaveText("Saved");
  const file = JSON.parse(readFileSync(join(DOCS, name), "utf8")) as {
    output_script: string;
  };
  expect(file.output_script).toBe("tamil");

  await page.selectOption("#script-select", "devanagari");
  await page.click("#file-new");
  await button(page, "Discard").click();
  await page.click("#file-open");
  await page.locator("dialog input.filter").fill(name);
  await button(page, name).click();
  await expectTexts(page, { source: "bhagavadgItA", output: "ப⁴க³வத்³கீ³தா" });
  await expect(page.locator("#script-select")).toHaveValue("tamil");
  // Lines are linked, not "out of date": the file was read in its own script.
  await expect(page.locator("#counts")).toHaveText("1 line");
});
