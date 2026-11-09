// SPDX-License-Identifier: GPL-3.0-or-later

// Visual rendering of Vedic text (TECH_SPEC §6.7, §13.6): the Baraha
// samples after Clean up, in the bundled font, in each browser. The
// reference images under rendering.spec.ts-snapshots/ must be reviewed by
// a person before they are accepted; update them with
// `npx playwright test rendering --update-snapshots`.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cleanup } from "../../src/conversion/cleanup";

const sample = (name: string, lines: number) =>
  cleanup(
    readFileSync(
      new URL(`../../../testdata/vedic/baraha/${name}`, import.meta.url),
      "utf8",
    )
      .split("\n")
      .slice(0, lines)
      .join("\n"),
  ).text;

for (const [name, lines] of [
  ["purusha-sukta.unicode.txt", 6],
  ["viraja-homa.unicode.txt", 6],
] as const) {
  test(`renders ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto("/");
    await page.waitForFunction(() => window.paramaakshara !== undefined);
    await page.evaluate(
      (text) => {
        const d = window.paramaakshara.doc;
        d.output.dispatch({ changes: { from: 0, insert: text } });
        d.output.contentDOM.blur();
      },
      sample(name, lines),
    );
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("#output .cm-content")).toHaveScreenshot(
      `${name}.png`,
      { maxDiffPixelRatio: 0.002 },
    );
  });
}
