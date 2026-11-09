# Contributing to Paramaakshara

Thank you for helping. This project edits sacred and scholarly texts, so
the first rule is that **text must never change silently**. Most of the
rules below follow from that.

## Set up

Requirements: Go 1.25+, Node.js (current LTS), macOS or Linux.

``` sh
git clone https://github.com/ramprasadp/paramaakshara.git
cd paramaakshara
make all                                       # lint, tests, build
npx --prefix frontend playwright install       # once, for browser tests
make e2e                                       # browser tests (Chromium, Firefox, WebKit)
```

Work on a branch from `develop`; `main` is for releases.

## Everyday commands

  Command        What it does
  -------------- ------------------------------------------------------------
  `make dev`     daemon on :7531 plus the Vite dev server; open the printed
                 sign-in link with the port changed to 5173
  `make test`    Go tests and frontend unit tests (Vitest)
  `make e2e`     browser tests with their own daemon (port 7541) and a
                 throwaway home folder
  `make lint`    gofmt, go vet, TypeScript and Prettier checks
  `make fmt`     format Go and frontend code
  `make build`   `bin/paramaakshara`
  `make release` release artifacts in `dist/` (docs/release.md)
  `make docker`  the Docker image (docker/README.md)

Run `make lint test` (and `make e2e` for editor changes) before opening a
pull request. CI runs the same.

## Where things are

``` text
cmd/paramaakshara/    the program: flags, startup, shutdown
internal/             config, logging, HTTP server, documents, instance
frontend/src/         the editor
  model/              segment model, undo patches, project files
  conversion/         ITRANS, Baraha, Clean up, script conversion
  editor/, ui/        CodeMirror wiring, dialogs, palette
frontend/tests/       unit/ (Vitest) and e2e/ (Playwright)
testdata/             reference texts
docs/                 mappings, symbols, script conversion, ADRs
```

`TECH_SPEC.md` is the specification. `AGENTS.md` lists the project
conventions in one place; they apply to people too.

## The rules that matter

-   **No silent changes to text.** No Unicode normalization. Pasted and
    opened text is kept exactly. Fixes are explicit commands with a
    preview and one undo step.
-   **Manual output is never lost** by edits in the other pane. The
    segment rules in TECH_SPEC §4 are tested row by row; keep it that way.
-   **Expected test results come from references, not from the code
    under test.** ITRANS and Vedic expectations come from verified texts
    (`testdata/`) or are written by hand. Never generate an expectation by
    running the converter.
-   **Mappings are data and are documented.** A change to the ITRANS table
    updates `docs/itrans-mappings.md`; a Vedic symbol meaning goes into
    `docs/vedic-symbols.md` only with a verified source.
-   **Rendering reference screenshots** change only after a person has
    looked at the new images (`npx --prefix frontend playwright test
    rendering --update-snapshots`).
-   **Spec follows behaviour.** When a change alters behaviour described
    in `TECH_SPEC.md`, update the spec in the same pull request; record
    larger decisions as an ADR in `docs/adr/`.

## Adding a sample text

Sample texts are the most valuable contribution. Put a pair of files in
`testdata/` (the source and the expected Unicode, line for line) with a
README entry giving the source, the tradition and any correction you made.
See `testdata/vedic/baraha/README.md` for the form.

## Code style

-   Go: standard library first, `log` for logging (never document
    content), `gofmt`.
-   TypeScript: strict, no UI framework, Prettier.
-   In source code (not tests), write combining marks and Vedic signs as
    `\uXXXX` escapes.
-   Every source file starts with `// SPDX-License-Identifier:
    GPL-3.0-or-later`.
-   New dependencies need a reason, a GPL-3.0-compatible licence and an
    entry in `THIRD_PARTY_NOTICES.md`.

## Licence

By contributing you agree that your contribution is licensed under
GPL-3.0-or-later, the project's licence.
