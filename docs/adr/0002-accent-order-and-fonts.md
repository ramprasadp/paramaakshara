# ADR 0002: Accent order and Devanagari font

-   **Status:** Accepted (2026-11-09).
-   **Spec:** TECH_SPEC §5.3, §6.8, §16.5, §18 decision 9.

## Context

The M1 spike screenshots showed dotted circles around anusvara and
chandrabindu in the Baraha samples, and the double svarita U+1CDA did
not render in Chromium. Both affect what the converter must output and
which font the app must ship.

## Method

Rendered test strings in Chromium, Firefox and WebKit (Playwright 1.65,
macOS) with the installed fonts Kohinoor Devanagari, Devanagari Sangam
MN and ITF Devanagari, and with Noto Sans Devanagari and Noto Serif
Devanagari loaded as web fonts (notofonts release, 2022 build):

-   accent then sign: भूमि॑ं सर्व॒ं ज्याया॑ँश्च, भ्य॒ः तिला॑ः
-   sign then accent: भूमिं॑ सर्वं॒ ज्यायाँ॑श्च, भ्यः॒ तिलाः॑
-   स्वाहा᳚ (U+1CDA) and स्वाहा॓ (U+0953)

## Results

  Case                         Kohinoor / ITF     Sangam MN     Noto Sans / Serif
  ---------------------------- ------------------ ------------- ------------------
  Accent, then sign            Dotted circle      Dotted circle Dotted circle
  Sign, then accent            Correct            Dotted circle Correct
  U+1CDA (double svarita)      Chromium: missing  same          Correct (two
                               glyph box;                       vertical strokes)
                               Firefox: on a
                               dotted circle;
                               WebKit: via
                               fallback font
  U+0953                       Single slanted     same          Single slanted
                               stroke                           stroke

Results were the same in all three engines except where noted.

The Baraha samples use accent-then-sign everywhere: 9 times in
purusha-sukta, 43 in viraja-homa, and never the other order.

## Decision

1.  **Order:** the converter writes anusvara, visarga or chandrabindu
    first and the accent after it (भूमिं॑). The reverse order is a new
    Clean up text fix (§6.8) for text from Baraha.
2.  **Font:** bundle Noto Sans Devanagari and Noto Serif Devanagari
    (OFL-1.1) and use them by default. They are the only tested fonts
    that render U+1CDA, so the double svarita depends on them. Devanagari
    Sangam MN is unsuitable for Vedic text.
3.  U+1CDA remains the encoding for the double svarita (§5.3); U+0953 is
    confirmed to render as a single slanted stroke.

## Consequences

-   Phase 3 font work starts from Noto; other Vedic fonts (Shobhika,
    Siddhanta) are evaluated against these same strings.
-   Kannada and Tamil fonts must be tested with the same strings in M8.
