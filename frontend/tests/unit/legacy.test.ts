// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { LegacyDocument } from "../../src/services/api";
import { pageText, summary } from "../../src/ui/legacy";

// Shaped like the daemon's answer for mantrastotra.pdf (TECH_SPEC §6.10).
const doc: LegacyDocument = {
  pages: [
    { number: 1, lines: ["मन्त्रस्तोत्रसङ्ग्रहः"] },
    { number: 2, lines: ["Copies : 2000", "Price ₹.50/-"] },
    { number: 3, lines: ["स्ववर्ण‹22›श्रमोचितं"] },
  ],
  fonts: [
    { name: "SHREE-SAN-0962", table: "SHREE-SAN-0962", bytes: 300 },
    { name: "SHREE-SAN-0964", table: "SHREE-SAN-0962", bytes: 20 },
    { name: "Arial", table: "", bytes: 10 },
  ],
  unmapped: [{ font: "SHREE-SAN-0962", code: "22", count: 1 }],
};

describe("pageText", () => {
  it("joins the chosen pages with a blank line between them", () => {
    expect(pageText(doc, 2, 3)).toBe(
      "Copies : 2000\nPrice ₹.50/-\n\nस्ववर्ण‹22›श्रमोचितं",
    );
    expect(pageText(doc, 1, 1)).toBe("मन्त्रस्तोत्रसङ्ग्रहः");
  });
});

describe("summary", () => {
  it("names converted and plain fonts and the unmapped codes", () => {
    expect(summary(doc)).toEqual([
      { text: "3 pages.", warn: false },
      {
        text: "Converted: SHREE-SAN-0962, SHREE-SAN-0964 (as SHREE-SAN-0962).",
        warn: false,
      },
      { text: "Read as plain text (no table): Arial.", warn: false },
      {
        text: "1 glyph has no table entry and is kept as ‹code›: 22 ×1 in SHREE-SAN-0962.",
        warn: true,
      },
    ]);
  });

  it("warns when no font has a table", () => {
    const plain: LegacyDocument = {
      pages: [{ number: 1, lines: ["Hello"] }],
      fonts: [{ name: "Times", table: "", bytes: 5 }],
      unmapped: [],
    };
    const s = summary(plain);
    expect(s[1]).toMatchObject({ warn: true });
    expect(s[1]?.text).toMatch(/None of the fonts/);
    expect(s[2]).toEqual({
      text: "Read as plain text (no table): Times.",
      warn: true,
    });
  });
});
