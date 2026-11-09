# Development plan

Milestones for version 1 of Paramaakshara. Each milestone ends in
something runnable and testable. The riskiest parts (editor component,
segment model) come first. Section numbers refer to `TECH_SPEC.md`.

## Storage

There is no database. Everything is a file or bundled data:

  Data                         Where
  ---------------------------- ---------------------------------------------
  Documents                    `.paramaakshara.json` / `.txt` in document
                               folders (§10)
  Settings                     `config.json` (§9.6)
  Recovery, backups            Files in the app data directory (§10.4)
  Mapping tables               JSON bundled into the frontend, read-only

Mapping tables:

1.  ITRANS → Devanagari, including alternatives, digits, `.h`, `{}`, OM,
    dandas (§5.2).
2.  Vedic accents `_`, `'`, `'''` and their rules (§5.3).
3.  Script conversion Devanagari ↔ Kannada and Devanagari ↔ Tamil
    superscript (§7). ITRANS converts only to Devanagari; Kannada and
    Tamil are produced from Devanagari, so there is one pipeline.
4.  Vedic symbol catalogue, which drives the palette and
    `docs/vedic-symbols.md` (§6.3).

## Test references

-   ITRANS: sanskritdocuments.org texts.
-   Vedic: the project owner's Baraha texts, as source + Unicode pairs in
    `testdata/vedic/baraha/`.

## Milestones

### M0 --- Scaffolding

-   `go.mod` (Go 1.24+), `cmd/paramaakshara`, Vite + TypeScript frontend
    embedded with `go:embed`.
-   Makefile: `dev`, `build`, `test`, `lint`. Vite dev server proxies
    `/api` to the daemon.
-   GitHub Actions: Go tests, Vitest, lint.

**Done when:** `make build` produces one binary that serves a blank page.

### M1 --- Editor spike (§18, decision 3)

-   Throwaway page with two CodeMirror 6 panes.
-   Test Indic combining marks, stacked accents, cursor and delete across
    clusters, paste from websites, undo, and the macOS input method, in
    Chrome, Firefox and Safari. Use `testdata/vedic/baraha/`.

**Done when:** an ADR confirms CodeMirror 6 or records the switch.

### M2 --- Daemon core

-   Config loading and precedence, per-OS paths, logging (§9.6, §9.8).
-   Session token, `/auth`, cookie, Host and Origin checks, single
    instance, `session.json`, shutdown (§9.5, §9.7).

**Done when:** `httptest` tests cover every rule in §9.5.

### M3 --- Segment model

-   `frontend/src/model/segments.ts`: pure TypeScript implementing every
    row of §4.2 and §4.3, plus re-linking.
-   Placeholder converter that returns its input unchanged.
-   One unit test per table row.

**Done when:** the model passes all tests without a browser.

### M4 --- Editor wiring

-   CodeMirror state fields tracking segment ranges, gutter markers
    (§4.4), the two-history undo design (§4.7), Regenerate line/all
    (§4.5).

**Done when:** typing in the left pane updates the right; editing one
output line leaves the other lines following the source.

### M5 --- Files

-   Document list/open/save with `os.Root`, revisions and 409 conflicts,
    atomic writes, backups (§9.4).
-   Invalid UTF-8, BOM and CRLF handling; `.paramaakshara.json` schema;
    `.txt` and ITRANS import; recovery snapshots (§10).

**Done when:** save → kill → recover works, and an external change to an
open file triggers the conflict prompt.

### M6 --- ITRANS (Phase 2)

-   Build the ITRANS test corpus from sanskritdocuments.org first.
-   Evaluate `@indic-transliteration/sanscript`; adopt it or write the
    table-driven converter (§5.6).
-   Accent layer (§5.3). Generate ITRANS test inputs from the Baraha
    samples with a test-only Baraha → ITRANS tool.

**Done when:** the corpus passes, including the Puruṣa Sūkta sample.

### M7 --- Vedic (Phase 3)

-   Symbol catalogue JSON, palette (§6.4).
-   Font selection, Playwright screenshot tests (§13.6).
-   Decide accent vs anusvara order (§5.3).
-   Clean up text command (§6.8): visarga, Baraha double svarita
    (U+0953 → U+1CDA), short e/o.

**Done when:** accents render correctly in the documented browser/font
combinations.

### M8 --- Kannada and Tamil (Phase 4)

-   Script conversion tables, selector, switching (§4.6), loss reporting,
    round-trip tests.

### M9 --- Release (Phase 5)

-   Signed and notarized macOS build, `THIRD_PARTY_NOTICES.md`, README,
    CONTRIBUTING.

## Open inputs

-   How to encode the Taittirīya `(gm)`/`(gg)` anusvara (plain text in
    parentheses today); decide in M7.
