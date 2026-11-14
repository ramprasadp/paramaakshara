# ADR 0004: PDFs made by a headless browser

-   **Status:** Accepted (2026-11-14).
-   **Spec:** TECH_SPEC §10.1a, §10.1b, §18 decision 15.

## Context

Export all must write `name.pdf` into a document folder next to the
two text files. Export PDF (§10.1a) prints through the browser's print
dialog, where the user picks the folder; a web page cannot save a PDF
into a folder itself. The PDF must shape Devanagari, Kannada and Tamil
conjuncts and place the Vedic accents exactly as on screen, with the
bundled fonts embedded.

## Options

1.  **Daemon runs an installed Chromium-based browser headless**
    (`--headless --print-to-pdf`). Same Blink shaping that the rendering
    tests check; no Go dependency (only `os/exec`); about 100 lines.
    Needs Chrome, Edge, Chromium or Brave on the computer.
2.  **Native macOS helper** (Swift, WebKit `createPDF`). macOS only, a
    second program to build and sign, WebKit rather than Blink.
3.  **Pure Go** (`go-text/typesetting` for shaping plus a PDF writer).
    Portable, but line layout, GPOS mark placement and ToUnicode maps
    are a large amount of new code, and two dependencies.
4.  **In the browser** (HarfBuzz compiled to WebAssembly plus a PDF
    writer). Large custom glyph-drawing code; the save API would need
    binary content.
5.  **External typesetter** (Typst, WeasyPrint, LibreOffice). Rarely
    installed.

## Decision

Option 1. The daemon writes a page holding only the escaped text and
the bundled fonts (embedded in the binary from `frontend/public/fonts`)
to a temporary folder, with a Content Security Policy that allows
nothing but those fonts, and runs the browser with a throwaway profile
and a 60-second limit. The PDF goes through `Store.Export`, with the
same revision check, backups and atomic replace as Save.

The print dialog stays: Export PDF still uses it, and Export all falls
back to it when no browser is found (for example in the container).

## Consequences

-   PDF export from Export all depends on a browser being installed; the
    user's own browser for the editor can be any.
-   No new module; nothing to add to `THIRD_PARTY_NOTICES.md`.
-   Some Chromium builds exit with an error after writing the PDF while
    shutting down; a complete PDF (ending in `%%EOF`) is accepted.
-   `internal/pdf` tests make a real PDF when a browser is found
    (`PARAMAAKSHARA_PDF_BROWSER` overrides the search) and are skipped
    otherwise; the e2e daemon uses Playwright's Chromium.
