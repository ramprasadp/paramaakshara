# Changelog

All notable changes. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

-   Kannada/Tamil short e/o: a per-document e/o reading in the ITRANS
    pane. In the Kannada/Tamil reading `e`/`o` are short (ಎ ಒ) and `E`/`O`
    long (ಏ ಓ), as in Baraha; the default Sanskrit reading treats them
    the same. Saved in project files; Baraha paste and import follow it.
-   `kOM` now gives कों instead of क्ॐ.

-   Export PDF: prints the output on its own (title, A4 or Letter, text
    size) through the browser's Save as PDF, with the bundled fonts
    embedded.

## 0.1.0 — 2026-11-09

### Editor

-   Two panes: ITRANS input and Unicode output, linked line by line. A
    hand-edited output line stops following its ITRANS (✎), and
    Regenerate line / Regenerate all brings it back. Undo is per pane and
    never discards manual output.
-   Output in Devanagari, Kannada or Tamil (superscript convention);
    switching is one undo step and reports anything not represented
    exactly.
-   Vedic accents in ITRANS: `_` anudātta, `'` svarita, `'''` double
    svarita; Taittirīya `(gm)`/`(gg)` anusvara (ꣳ ꣴ). Anusvara, visarga and
    chandrabindu are written before the accent.
-   Baraha: paste or import text typed in Baraha (`q`, `#`, `$` …), and
    Baraha spellings `Ru`, `~g`, `~j`, `~M` in ITRANS.
-   Clean up text for Baraha output: accent order, double svarita U+0953,
    short e/o, colon visarga, `(ग्म्)`/`(ग्ग्)`.
-   Vedic symbol palette by tradition (Ṛgveda, Taittirīya), with
    missing-glyph marks.
-   Bundled Noto Serif Devanagari, Kannada and Tamil.

### Files

-   Project files (`.paramaakshara.json`) keep ITRANS, output and edit
    marks; plain text and ITRANS files too.
-   Atomic saves with conflict detection, backups and crash recovery.

### Program

-   Local daemon on 127.0.0.1 with one-time sign-in links, Host and
    Origin checks; second launch opens the running instance; Quit from
    the editor.
-   macOS app (universal), Linux binaries, Docker image.
