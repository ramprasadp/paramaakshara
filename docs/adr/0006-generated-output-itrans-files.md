# ADR 0006: Generated output and ITRANS-only files

-   **Status:** Accepted (2026-11-15). Supersedes the editing model of
    TECH_SPEC 1.1 (§4, §18 decisions 4, 8 and 12).
-   **Spec:** TECH_SPEC §2, §4, §6.4, §6.8, §10, §18 decision 18.

## Context

TECH_SPEC 1.1 made the output pane an independent, editable Unicode
document. Each output line was a segment linked to its ITRANS line;
editing the output detached the line (✎), lines typed only in the
output were output-only (+), and a source change after a manual edit
made the line stale (✎!). The project file `.paramaakshara.json` stored
both panes and the segment state so that no manual edit was lost.

In use, the output is not where the work happens. The user writes and
corrects the text in ITRANS, as in Baraha, and takes the Unicode out by
copying it or with Export .txt, Export PDF and Export all. The segment
model costs a great deal for this: two undo histories, the rules of
§4.2--4.3a, stale lines, Regenerate, and a file format that must be
read back and checked. It also means a saved file may hold output that
no longer matches its ITRANS.

## Options

1.  **Keep the model** and only suggest `.itx` when no line is edited.
    Nothing changes for existing files, but all the cost stays.
2.  **Output generated from the input; save the ITRANS only.** The
    output pane is read-only: every output line is the conversion of
    its input line in the output script. A document is its ITRANS text.
3.  **Output generated, but keep the project file** for the settings
    (script, tradition). Keeps a second format and its validation only
    for three settings.

## Decision

Option 2.

-   The output pane is read-only; it can be selected, copied and
    searched. Output line n is always the conversion of input line n.
-   A document is saved as ITRANS text, `.itx` (UTF-8, line ending and
    BOM of the opened file kept). Open reads `.itx` and `.txt` as
    ITRANS. Characters the converter does not know, such as Devanagari
    or a Vedic sign with no ITRANS spelling, pass through and are saved
    as they are.
-   `.paramaakshara.json` and output-only `.txt` files are no longer
    read or written, and existing ones are not migrated (the project
    owner's decision).
-   The output script and the Vedic tradition are not stored in the
    file. They are the last choice made in this browser, falling back to
    the configuration file.
-   The Symbols palette inserts into the input pane: the mark's ITRANS
    when it has one (`_`, `'`, `'''`, `(gm)`, `(gg)` ...), otherwise the
    character itself, which the converter passes through.
-   Clean up text (§6.8) moves into Import Unicode: the fixes are
    offered on pasted text before it is rewritten in ITRANS.
-   Unicode is brought in only through the input pane: Import Unicode,
    Legacy PDF and Baraha, which all produce ITRANS.

## Consequences

-   §4 shrinks to one rule; segment states, their markers, Regenerate
    line/all, output undo and the stale check on open are removed, with
    their code and tests (`model/segments.ts`, `patch.ts`, `undo.ts`,
    `switch.ts`, `project.ts`).
-   Product principles 2.1--2.4 change: ITRANS is the document; the
    Unicode output is derived from it. "Manual output edits are never
    overwritten" no longer applies because there are none.
-   **A converter change changes the output of existing files.** A
    mapping fix shows up when a file is reopened, with nothing marked.
    Every change that alters the output of existing ITRANS is listed in
    `CHANGELOG.md` and `docs/itrans-mappings.md`, and the corpus tests
    show it in review.
-   Text that does not convert back exactly from ITRANS (Import Unicode
    already marks such lines ⚠) cannot be kept as it was; it has to be
    corrected in ITRANS, or kept as passed-through Unicode in the input.
-   A literal apostrophe or underscore can no longer be typed in the
    output (§5.3). This is open until a user needs it; any escape
    sequence must be verified against ITRANS 5.3 first.
-   Opening a file no longer restores its script or tradition.
