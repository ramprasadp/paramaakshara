# ADR 0005: Importing PDFs typeset with legacy fonts

-   **Status:** Accepted (2026-11-14).
-   **Spec:** TECH_SPEC §6.10, §9.3, §18 decision 17.

## Context

Much Sanskrit and Vedic text exists only as PDFs typeset with 8-bit
Indic fonts (Shree-Lipi, Baraha BRH, Sanskrit 99, ...). Their glyphs are
stored as Latin bytes, often without a `/ToUnicode` map, so copying from
a PDF viewer gives Latin characters. The same byte means different
glyphs in different fonts, and fonts change mid-word, so the conversion
needs each byte's font: the PDF itself, not text copied from it.

`internal/pdfread`, `internal/legacyfont` and `cmd/legacyfont` were
written to build a table for `SHREE-SAN-0962` from `mantrastotra.pdf`
(`docs/legacy-fonts.md`). The question is how the editor uses them.

## Options

1.  **Daemon endpoint.** The browser sends the chosen PDF to
    `POST /api/import/legacy-pdf`; the daemon reads it with the existing
    Go code and returns the converted lines and a report. One converter,
    already tested against verified page readings; no new dependency.
    It is the first endpoint that receives a file to parse rather than a
    document to store.
2.  **Port to TypeScript.** Reader and converter in the browser, keeping
    "import needs no endpoint". Duplicates the PDF reader (and needs
    `DecompressionStream` for Flate) and the reordering rules, and the
    developer tool would still be Go, so the two could drift.
3.  **PDF.js in the browser.** A large dependency that still does not
    convert the glyphs; only the reading part would be replaced.
4.  **Developer tool only.** Users run `go run ./cmd/legacyfont convert`
    and paste the result. Not usable by the people the editor is for.

## Decision

Option 1. The daemon parses the PDF in memory and stores nothing. The
request is limited to four times `documents.max_document_bytes`; the
reader limits nesting (100 levels) and decoded stream and page content
(64 MiB), and handles no encryption and only the Flate filter. The
response holds pages of converted lines, the fonts with their tables,
and the codes no table entry covered (kept in the text as `‹XX›`).

The browser shows the report, a page range and a preview, then passes
the chosen pages to the existing Import Unicode dialog, which rewrites
them in ITRANS with its round-trip check (§6.9). The text is not
logged.

## Consequences

-   `internal/pdfread` is now reachable from the browser through the
    session-protected API, so its limits are security requirements and
    have tests (deep nesting, decompression bombs).
-   Tables stay data (`internal/legacyfont/tables/*.json`), built only
    from page readings a person checked, as the conversion rules in
    AGENTS.md require. Supporting another font is a new table and its
    tests; no code change unless the font needs a new reordering kind.
-   Scanned PDFs have no text to convert; the dialog says so. OCR is a
    non-goal (§1.2).
