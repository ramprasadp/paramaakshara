// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { barahaToItrans, looksLikeBaraha } from "../../src/conversion/baraha";
import { transliterate } from "../../src/conversion/itrans";

describe("Baraha → ITRANS", () => {
  it("rewrites the accent keys and Baraha letters", () => {
    expect(
      barahaToItrans(
        "sa bhUmi#M viqshvato# vRuqtvAtya#tiShThaddashA~gguqlam || 10.090.01",
      ),
    ).toBe(
      "sa bhUmi'M vi_shvato' vR^i_tvAtya'tiShThaddashA~Ngu_lam || 10.090.01",
    );
    expect(
      barahaToItrans("svAhA$ puru#Sha: pAdo#&sya SraddhA Bava cid C G e E o O"),
    ).toBe("svAhA''' puru'ShaH pAdo'.asya shraddhA bhava chid Ch gh e E o O");
  });

  it("rewrites Baraha's capital aspirates, ou and oum", () => {
    expect(barahaToItrans("SiKAye PaT Jampa siddhou oum dhyAnaM soum")).toBe(
      "shikhAye phaT jhampa siddhau OM dhyAnaM saum",
    );
  });

  it("keeps e/E and o/O distinct", () => {
    expect(barahaToItrans("veMkaTESa gOvinda")).toBe("veMkaTEsha gOvinda");
  });

  it("converts to the expected Devanagari", () => {
    const r = transliterate(
      barahaToItrans(
        "sa bhUmi#M viqshvatO# vRuqtvAtya#tiShThaddashA~gguqlam || 10.090.01",
      ),
    );
    expect(r.text).toBe(
      "स भूमिं॑ वि॒श्वतो॑ वृ॒त्वात्य॑तिष्ठद्दशाङ्गु॒लम् ॥ १०.०९०.०१",
    );
    expect(r.issues).toEqual([]);
  });

  it("recognises Baraha text but not ordinary ITRANS", () => {
    expect(looksLikeBaraha("saqhasra#shIrShAq")).toBe(true);
    expect(looksLikeBaraha("svAhA$")).toBe(true);
    expect(looksLikeBaraha("sa_hasra'shIrShA_ puru'ShaH")).toBe(false);
    expect(looksLikeBaraha("agnimiiLe purohitaM")).toBe(false);
  });
});
