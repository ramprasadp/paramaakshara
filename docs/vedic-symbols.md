# Vedic symbols

The documented inventory required by TECH_SPEC §6.3. It matches the
palette's catalogue (`frontend/src/vedic/catalogue.ts`). Unicode names
and categories are from the Unicode Character Database 13.0.0.

**Traditional meanings are given only where verified** against the
project's sample texts (`testdata/vedic/baraha/`). Everything else shows
its Unicode name only; a Unicode name is not a statement of Vedic usage
(for example U+0951 is named UDATTA but marks the svarita in the
Ṛgveda and Taittirīya texts here).

Rendering was checked with the bundled Noto Serif Devanagari in Chromium,
Firefox and WebKit on macOS (screenshot tests in
`frontend/tests/e2e/rendering.spec.ts`). "no glyph" means the font has no
character for it; the palette marks such symbols.

Sign order: anusvara, visarga and chandrabindu come before an accent
(ADR 0002).

## Accents in use

| Glyph | Code point | Unicode name | Tradition(s) | Vedic meaning | Category | Input | Noto Serif Devanagari | Reference |
|---|---|---|---|---|---|---|---|---|
| ◌॒ | U+0952 | DEVANAGARI STRESS SIGN ANUDATTA | Ṛgveda, Taittirīya | Anudātta (low tone) | Mn | `_` | yes | purusha-sukta, viraja-homa |
| ◌॑ | U+0951 | DEVANAGARI STRESS SIGN UDATTA | Ṛgveda, Taittirīya | Svarita (Unicode calls it UDATTA) | Mn | `'` | yes | purusha-sukta, viraja-homa |
| ◌᳚ | U+1CDA | VEDIC TONE DOUBLE SVARITA | Taittirīya | Double (dīrgha) svarita | Mn | `'''` | yes | viraja-homa |

U+0953 DEVANAGARI GRAVE ACCENT is what Baraha produces for the double
svarita; it renders as a single slanted stroke. Paramaakshara does not
produce it, and Clean up text converts it to U+1CDA (§6.8).

## Signs

| Glyph | Code point | Unicode name | Tradition(s) | Vedic meaning | Category | Input | Noto Serif Devanagari | Reference |
|---|---|---|---|---|---|---|---|---|
| ◌ँ | U+0901 | DEVANAGARI SIGN CANDRABINDU | — | not verified | Mn | — | yes | Unicode chart |
| ◌ं | U+0902 | DEVANAGARI SIGN ANUSVARA | — | not verified | Mn | — | yes | Unicode chart |
| ◌ः | U+0903 | DEVANAGARI SIGN VISARGA | — | not verified | Mc | — | yes | Unicode chart |
| ऽ | U+093D | DEVANAGARI SIGN AVAGRAHA | — | not verified | Lo | — | yes | Unicode chart |
| ॐ | U+0950 | DEVANAGARI OM | — | not verified | Lo | — | yes | Unicode chart |
| । | U+0964 | DEVANAGARI DANDA | — | not verified | Po | — | yes | Unicode chart |
| ॥ | U+0965 | DEVANAGARI DOUBLE DANDA | — | not verified | Po | — | yes | Unicode chart |
| ◌॓ | U+0953 | DEVANAGARI GRAVE ACCENT | — | not verified | Mn | — | yes | Unicode chart |
| ◌॔ | U+0954 | DEVANAGARI ACUTE ACCENT | — | not verified | Mn | — | yes | Unicode chart |

## Vedic Extensions (U+1CD0–U+1CFF)

