# ADR 0001: Editor component

-   **Status:** Accepted (2026-11-09). Manual checks below still to be
    done by a person; a failure there reopens this ADR.
-   **Spec:** TECH_SPEC §8.1, §18 decision 3.

## Context

Both panes need an editor that handles Devanagari with stacked Vedic
accents, keeps exact code points through typing, paste and undo, and
supports the segment model (§4): range tracking through edits and gutter
markers. Candidates: CodeMirror 6 and a plain `<textarea>`.

## Method

Spike page `frontend/spike/editor.html` with two CodeMirror 6 panes and a
textarea. `frontend/tests/e2e/spike.spec.ts` (Playwright 1.65) measured
each editor in Chromium, Firefox and WebKit on macOS, using a test line
built from the Puruṣa Sūkta plus U+1CDA, an accent on `)`, accent +
anusvara and a short e:

    स॒हस्र॑शीर्षा॒ पुरु॑ष: सहस्रा॒क्ष: स॒हस्र॑पात् । स्वाहा᳚ भू॑यास॒(ग्ग्)॒ सर्व॒ं मॆ॑

Run with `npm --prefix frontend run e2e`; raw results go to
`frontend/test-results/spike-<browser>.json`.

Versions: `@codemirror/state` 6.7.6, `@codemirror/view` 6.43.15,
`@codemirror/commands` 6.11.1.

## Results

  Check                                   CodeMirror 6                 Textarea
  --------------------------------------- ---------------------------- ------------------------------
  Same behaviour in all three engines     Yes                          No
  Arrow keys stop between a letter and    Never                        Never
  its accent/vowel sign
  Arrow-key stops (82 code points)        48 in every engine; also     40 in Chromium/WebKit
                                          stops inside conjuncts       (matches `Intl.Segmenter`);
                                          (after virama)               Firefox 29 right / 12 left
  Backspace after an accent               Removes the accent only      Same, except WebKit removes
                                          (all engines)                ा᳚ together after U+1CDA
  Delete before a conjunct                Removes स् (one part)        Removes the whole स्र॑
  Insert accent by keyboard, then undo    Exact, all engines           Exact, all engines
  Typing committed text (input-method     Exact, all engines           Exact, all engines
  path)
  Copy from CodeMirror, paste elsewhere   Identical code points,       ---
                                          all engines
  Gutter markers with wrapped lines       Work                         Not possible

Rendering is identical between CodeMirror and the textarea for the same
font; rendering problems found are font issues (ADR 0002).

## Decision

Use CodeMirror 6 for both panes.

-   It behaves identically across engines, which the textarea does not.
-   Backspace removing one mark at a time suits accent correction.
-   Stopping inside conjuncts (स्|र) is acceptable for Sanskrit editing
    and lets the user fix one part of a conjunct.
-   It provides the gutters and change mapping the segment model needs.

## Manual checks still needed

Automated tests cannot cover these. Open the spike at
`http://127.0.0.1:<port>/spike/editor.html` (after `make build`) in
Chrome, Firefox and Safari:

1.  **macOS input method:** enable a Devanagari keyboard (System
    Settings → Keyboard → Input Sources), type a few words in both
    CodeMirror panes; check nothing is lost or duplicated.
2.  **Real paste:** copy accented text from a web page (e.g. the
    madhwapaddathi site) and from a PDF or Word document, paste into the
    right pane, then use "Compare panes with sample" or the inspector to
    check code points.
3.  **Feel:** cursor movement, selection with Shift+arrows, double-click
    word selection and undo/redo feel normal on long lines.

## Consequences

-   Add `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`
    (MIT) as runtime dependencies.
-   The spike page stays until the manual checks are done, then is
    removed together with its build entry in `vite.config.ts`.
