# Baraha Vedic samples

Accented texts typed in Baraha by the project owner. Each sample is a
pair: the Baraha source (`*.baraha.txt`) and the Unicode text Baraha
produced from it (`*.unicode.txt`). Lines correspond one to one.

  Sample          Text                                   Tradition    Lines
  --------------- -------------------------------------- ------------ -----
  `purusha-sukta` Puruṣa Sūkta, Ṛgveda 10.90 (16 ṛks)    Ṛgveda       32
  `viraja-homa`   Virajā Homa mantras                    Taittirīya   58

Both use the same accent convention: anudātta below, svarita above,
udātta unmarked; the Taittirīya text also uses the double svarita.

## Baraha legend

Observed in these samples. The accent rows are verified line by line:
the count of each symbol in the source equals the count of its code
point in the Unicode text on every line of both samples.

  Baraha        Unicode output                    Paramaakshara ITRANS
  ------------- --------------------------------- ------------------------
  `q`           U+0952 anudātta ॒                  `_`
  `#`           U+0951 svarita ॑                   `'`
  `$`           U+0953 grave accent ॓ (see notes)  `'''` (U+1CDA)
  `H`           U+0903 visarga ः                  `H`
  `:`           U+003A ASCII colon (see notes)    `H`
  `~M`          U+0901 chandrabindu ँ              `.N`
  `&`           U+093D avagraha ऽ                 `.a`
  `~g`          ङ                                 `~N`
  `~j`          ञ                                 `~n`
  `j~j`         ज्ञ                                `j~n`
  `Ru`          ऋ / ृ                              `R^i`
  `ch`, `c`     च                                 `ch`
  `sh`, `S`     श                                 `sh`
  `B`           भ                                 `bh`
  `G`           घ                                 `gh`
  `e`, `o`      े ो (U+0947, U+094B)               `e`, `o`
  `E`, `O`      ॆ ॊ (U+0946, U+094A; see notes)    `e`, `o`
  `(gm)`        `(ग्म्)` as plain text             `(gm)` (ꣳ U+A8F3)
  `(gg)`        `(ग्ग्)` as plain text             `(gg)` (ꣴ U+A8F4)

## purusha-sukta

-   **Source:** https://sites.google.com/view/madhwapaddathi/sooktha_purusha
    (retrieved 2026-11-09).
-   **Corrections:** two typing slips (an extra `g` before `~g`) were
    corrected in both files. Nothing else was changed.

  ṛk   Published (Baraha / Unicode)              Corrected
  ---- ----------------------------------------- --------------------------------
  1    `dashAg~gguqlam` / दशाग्ङ्गु॒लम्             `dashA~gguqlam` / दशाङ्गु॒लम्
  4    `viShvaqg~gvya#` / विष्व॒ग्ङ्व्य॑             `viShvaq~gvya#` / विष्व॒ङ्व्य॑

## viraja-homa

-   **Source:** https://sites.google.com/view/madhwapaddathi/sooktha_virajahoma
    (retrieved 2026-11-09).
-   **Corrections:** one literal period inside a word was removed in both
    files. Nothing else was changed.

  Mantra   Published (Baraha / Unicode)   Corrected
  -------- ------------------------------ -------------------------
  66.2     `spar.Sa` / स्पर्.श              `sparSa` / स्पर्श

## Notes for tests

-   **Visarga as ASCII colon (purusha-sukta).** The source was typed with
    `:` rather than `H`, and Baraha passed the colon through, so the
    Unicode has U+003A, not ः U+0903. viraja-homa, typed with `H`, has
    proper visargas. Kept as produced to test paste preservation and the
    Clean up text command (TECH_SPEC §6.8).
-   **Double svarita as U+0953 (viraja-homa, 68 times).** Baraha's `$`
    produces U+0953 DEVANAGARI GRAVE ACCENT, which standard fonts draw as
    a single slanted stroke. Paramaakshara uses U+1CDA for the double
    svarita. Kept as produced to test the Clean up text command.
-   **Short e/o (viraja-homa, 113 vowel signs and 10 independent
    vowels).** Baraha's `E`/`O` produced the Dravidian short e/o
    (ॆ ॊ ऎ ऒ) instead of े ो ए ओ. Sanskrit has no short e/o. Kept as
    produced to test the Clean up text command.
-   **Accent before anusvara/visarga/chandrabindu.** Baraha always writes
    the accent first (भूमि॑ं, शुद्ध्य॒न्ता॒ं): 9 times in purusha-sukta, 43
    in viraja-homa. This order renders with a dotted circle in every font
    tested, so Paramaakshara writes the sign first (ADR 0002). Kept as
    produced to test the Clean up text command.
-   **`(gm)` / `(gg)` (viraja-homa, 7 and 15 times).** Baraha writes the
    Taittirīya anusvara as plain text in parentheses; where an accent
    follows (`भू॑यास॒(ग्ग्)॒`) it sits on `)`. Paramaakshara encodes it as
    ꣳ / ꣴ (U+A8F3 / U+A8F4), and Clean up text converts Baraha's form.
-   The Baraha source of viraja-homa contains a few no-break spaces
    (U+00A0).
-   Neither text contains ZWJ/ZWNJ. Verse numbers use Devanagari digits.
