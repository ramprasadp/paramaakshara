// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanup } from "../../src/conversion/cleanup";

const sample = (name: string) =>
  readFileSync(
    new URL(`../../../testdata/vedic/baraha/${name}`, import.meta.url),
    "utf8",
  );

describe("cleanup (§6.8)", () => {
  it("puts anusvara, visarga and chandrabindu before the accent", () => {
    const r = cleanup("भूमि॑ं सर्व॒ं ज्याया॑ँश्च भ्य॒ः", ["accent-order"]);
    expect(r.text).toBe("भूमिं॑ सर्वं॒ ज्यायाँ॑श्च भ्यः॒");
    expect(r.counts["accent-order"]).toBe(4);
  });

  it("converts Baraha's double svarita U+0953 to U+1CDA", () => {
    expect(cleanup("स्वाहा॓", ["double-svarita"]).text).toBe("स्वाहा᳚");
  });

  it("converts Dravidian short e/o to Sanskrit e/o", () => {
    const r = cleanup("जुहॊमि मॆ ऎक ऒं", ["sanskrit-e-o"]);
    expect(r.text).toBe("जुहोमि मे एक ओं");
    expect(r.counts["sanskrit-e-o"]).toBe(4);
  });

  it("turns a colon after Devanagari or Kannada into that script's visarga, and nothing else", () => {
    const r = cleanup("पुरु॑ष: ರಾಮ: note: 10:30 ॥:", ["visarga"]);
    expect(r.text).toBe("पुरु॑षः ರಾಮಃ note: 10:30 ॥ः");
    expect(r.counts.visarga).toBe(3);
  });

  it("changes nothing in clean text", () => {
    const clean = "स॒हस्र॑शीर्षा॒ पुरु॑षः भूमिं॑ स्वाहा᳚";
    const r = cleanup(clean);
    expect(r.text).toBe(clean);
    expect(Object.values(r.counts).every((n) => n === 0)).toBe(true);
  });

  it("finds the known issues in the Baraha samples", () => {
    // 9 accent + anusvara/chandrabindu, plus 11 accent + colon that
    // become accent + visarga once the colon is fixed.
    expect(cleanup(sample("purusha-sukta.unicode.txt")).counts).toEqual({
      visarga: 27,
      "double-svarita": 0,
      "sanskrit-e-o": 0,
      "accent-order": 20,
    });
    expect(cleanup(sample("viraja-homa.unicode.txt")).counts).toEqual({
      visarga: 0,
      "double-svarita": 68,
      "sanskrit-e-o": 123,
      "accent-order": 43,
    });
  });
});