| Glyph | Code point | Unicode name | Tradition(s) | Vedic meaning | Category | Input | Noto Serif Devanagari | Reference |
|---|---|---|---|---|---|---|---|---|
| ◌᳐ | U+1CD0 | VEDIC TONE KARSHANA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳑ | U+1CD1 | VEDIC TONE SHARA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳒ | U+1CD2 | VEDIC TONE PRENKHA | — | not verified | Mn | — | yes | Unicode chart |
| ᳓ | U+1CD3 | VEDIC SIGN NIHSHVASA | — | not verified | Po | — | yes | Unicode chart |
| ◌᳔ | U+1CD4 | VEDIC SIGN YAJURVEDIC MIDLINE SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳕ | U+1CD5 | VEDIC TONE YAJURVEDIC AGGRAVATED INDEPENDENT SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳖ | U+1CD6 | VEDIC TONE YAJURVEDIC INDEPENDENT SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳗ | U+1CD7 | VEDIC TONE YAJURVEDIC KATHAKA INDEPENDENT SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳘ | U+1CD8 | VEDIC TONE CANDRA BELOW | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳙ | U+1CD9 | VEDIC TONE YAJURVEDIC KATHAKA INDEPENDENT SVARITA SCHROEDER | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳚ | U+1CDA | VEDIC TONE DOUBLE SVARITA | Taittirīya | Double (dīrgha) svarita | Mn | `'''` | yes | viraja-homa |
| ◌᳛ | U+1CDB | VEDIC TONE TRIPLE SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳜ | U+1CDC | VEDIC TONE KATHAKA ANUDATTA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳝ | U+1CDD | VEDIC TONE DOT BELOW | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳞ | U+1CDE | VEDIC TONE TWO DOTS BELOW | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳟ | U+1CDF | VEDIC TONE THREE DOTS BELOW | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳠ | U+1CE0 | VEDIC TONE RIGVEDIC KASHMIRI INDEPENDENT SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳡ | U+1CE1 | VEDIC TONE ATHARVAVEDIC INDEPENDENT SVARITA | — | not verified | Mc | — | yes | Unicode chart |
| ◌᳢ | U+1CE2 | VEDIC SIGN VISARGA SVARITA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳣ | U+1CE3 | VEDIC SIGN VISARGA UDATTA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳤ | U+1CE4 | VEDIC SIGN REVERSED VISARGA UDATTA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳥ | U+1CE5 | VEDIC SIGN VISARGA ANUDATTA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳦ | U+1CE6 | VEDIC SIGN REVERSED VISARGA ANUDATTA | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳧ | U+1CE7 | VEDIC SIGN VISARGA UDATTA WITH TAIL | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳨ | U+1CE8 | VEDIC SIGN VISARGA ANUDATTA WITH TAIL | — | not verified | Mn | — | yes | Unicode chart |
| ᳩ | U+1CE9 | VEDIC SIGN ANUSVARA ANTARGOMUKHA | — | not verified | Lo | — | yes | Unicode chart |
| ᳪ | U+1CEA | VEDIC SIGN ANUSVARA BAHIRGOMUKHA | — | not verified | Lo | — | yes | Unicode chart |
| ᳫ | U+1CEB | VEDIC SIGN ANUSVARA VAMAGOMUKHA | — | not verified | Lo | — | yes | Unicode chart |
| ᳬ | U+1CEC | VEDIC SIGN ANUSVARA VAMAGOMUKHA WITH TAIL | — | not verified | Lo | — | yes | Unicode chart |
| ◌᳭ | U+1CED | VEDIC SIGN TIRYAK | — | not verified | Mn | — | yes | Unicode chart |
| ᳮ | U+1CEE | VEDIC SIGN HEXIFORM LONG ANUSVARA | — | not verified | Lo | — | yes | Unicode chart |
| ᳯ | U+1CEF | VEDIC SIGN LONG ANUSVARA | — | not verified | Lo | — | yes | Unicode chart |
| ᳰ | U+1CF0 | VEDIC SIGN RTHANG LONG ANUSVARA | — | not verified | Lo | — | yes | Unicode chart |
| ᳱ | U+1CF1 | VEDIC SIGN ANUSVARA UBHAYATO MUKHA | — | not verified | Lo | — | yes | Unicode chart |
| ᳲ | U+1CF2 | VEDIC SIGN ARDHAVISARGA | — | not verified | Lo | — | yes | Unicode chart |
| ᳳ | U+1CF3 | VEDIC SIGN ROTATED ARDHAVISARGA | — | not verified | Lo | — | yes | Unicode chart |
| ◌᳴ | U+1CF4 | VEDIC TONE CANDRA ABOVE | — | not verified | Mn | — | yes | Unicode chart |
| ᳵ | U+1CF5 | VEDIC SIGN JIHVAMULIYA | — | not verified | Lo | — | yes | Unicode chart |
| ᳶ | U+1CF6 | VEDIC SIGN UPADHMANIYA | — | not verified | Lo | — | yes | Unicode chart |
| ◌᳷ | U+1CF7 | VEDIC SIGN ATIKRAMA | — | not verified | Mc | — | no glyph | Unicode chart |
| ◌᳸ | U+1CF8 | VEDIC TONE RING ABOVE | — | not verified | Mn | — | yes | Unicode chart |
| ◌᳹ | U+1CF9 | VEDIC TONE DOUBLE RING ABOVE | — | not verified | Mn | — | yes | Unicode chart |
| ᳺ | U+1CFA | VEDIC SIGN DOUBLE ANUSVARA ANTARGOMUKHA | — | not verified | Lo | — | no glyph | Unicode chart |

