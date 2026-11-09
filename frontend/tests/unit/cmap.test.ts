// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coveredCodePoints } from "../../src/fonts/cmap";

const font = readFileSync(
  new URL(
    "../../public/fonts/NotoSerifDevanagari-Regular.ttf",
    import.meta.url,
  ),
);

describe("bundled Noto Serif Devanagari", () => {
  const covered = coveredCodePoints(
    font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength),
  );

  it("covers the accents used by the project (ADR 0002)", () => {
    for (const cp of [
      0x0951, 0x0952, 0x1cda, 0x0902, 0x0903, 0x0901, 0x093d, 0x0950,
    ]) {
      expect(covered.has(cp), cp.toString(16)).toBe(true);
    }
  });

  it("covers Devanagari letters and not unrelated scripts", () => {
    expect(covered.has(0x0915)).toBe(true); // क
    expect(covered.has(0x0b95)).toBe(false); // Tamil க
  });
});
