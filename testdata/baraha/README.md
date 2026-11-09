# Baraha stotra samples

Stotras typed in Baraha by the project owner (not Vedic; no accents).
They test the Baraha → ITRANS rewriting (`frontend/src/conversion/
baraha.ts`) and the ITRANS converter on ordinary Sanskrit text. Vedic
samples are in `../vedic/baraha/`.

  Sample                 Text                                   Files                     Lines
  ---------------------- -------------------------------------- ------------------------- -----
  `aditya-hrudaya`       Āditya Hṛdaya stotra, with nyāsa        Baraha source + Unicode    93
  `narasimha-vijendra`   Ṣoḍaśabāhu Narasiṃha stotra (Vijayīndra Baraha source only         36
                         Tīrtha)

## Sources (retrieved 2026-11-09)

-   https://sites.google.com/view/madhwapaddathi/stotra_adityahrudaya —
    the Baraha source and the Devanagari Baraha produced, both on the
    page. The page title lines ("Aditya Hrudaya", the PDF link) are left
    out.
-   https://sites.google.com/view/madhwapaddathi/stotra_narasimha_vijendra —
    the Baraha source only (the Devanagari is in a PDF). Blank lines and
    the page title lines are left out.

Nothing else was changed.

## Baraha keys added by these samples

In addition to the legend in `../vedic/baraha/README.md`:

  Baraha              Output   ITRANS
  ------------------- -------- --------
  `K`                 ख        `kh`
  `P`                 फ        `ph`
  `J`                 झ        `jh`
  `ou`                औ        `au`
  `oum` (whole word)  ॐ        `OM`

## Known differences

-   **aditya-hrudaya line 79:** the source has `kRcCreSu`, a typing slip
    for `kRucCreShu` (कृच्छ्रेषु). Baraha dropped the stray `R` and wrote
    क्च्छ्रेशु; Paramaakshara keeps the `R` and reports it (⚠). The test
    expects the report.
-   In a few words the source has `S` (श) where the word needs `Sh` (ष),
    e.g. `bhayeSu` (भयेशु) for `bhayeShu` (भयेषु). These are spelling
    questions in the text, not conversion differences: Baraha and
    Paramaakshara both write श for `S`.
