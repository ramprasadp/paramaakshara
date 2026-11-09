// SPDX-License-Identifier: GPL-3.0-or-later

// Script conversion (TECH_SPEC §7). Expected Kannada and Tamil are written
// by hand from standard spelling and the documented Tamil convention.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanup } from "../../src/conversion/cleanup";
import {
  convertScript,
  fromDevanagari,
  toDevanagari,
} from "../../src/conversion/script";

const kn = (s: string) => fromDevanagari(s, "kannada");
const ta = (s: string) => fromDevanagari(s, "tamil");

describe("Devanagari → Kannada", () => {
  it("maps letters, vowel signs, signs and digits", () => {
    expect(kn("अग्निमीळे पुरोहितं").text).toBe("ಅಗ್ನಿಮೀಳೇ ಪುರೋಹಿತಂ");
    expect(kn("कृष्णः यज्ञ १०").text).toBe("ಕೃಷ್ಣಃ ಯಜ್ಞ ೧೦");
    expect(kn("ताँ सोऽहम्").text).toBe("ತಾಁ ಸೋಽಹಮ್");
  });

  it("keeps Vedic accents and dandas", () => {
    const r = kn("अ॒ग्निमी॑ळे स्वाहा᳚ ॥");
    expect(r.text).toBe("ಅ॒ಗ್ನಿಮೀ॑ಳೇ ಸ್ವಾಹಾ᳚ ॥");
    expect(r.issues).toEqual([]);
  });

  it("writes OM as ಓಂ and reports it", () => {
    const r = kn("ॐ नमः");
    expect(r.text).toBe("ಓಂ ನಮಃ");
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.message).toMatch(/not reversible/);
  });
});

describe("Devanagari → Tamil (superscript convention)", () => {
  it("writes aspirated and voiced stops with superscripts at the end of the syllable", () => {
    expect(ta("भगवद्गीता").text).toBe("ப⁴க³வத்³கீ³தா");
    expect(ta("धर्म").text).toBe("த⁴ர்ம");
    expect(ta("खड्ग छाया झष ठ ढ थ फ").text).toBe(
      "க²ட்³க³ சா²யா ஜ²ஷ ட² ட⁴ த² ப²",
    );
  });

  it("puts the superscript after vowel sign and accents, before anusvara and visarga", () => {
    expect(ta("भू॑").text).toBe("பூ॑⁴");
    expect(ta("गं॒").text).toBe("க³ம்॒");
    expect(ta("भः").text).toBe("ப⁴ஃ");
  });

  it("maps Grantha letters, anusvara (ம்), visarga, OM and digits", () => {
    expect(ta("अग्निमीळे पुरोहितं").text).toBe("அக்³நிமீளே புரோஹிதம்");
    expect(ta("जशषसह नमः ॐ १०").text).toBe("ஜஶஷஸஹ நமஃ ௐ ௧௦");
  });

  it("approximates vocalic r and reports it", () => {
    const r = ta("कृष्ण ऋषि");
    expect(r.text).toBe("க்ருஷ்ண ருஷி");
    expect(r.issues.map((i) => i.text)).toEqual(["ृ", "ऋ"]);
  });

  it("keeps characters Tamil cannot write, and reports them", () => {
    const r = ta("ताँ सोऽहम्");
    expect(r.text).toBe("தாँ ஸோऽஹம்");
    expect(r.issues.map((i) => i.text)).toEqual(["ँ", "ऽ"]);
  });
});

describe("back to Devanagari", () => {
  it("reads superscripted Tamil and Kannada", () => {
    expect(toDevanagari("ப⁴க³வத்³கீ³தா").text).toBe("भगवद्गीता");
    expect(toDevanagari("பூ॑⁴ க³ம்॒").text).toBe("भू॑ गम्॒");
    expect(toDevanagari("ಅ॒ಗ್ನಿಮೀ॑ಳೇ").text).toBe("अ॒ग्निमी॑ळे");
  });

  it("converts mixed-script lines and leaves Latin text alone", () => {
    expect(convertScript("राम ರಾಮ ராம note", "kannada").text).toBe(
      "ರಾಮ ರಾಮ ರಾಮ note",
    );
  });

  it("reports a superscript that modifies nothing", () => {
    const r = toDevanagari("ம²");
    expect(r.text).toBe("म²");
    expect(r.issues).toHaveLength(1);
  });
});

describe("round trips on the Baraha samples (after Clean up)", () => {
  const lines = ["purusha-sukta", "viraja-homa"].flatMap((name) =>
    cleanup(
      readFileSync(
        new URL(
          `../../../testdata/vedic/baraha/${name}.unicode.txt`,
          import.meta.url,
        ),
        "utf8",
      ),
    )
      .text.replace(/\n$/, "")
      .split("\n"),
  );

  it("Devanagari → Kannada → Devanagari is exact", () => {
    for (const line of lines) {
      const k = kn(line);
      expect(k.issues.filter((i) => /not reversible/.test(i.message))).toEqual(
        [],
      );
      expect(toDevanagari(k.text).text).toBe(line);
    }
  });

  it("Devanagari → Tamil → Devanagari is exact except where reported as approximate", () => {
    let approximate = 0;
    for (const line of lines) {
      const t = ta(line);
      if (t.issues.some((i) => /approximately/.test(i.message))) {
        approximate++;
        continue;
      }
      // Anusvara is written ம் and reads back as म् by convention.
      expect(toDevanagari(t.text).text).toBe(
        line.replace(/\u0902/g, "\u092E\u094D"),
      );
    }
    // ृ and ऋ occur in a minority of lines; every other line round-trips.
    expect(approximate).toBeLessThan(lines.length / 2);
  });
});