## Devanagari Extended (U+A8E0–U+A8FF)

| Glyph | Code point | Unicode name | Tradition(s) | Vedic meaning | Category | Input | Noto Serif Devanagari | Reference |
|---|---|---|---|---|---|---|---|---|
| ◌꣠ | U+A8E0 | COMBINING DEVANAGARI DIGIT ZERO | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣡ | U+A8E1 | COMBINING DEVANAGARI DIGIT ONE | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣢ | U+A8E2 | COMBINING DEVANAGARI DIGIT TWO | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣣ | U+A8E3 | COMBINING DEVANAGARI DIGIT THREE | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣤ | U+A8E4 | COMBINING DEVANAGARI DIGIT FOUR | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣥ | U+A8E5 | COMBINING DEVANAGARI DIGIT FIVE | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣦ | U+A8E6 | COMBINING DEVANAGARI DIGIT SIX | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣧ | U+A8E7 | COMBINING DEVANAGARI DIGIT SEVEN | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣨ | U+A8E8 | COMBINING DEVANAGARI DIGIT EIGHT | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣩ | U+A8E9 | COMBINING DEVANAGARI DIGIT NINE | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣪ | U+A8EA | COMBINING DEVANAGARI LETTER A | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣫ | U+A8EB | COMBINING DEVANAGARI LETTER U | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣬ | U+A8EC | COMBINING DEVANAGARI LETTER KA | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣭ | U+A8ED | COMBINING DEVANAGARI LETTER NA | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣮ | U+A8EE | COMBINING DEVANAGARI LETTER PA | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣯ | U+A8EF | COMBINING DEVANAGARI LETTER RA | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣰ | U+A8F0 | COMBINING DEVANAGARI LETTER VI | — | not verified | Mn | — | yes | Unicode chart |
| ◌꣱ | U+A8F1 | COMBINING DEVANAGARI SIGN AVAGRAHA | — | not verified | Mn | — | yes | Unicode chart |
| ꣲ | U+A8F2 | DEVANAGARI SIGN SPACING CANDRABINDU | — | not verified | Lo | — | yes | Unicode chart |
| ꣳ | U+A8F3 | DEVANAGARI SIGN CANDRABINDU VIRAMA | — | not verified | Lo | — | yes | Unicode chart |
| ꣴ | U+A8F4 | DEVANAGARI SIGN DOUBLE CANDRABINDU VIRAMA | — | not verified | Lo | — | yes | Unicode chart |
| ꣵ | U+A8F5 | DEVANAGARI SIGN CANDRABINDU TWO | — | not verified | Lo | — | yes | Unicode chart |
| ꣶ | U+A8F6 | DEVANAGARI SIGN CANDRABINDU THREE | — | not verified | Lo | — | yes | Unicode chart |
| ꣷ | U+A8F7 | DEVANAGARI SIGN CANDRABINDU AVAGRAHA | — | not verified | Lo | — | yes | Unicode chart |
| ꣸ | U+A8F8 | DEVANAGARI SIGN PUSHPIKA | — | not verified | Po | — | yes | Unicode chart |
| ꣹ | U+A8F9 | DEVANAGARI GAP FILLER | — | not verified | Po | — | yes | Unicode chart |
| ꣺ | U+A8FA | DEVANAGARI CARET | — | not verified | Po | — | yes | Unicode chart |
| ꣻ | U+A8FB | DEVANAGARI HEADSTROKE | — | not verified | Lo | — | yes | Unicode chart |
| ꣼ | U+A8FC | DEVANAGARI SIGN SIDDHAM | — | not verified | Po | — | yes | Unicode chart |
| ꣽ | U+A8FD | DEVANAGARI JAIN OM | — | not verified | Lo | — | yes | Unicode chart |
| ꣾ | U+A8FE | DEVANAGARI LETTER AY | — | not verified | Lo | — | yes | Unicode chart |
| ◌ꣿ | U+A8FF | DEVANAGARI VOWEL SIGN AY | — | not verified | Mn | — | yes | Unicode chart |

## Open questions

-   Taittirīya `(gm)` / `(gg)` anusvara: currently plain text in
    parentheses. Candidate encodings are U+A8F3 DEVANAGARI SIGN
    CANDRABINDU VIRAMA and U+A8F4 DEVANAGARI SIGN DOUBLE CANDRABINDU
    VIRAMA; to be decided with the project owner.
-   Further traditions (Śukla Yajurveda, Sāmaveda numerals) need verified
    sample texts before their meanings are listed.
