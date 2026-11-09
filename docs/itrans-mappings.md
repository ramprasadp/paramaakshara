# ITRANS mappings

The normative input table for Paramaakshara (TECH_SPEC §5). The code is
`frontend/src/conversion/itrans.ts`; its tables must match this file.
Converter version: `itrans-5.3+pak/2` (stored in project files).

Reference convention: **ITRANS 5.3**. Input is read by longest match, one
line at a time.

## Vowels

  ITRANS            Independent   After a consonant
  ----------------- ------------- -----------------
  `a`               अ             (inherent)
  `aa`, `A`         आ             ा
  `i`               इ             ि
  `ii`, `I`         ई             ी
  `u`               उ             ु
  `uu`, `U`         ऊ             ू
  `RRi`, `R^i`      ऋ             ृ
  `RRI`, `R^I`      ॠ             ॄ
  `LLi`, `L^i`      ऌ             ॢ
  `LLI`, `L^I`      ॡ             ॣ
  `e`               ए             े
  `ai`              ऐ             ै
  `o`               ओ             ो
  `au`              औ             ौ

## Consonants

  ITRANS                          Devanagari
  ------------------------------- -----------------
  `k kh g gh ~N`                  क ख ग घ ङ
  `ch Ch/chh j jh ~n/JN`          च छ ज झ ञ
  `T Th D Dh N`                   ट ठ ड ढ ण
  `t th d dh n`                   त थ द ध न
  `p ph b bh m`                   प फ ब भ म
  `y r l v/w`                     य र ल व
  `sh Sh/shh s h`                 श ष स ह
  `L`, `ld`                       ळ
  `x`, `kSh`                      क्ष
  `GY`, `j~n`, `dny`              ज्ञ
  `q K G z f .D .Dh` (nukta)      क़ ख़ ग़ ज़ फ़ ड़ ढ़

A consonant not followed by a vowel gets a virama (`agnim` → अग्निम्).

## Signs and other symbols

  ITRANS        Output              Notes
  ------------- ------------------- --------------------------------------
  `M`, `.n`     ं U+0902            anusvara
  `H`           ः U+0903            visarga
  `.N`          ँ U+0901            chandrabindu
  `.a`          ऽ U+093D            avagraha
  `.h`          ् U+094D            explicit virama
  `{}`          (nothing)           separates tokens: `k{}h` → क्ह, `ka{}i` → कइ
  `OM`          ॐ
  `|`, `||`     । ॥
  `0`–`9`       ०–९                 or ASCII digits (`editor.digits`)

Spaces, punctuation and characters that are not ASCII (for example
Devanagari already in the line) pass through unchanged.

## Vedic accents (TECH_SPEC §5.3)

  Input   Output         Name
  ------- -------------- ----------------
  `_`     ॒ U+0952        anudātta
  `'`     ॑ U+0951        svarita
  `'''`   ᳚ U+1CDA        double svarita

-   An accent must follow a vowel; anusvara, visarga and chandrabindu
    are written before it whichever order they are typed in (ADR 0002).
-   Runs of `'` of length 2 or 4+, `__`, and accents not following a
    vowel are left as typed and reported.

## Baraha spellings

Accepted as alternatives, so text can be typed as in Baraha. None of
them means anything in ITRANS 5.3, so they cannot change existing ITRANS
text. Taken from the legend in `testdata/vedic/baraha/README.md`.

  Baraha   Same as   Output
  -------- --------- ----------------------
  `Ru`     `R^i`     ऋ / ृ
  `RU`     `R^I`     ॠ / ॄ
  `~g`     `~N`      ङ
  `~j`     `~n`      ञ (so `j~j` gives ज्ञ)
  `~M`     `.N`      ँ

Example (Ṛgveda 10.90.1 typed as in Baraha):
`sa bhUmi'M vi_shvato' vRu_tvAtya'tiShThaddashA~ggu_lam` →
स भूमिं॑ वि॒श्वतो॑ वृ॒त्वात्य॑तिष्ठद्दशाङ्गु॒लम्

Not accepted: Baraha `G` (घ), because ITRANS `G` is ग़; Baraha `S`, `B`,
`c`, `E`, `O` (use `sh`, `bh`, `ch`, `e`, `o`); and Baraha's accent keys
`q`, `#`, `$` (the project uses `_`, `'`, `'''`).

## Reported problems

The converter never guesses. These are left as typed and reported, which
the editor shows as ⚠ (TECH_SPEC §4.4):

-   ASCII letters that start no ITRANS token (for example `B`, `E`, `S`,
    `c`, `R` on its own).
-   The accent problems above.

## Deviations from ITRANS 5.3

  Deviation                               Reason
  --------------------------------------- ----------------------------------
  Accents are `_`, `'`, `'''` instead of  Project accent scheme (§5.3).
  `\_`, `\'`.
  `'''` gives U+1CDA.                     Not in ITRANS 5.3.
  Signs are written before accents.       Rendering (ADR 0002).
  `{}` produces no character.             Some implementations insert ZWJ;
                                          hidden characters are not
                                          written (ADR 0003).
  ZWJ and ZWNJ have no input sequence     To be defined when needed (§5.2).
  yet.
  `Ru`, `RU`, `~g`, `~j`, `~M` are        Baraha spellings (above).
  accepted.

## Not yet supported

-   Nukta letters only as listed; no Bengali/other-script ITRANS letters.
-   ITRANS environment switches (`#sanskrit`, `##`) and comments.
