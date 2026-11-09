# AGENTS.md

Guidance for coding agents working in this repository.

Paramaakshara is a local-first Unicode editor for Sanskrit and Vedic
texts: ITRANS typed in the left pane, editable Unicode output in the
right pane, Vedic accents, Devanagari/Kannada/Tamil. A Go daemon serves
a TypeScript frontend to the browser on `127.0.0.1`.

## Read first

-   `TECH_SPEC.md` --- the specification. It is authoritative; if code
    and spec disagree, raise it rather than silently following either.
    The decision log is §18.
-   `docs/dev-plan.md` --- milestones (M0--M9) and what each must
    deliver.
-   `testdata/vedic/baraha/README.md` --- the Vedic samples, the Baraha
    legend and the known quirks in those texts.

## Commands

``` sh
make build   # frontend build + bin/paramaakshara (frontend is embedded)
make test    # go test ./... and Vitest
make e2e     # Playwright browser tests (Chromium, Firefox, WebKit)
make lint    # gofmt, go vet, tsc --noEmit, Prettier check
make fmt     # format Go and frontend code
make dev     # daemon on :7531 plus the Vite dev server
```

Run `make lint test` before considering a change done. Requires Go 1.25+
and Node.js LTS (build only).

## Layout

``` text
cmd/paramaakshara/   daemon entry point (flags, startup, shutdown)
internal/server/     HTTP handlers, security checks, request logging
frontend/            Vite + TypeScript app; embed.go embeds dist/
  src/               app code (model/, conversion/, components/ per §8.2)
  tests/unit/        Vitest tests
docs/                plan, mapping and symbol documentation, ADRs
testdata/            reference texts for tests
```

## Rules that matter most

These protect the user's texts. Breaking one is a bug even if tests
pass.

-   **Never change text silently.** No Unicode normalization anywhere
    (§6.6). Pasted and opened text is kept byte for byte. Fixes such as
    the Clean up text command (§6.8) are explicit, previewed and
    undoable.
-   **Manual output edits are never overwritten or deleted by source
    edits.** The segment rules in §4.2--4.3 are the contract; every rule
    has a unit test.
-   **Conversion is deterministic and data-driven.** Mappings live in
    data tables (`frontend/src/conversion/mappings/`), not in UI code. No
    LLM or network call in the conversion path.
-   **Expected test results come from verified references**:
    sanskritdocuments.org for ITRANS, the Baraha pairs in
    `testdata/vedic/baraha/` for Vedic text. Do not derive expectations
    from the code under test, and do not invent mappings (especially
    Baraha key mappings) from memory.
-   **Vedic accent input** (§5.3): `_` anudātta U+0952, `'` svarita
    U+0951, `'''` double svarita U+1CDA. Never emit U+0953 for the double
    svarita, and never treat two U+0951 as a double svarita.
-   **Accent order:** anusvara, visarga or chandrabindu comes first, then
    the accent (भूमिं॑). The reverse renders as a dotted circle (ADR 0002).
-   **Fonts:** Noto Devanagari is the default because macOS fonts lack
    U+1CDA. Check rendering in all three engines, not just one.
-   **Do not edit files in `testdata/`** except to add new samples. Any
    correction to a sample must be listed in that directory's README.

## Backend conventions (Go)

-   Standard library first. The only planned third-party module is
    `gopkg.in/natefinch/lumberjack.v2` (log rotation). Do not add web
    frameworks or `logrus`/`zap`/`zerolog`; any new dependency needs an
    ADR and an entry in `THIRD_PARTY_NOTICES.md`.
-   Logging: stdlib `log` with `log.LstdFlags`, plain unquoted messages.
    Never log document content, the `/auth` query string or cookie
    values (§9.8).
-   Listen on loopback only. File access goes through `os.Root` on a
    configured document folder; never accept absolute paths from the
    browser (§9.4--9.5).
-   Tests use `testing` and `net/http/httptest`.

## Frontend conventions (TypeScript)

-   Plain TypeScript, no UI framework. CodeMirror 6 for the editors
    (provisional until the M1 spike).
-   Strict TypeScript; Prettier formatting.
-   No CDNs, analytics or external requests; everything is bundled.
-   Keep conversion and the segment model as pure modules testable
    without a browser.

## Licence and file headers

The project is GPL-3.0 (§17.2). Every Go and TypeScript source file
starts with:

``` text
// SPDX-License-Identifier: GPL-3.0-or-later
```

Dependencies must be GPL-3.0-compatible (MIT, BSD, Apache-2.0 are
fine; GPL-2.0-only is not). Do not copy proprietary Baraha code or
assets.

## Git

-   `main` is the release branch; work happens on `develop` or on
    feature branches from it.
-   Keep commits focused; do not commit `bin/`, `node_modules/` or
    build output in `frontend/dist/` (only its `.gitkeep`).
-   When a change alters behaviour described in `TECH_SPEC.md`, update
    the spec in the same change.
