# Vedic Editor --- Technical Specification

**Repository name:** `vedic-editor`\
**Document:** `TECH_SPEC.md`\
**Version:** 1.0\
**Status:** Draft for implementation\
**Primary platform:** macOS\
**Architecture:** Local-first browser application served by a Go daemon\
**Primary input:** ITRANS\
**Initial output scripts:** Devanagari, Kannada, Tamil\
**Canonical document format:** Unicode UTF-8

------------------------------------------------------------------------

## 1. Project summary

Vedic Editor is an open-source, local-first text editor for composing,
editing and preserving Sanskrit and Vedic texts.

The primary workflow is a dual-pane editor:

1.  The user types English transliteration using ITRANS in the left
    pane.
2.  The right pane renders the corresponding Sanskrit text in real time.
3.  The right pane is a fully editable Unicode document, not a read-only
    preview.
4.  The user can paste Unicode Sanskrit text from websites or other
    applications directly into the output pane.
5.  The user can change the output script between Devanagari, Kannada
    and Tamil.
6.  Vedic accents and other Vedic signs can be inserted from a symbol
    palette and, eventually, through configurable keyboard mappings.

The application is inspired by the practical workflow of Baraha, but is
designed around Unicode, current browser technology and a cross-platform
architecture.

### 1.1 Primary goals

-   Real-time ITRANS-to-Sanskrit transliteration.
-   A fully editable Unicode output pane.
-   Native clipboard behaviour, including Cmd-C and Cmd-V on macOS.
-   Direct Unicode paste without transliteration or data loss.
-   Script switching between Devanagari, Kannada and Tamil.
-   Vedic accent and symbol support, including udātta, anudātta and
    svarita.
-   Reliable undo/redo, save, open, autosave and recovery.
-   Local operation without a cloud dependency.
-   An architecture that permits additional input schemes and Indian
    scripts.

### 1.2 Non-goals for version 1

The initial release does not aim to provide:

-   A full desktop publishing or page-layout system.
-   OCR of printed manuscripts.
-   Sanskrit grammar or spelling correction.
-   Automatic inference of missing Vedic accents.
-   Cloud document storage or collaborative editing.
-   Complete binary or legacy-font compatibility with every Baraha file.
-   A full-featured word processor equivalent to Microsoft Word.

These may be considered after the core editing and Unicode requirements
are stable.

------------------------------------------------------------------------

## 2. Product principles

The following principles guide implementation decisions.

### 2.1 Unicode is authoritative

The canonical document is Unicode text. ITRANS is an input
representation, not the document's storage format.

### 2.2 The output pane is an editor

The output pane must support ordinary text editing, selection, clipboard
operations, direct typing, symbol insertion, undo and redo. It must
never be treated as a disposable preview.

### 2.3 Source and document are independent

The ITRANS source and the Unicode document are separate state objects.
Manual changes to the output must not silently modify or be overwritten
by the source pane.

### 2.4 Script switching must be explicit

Changing the selected script changes the representation shown in the
output pane. The application must preserve characters and report
conversions that cannot be represented faithfully.

### 2.5 Deterministic conversion

Transliteration and script conversion must be deterministic. An LLM must
not be in the live text-conversion path. AI may assist development,
documentation and test generation, but production conversion must use
deterministic rules or a vetted library.

### 2.6 Local-first and privacy-conscious

The application should work offline after installation. By default,
document content must not leave the user's machine.

------------------------------------------------------------------------

## 3. User experience and main interface

### 3.1 Main window

The primary interface contains two side-by-side panes.

``` text
+------------------------------------------------------------------+
| Vedic Editor                                      File  Edit Help |
+------------------------------------------------------------------+
| Input scheme: ITRANS                    Output script: Devanagari |
+--------------------------------+---------------------------------+
| ITRANS INPUT                   | UNICODE OUTPUT                  |
|                                |                                 |
| agnim iiLe purohitaM           | अग्निम् ईळे पुरोहितम्             |
| yaj~nasya devam                 | यज्ञस्य देवम्                     |
|                                |                                 |
|                                |                                 |
+--------------------------------+---------------------------------+
| Vedic Symbols | Regenerate | Save | Find | Replace | Saved       |
+------------------------------------------------------------------+
```

The example is illustrative. Exact transliteration output must be
validated against the selected ITRANS convention and test corpus.

### 3.2 Pane behaviour

**Input pane**

-   Accepts ITRANS text.
-   Maintains the original source text.
-   Provides real-time transliteration.
-   Supports ordinary text selection, copy, paste and undo/redo.
-   Does not contain the authoritative document content.

**Output pane**

-   Displays the canonical Unicode document in the selected script.
-   Is fully editable.
-   Accepts direct keyboard input and pasted Unicode.
-   Supports Vedic symbol insertion.
-   Supports selection, copy, paste, undo/redo, find and replace.
-   Preserves combining marks and unsupported characters.
-   Is the authoritative document content.

### 3.3 Layout

-   Side-by-side panes are the default on desktop.
-   Pane widths should be resizable.
-   A stacked layout may be used on narrow screens.
-   The selected output script must be visible at all times.
-   The UI should display unsaved-change status.
-   A status area should be available for conversion warnings and
    errors.

### 3.4 Toolbar

Initial toolbar actions:

-   Input scheme selector.
-   Output script selector.
-   Vedic symbol palette.
-   Regenerate output.
-   Undo and redo.
-   Find and replace.
-   Open.
-   Save.
-   Export.
-   Document status.

### 3.5 Keyboard shortcuts

At minimum, preserve platform-native shortcuts:

  Action       macOS         Other platforms
  ------------ ------------- -----------------
  Copy         Cmd-C         Ctrl-C
  Paste        Cmd-V         Ctrl-V
  Cut          Cmd-X         Ctrl-X
  Select all   Cmd-A         Ctrl-A
  Undo         Cmd-Z         Ctrl-Z
  Redo         Cmd-Shift-Z   Ctrl-Shift-Z
  Find         Cmd-F         Ctrl-F
  Save         Cmd-S         Ctrl-S

Shortcuts must act on the focused pane and must not be intercepted
unnecessarily by the application.

------------------------------------------------------------------------

## 4. Core document and editing model

This section defines the most important state-management requirements.

### 4.1 Three logical representations

The application maintains three distinct representations.

#### A. Source text

The original text typed or pasted into the ITRANS pane.

Example:

``` text
agnim iiLe purohitaM
```

The source is retained as entered. It must not be rewritten merely
because the output pane is edited or the output script is changed.

#### B. Canonical document

The authoritative editable Unicode document.

Example:

``` text
अग्निम् ईळे पुरोहितम्
```

The canonical document is the content saved and exported as Unicode
text.

#### C. Display representation

The rendering of the canonical document using the selected output script
and suitable fonts.

The display representation may be generated through script conversion
where required. It must not be confused with the original source or the
canonical document.

### 4.2 Source-to-document flow

When the user types in the input pane:

1.  The input editor updates its source text.
2.  The transliteration parser processes the changed input.
3.  The application obtains a Unicode result.
4.  If the output is still source-controlled, the canonical document is
    updated.
5.  The output pane renders the document in the selected script.

### 4.3 Direct output editing

When the user types or pastes in the output pane:

1.  The output editor updates the canonical document.
2.  The original ITRANS source remains unchanged.
3.  The document is marked as manually edited or detached from live
    source synchronisation.
4.  Subsequent input-pane changes must not silently overwrite the
    output.
5.  The user can explicitly regenerate the output from the ITRANS
    source.

### 4.4 Synchronisation state

The application should maintain an explicit synchronisation state, for
example:

-   `source_synced`: output currently reflects transliteration of the
    source.
-   `output_modified`: output has been edited independently.
-   `source_changed`: source changed while output is independently
    edited.
-   `conversion_error`: current source cannot be fully converted.

When the source changes while the output is independently edited, the
application should preserve both values and show that regeneration is
available.

### 4.5 Regenerate output

The `Regenerate Output` command explicitly replaces the canonical
document with the transliteration result from the source pane.

If the output has independent edits, the application must ask for
confirmation before replacement.

A future enhancement may provide a side-by-side diff or merge. This is
not required for version 1.

### 4.6 Script switching

Script switching must not modify the ITRANS source.

The implementation must define a canonical representation strategy.
Preferred approach:

-   Keep a canonical Sanskrit Unicode representation.
-   Convert it to the selected output script for display.
-   If the user edits a non-Devanagari display, convert the edited text
    back to the canonical representation using a well-defined reverse
    conversion.
-   If reverse conversion is ambiguous or lossy, preserve the user's
    text and report the limitation rather than silently dropping
    characters.

An alternative implementation may store the selected-script text as the
current document and convert it when switching. If this approach is
chosen, round-trip and loss-reporting requirements still apply.

### 4.7 Undo/redo

Undo and redo must be reliable across both panes.

-   Each pane must have a coherent editing history.
-   Direct output edits must be undoable.
-   Pasted text and symbol insertion must be undoable.
-   Automatic transliteration updates must not create confusing undo
    steps or erase manual output history.
-   Regeneration should be a single undoable document operation where
    supported.

------------------------------------------------------------------------

## 5. Transliteration engine

### 5.1 Initial scheme

ITRANS is the mandatory initial input scheme.

The implementation must document which ITRANS version or convention it
follows. There are variants and implementation differences; mappings
must be verified against a reference rather than inferred from a small
example list.

### 5.2 Illustrative mappings

The following examples are indicative, not a complete normative mapping
table:

  ITRANS       Indic output concept
  ------------ --------------------------------------------------
  `a`          short a
  `aa` / `A`   long ā
  `i`          short i
  `ii` / `I`   long ī
  `u`          short u
  `uu` / `U`   long ū
  `R^i`        vocalic ṛ
  `e`          e
  `ai`         ai
  `o`          o
  `au`         au
  `kh`         aspirated kha
  `gh`         aspirated gha
  `ch`         aspirated/affricate mapping as defined by ITRANS
  `Sh`         ṣa
  `sh`         śa
  `M`          anusvara
  `H`          visarga
  `~N`         ña
  `~n`         ña, subject to the selected convention

The complete table must live in documented, testable mapping data or
code---not be scattered through UI event handlers.

### 5.3 Incremental parsing

The parser must support real-time conversion while the user types.

It must handle:

-   Complete sequences.
-   Incomplete sequences.
-   Ambiguous prefixes.
-   Multi-character consonants.
-   Long vowels.
-   Special transliteration tokens.
-   Whitespace and punctuation.
-   Backspace and insertion in the middle of text.

The parser should retain a small pending-input buffer when a sequence
may continue. It must provide a predictable way to commit pending input,
such as a delimiter, timeout or explicit action.

Do not require Enter after every word.

### 5.4 Editing in the middle of input

A naive append-only converter is insufficient. The user must be able to
place the cursor in the middle of the ITRANS text, insert or delete
characters, and obtain correct output.

The implementation may initially reprocess the affected word or line
rather than the entire document. Correctness is more important than
premature optimisation.

### 5.5 Parser interface

A possible Go interface:

``` go
type Transliterator interface {
    Convert(input string, scheme string) (string, error)
}
```

For an incremental frontend implementation, define a separate interface
that can represent pending input and changed ranges. The exact API
should be selected after the editor component is chosen.

### 5.6 Existing transliteration engines

Evaluate before implementing a complete engine from scratch:

-   Aksharamukha: https://github.com/virtualvinodh/aksharamukha
-   Lipika IME: https://github.com/ratreya/lipika-ime
-   Samsaadhanii transliteration resources:
    https://sanskrit.uohyd.ac.in/manual/transliterate/

For each candidate, verify:

-   License and redistribution compatibility.
-   ITRANS convention and mapping coverage.
-   Devanagari output correctness.
-   Vedic accent handling.
-   Kannada and Tamil conversion.
-   Preservation of combining marks.
-   Browser or Go integration feasibility.
-   Maintenance status and dependency footprint.

Do not assume a general transliterator supports Vedic marks correctly.

### 5.7 Future input schemes

The architecture should permit later support for:

-   Harvard-Kyoto.
-   Velthuis.
-   SLP1.
-   Baraha-compatible input.
-   Configurable user mappings.

Only ITRANS is required for the first usable release.

------------------------------------------------------------------------

## 6. Unicode and Vedic symbols

### 6.1 Unicode-first storage

The application must store actual Unicode characters, not proprietary
font glyph codes or legacy ANSI encodings.

The canonical document must preserve combining marks, viramas, vowel
signs, punctuation and Vedic characters.

### 6.2 Required Vedic features

The first release should investigate and support at least:

-   Udātta.
-   Anudātta.
-   Svarita.
-   Independent svarita where applicable.
-   Relevant Vedic accent variants.
-   Relevant Vedic Extensions characters.
-   Other symbols required by the target Vedic text traditions.

The precise inventory must be documented. Similar-looking marks must not
be treated as interchangeable.

### 6.3 Unicode references

Use official Unicode resources as the source of truth:

-   Devanagari: https://www.unicode.org/charts/PDF/U0900.pdf
-   Devanagari Extended: https://www.unicode.org/charts/PDF/UA8E0.pdf
-   Vedic Extensions: https://www.unicode.org/charts/PDF/U1CD0.pdf
-   Unicode Character Database:
    https://www.unicode.org/Public/UCD/latest/

The project must maintain `docs/vedic-symbols.md`, including for each
supported character:

  Field            Meaning
  ---------------- -----------------------------------------------------
  Display glyph    Character as rendered in the project's test font
  Code point       Unicode code point
  Unicode name     Official Unicode character name
  Vedic meaning    Usage or traditional name, where verified
  Category         Combining mark, independent sign, punctuation, etc.
  Input mapping    Optional keyboard sequence
  Script support   Tested output scripts
  Font test        Fonts and browsers in which rendering was checked
  References       Reliable source for interpretation

### 6.4 Symbol palette

Provide a searchable or categorised Vedic symbol palette.

The palette must:

-   Display the symbol.
-   Display its name.
-   Show its Unicode code point.
-   Insert the character at the output editor's current cursor position.
-   Preserve the current selection/cursor behaviour.
-   Support keyboard accessibility.
-   Permit future configurable mappings.

Example layout:

``` text
+------------------------------------------------+
| VEDIC SYMBOLS                                  |
+------------------------------------------------+
| Udatta      Anudatta      Svarita              |
|   [mark]      [mark]        [mark]              |
|                                                |
| Additional Vedic signs                         |
| [sign] [sign] [sign] [sign]                    |
+------------------------------------------------+
```

The actual glyphs must be verified with the chosen font. A missing glyph
must be indicated rather than represented by a misleading substitute.

### 6.5 Keyboard mappings

Vedic symbols should eventually be insertable through configurable
sequences.

Do not invent or hardcode Baraha key mappings without verification.

Mappings should be data-driven and documented. An illustrative
configuration structure:

``` json
{
  "scheme": "itrans-vedic",
  "symbols": {
    "verified_sequence": "UNICODE_CODEPOINT"
  }
}
```

This is a schema illustration only; actual sequences and code points
must be verified.

### 6.6 Combining marks and normalization

Vedic marks may be combining characters. The editor must:

-   Preserve their exact code points during copy/paste.
-   Preserve the correct sequence relative to the base character.
-   Avoid stripping marks during normalization.
-   Avoid splitting a base character from its combining marks during
    editing where the editor permits grapheme-aware handling.
-   Test cursor movement, deletion and selection around combining
    sequences.
-   Test multiple marks attached to one base character.
-   Test rendering in every supported output script.

Do not apply Unicode normalization blindly. NFC may be useful for some
text, but every normalization operation must be tested against the Vedic
corpus. Exact preservation is the default.

### 6.7 Vedic correctness

Rendering and encoding are separate concerns. A character can be
correctly stored but displayed incorrectly by a font or browser.

The project must maintain verified sample passages and screenshots or
visual test references for supported font/browser combinations. A text
comparison alone is not enough to validate visual placement of accents.

------------------------------------------------------------------------

## 7. Script conversion

### 7.1 Initial scripts

Required in version 1:

1.  Devanagari.
2.  Kannada.
3.  Tamil.

Potential future scripts:

-   Telugu.
-   Malayalam.
-   Grantha.
-   Bengali.
-   Gujarati.

### 7.2 Conversion requirements

The conversion layer must preserve, where representable:

-   Vowels and consonants.
-   Dependent vowel signs.
-   Virama and conjunct formation.
-   Anusvara and visarga.
-   Chandrabindu.
-   Vedic marks.
-   Punctuation.
-   Whitespace and line breaks.

Unsupported characters must be preserved or reported. They must not
silently disappear.

### 7.3 Tamil-specific considerations

Tamil script does not encode every Sanskrit phonemic distinction with a
separate basic consonant in the same way as Devanagari or Kannada.

The project must choose and document a conversion convention. It must
not claim that all conversions are perfectly reversible.

Where a distinction cannot be represented natively, the converter should
follow a documented convention and expose any loss or ambiguity.

### 7.4 Script converter interface

A possible Go interface:

``` go
type ScriptConverter interface {
    Convert(
        input string,
        sourceScript string,
        targetScript string,
    ) (string, error)
}
```

The actual implementation may use an external library or a frontend
module. Keep the conversion layer independent of the editor UI.

### 7.5 Script switching and manual edits

Script switching must work after manual output edits.

The application must not discard manual edits when the user selects
another script. It must convert the current canonical content or report
which characters cannot be converted.

The source ITRANS pane remains unchanged.

------------------------------------------------------------------------

## 8. Frontend architecture

### 8.1 Technology

Recommended initial stack:

-   HTML5.
-   CSS.
-   TypeScript or modern JavaScript.
-   CodeMirror 6 or another mature editor component.
-   Browser Unicode text rendering.
-   Go-served static frontend assets.

Evaluate CodeMirror 6 and a native textarea before committing. The
selected component must be tested with Indic combining marks, clipboard,
undo/redo and cursor behaviour.

A plain textarea is an acceptable fallback if it proves more reliable
for the required Unicode editing behaviour.

### 8.2 Frontend component layout

Suggested structure:

``` text
frontend/
  index.html
  src/
    app.ts
    components/
      InputEditor.ts
      OutputEditor.ts
      ScriptSelector.ts
      SymbolPalette.ts
      Toolbar.ts
      StatusBar.ts
    services/
      transliteration.ts
      script-conversion.ts
      document-manager.ts
      clipboard.ts
    state/
      document-state.ts
      history.ts
    styles/
      editor.css
      layout.css
  assets/
    fonts/
```

### 8.3 Font strategy

Evaluate appropriate fonts for:

-   Devanagari.
-   Kannada.
-   Tamil.
-   Vedic Extensions and combining marks.

Candidate font families include the Noto Sans Indic families, but no
font should be assumed to cover every Vedic character correctly.

The application should allow font selection. Font licences and
redistribution terms must be checked before bundling fonts.

### 8.4 Rendering tests

Test at minimum:

-   macOS with the supported browser(s).
-   Chrome and Firefox where practical.
-   Each output script.
-   Vedic combining marks.
-   Multiple accents on one base character.
-   Copy/paste round trips.
-   Zoom and font-size changes.

------------------------------------------------------------------------

## 9. Go daemon and backend architecture

### 9.1 Responsibilities

The Go daemon serves the application and provides local document
services.

It should handle:

-   Serving frontend assets.
-   Health and configuration endpoints.
-   Opening and saving documents.
-   Import and export.
-   Local settings.
-   Optional conversion endpoints.
-   Future extension points.

Real-time keystroke conversion should preferably happen in the frontend
to avoid an HTTP round trip for every keystroke. If a vetted Go
conversion engine is selected, it may be used locally in the process
instead.

### 9.2 Suggested repository structure

``` text
vedic-editor/
  cmd/
    vedic-editor/
      main.go

  internal/
    server/
      server.go
      routes.go
    document/
      manager.go
      storage.go
    transliteration/
      itrans.go
      parser.go
    script/
      converter.go
    config/
      config.go

  frontend/
    index.html
    src/
    assets/

  docs/
    architecture.md
    itrans-mappings.md
    vedic-symbols.md
    unicode-handling.md
    script-conversion.md

  testdata/
    itrans/
    vedic/
    unicode/
    script-conversion/

  README.md
  TECH_SPEC.md
  CONTRIBUTING.md
  LICENSE
  go.mod
```

This is a suggested starting structure. Packages may be reorganised as
the implementation evolves.

### 9.3 HTTP API

Initial endpoints:

  Method   Path              Purpose
  -------- ----------------- ---------------------------------------------
  GET      `/`               Serve editor
  GET      `/api/health`     Health check
  GET      `/api/config`     Read configuration
  GET      `/api/document`   Open a document by safe document identifier
  POST     `/api/document`   Save a document
  POST     `/api/import`     Import a supported file
  POST     `/api/export`     Export document content

Example save request:

``` json
{
  "document_id": "local-document-id",
  "name": "rigveda.txt",
  "script": "devanagari",
  "content": "अग्निम् ईळे पुरोहितम्"
}
```

The API must use safe document identifiers rather than trusting
arbitrary filesystem paths supplied by the browser.

### 9.4 Document API semantics

-   Save operations must preserve UTF-8 content.
-   The backend must not transliterate or normalize document content
    unless explicitly requested.
-   Errors must be returned in a structured format.
-   Writes should be atomic where practical (write temporary file, then
    rename).
-   The backend should prevent path traversal.
-   File size limits should be configurable.

### 9.5 Local security

-   Bind to `127.0.0.1` by default.
-   Do not listen on all network interfaces unless the user explicitly
    configures it.
-   Restrict file access to configured directories.
-   Validate document identifiers and file names.
-   Protect state-changing endpoints against cross-origin requests.
-   Do not execute shell commands based on document content.
-   Avoid logging document text by default.
-   Do not transmit document content to external services.

The browser-to-daemon origin and authentication strategy must be
documented. A random local session token or equivalent protection should
be considered for state-changing endpoints.

------------------------------------------------------------------------

## 10. Document storage and file formats

### 10.1 Initial formats

Required:

-   UTF-8 plain text (`.txt`).
-   UTF-8 Markdown (`.md`).

Future possibilities:

-   HTML.
-   DOCX export.
-   PDF export.
-   Baraha legacy-format import.
-   Other legacy Sanskrit encodings, subject to licensing and technical
    feasibility.

### 10.2 Canonical file content

Exported plain text must contain the actual Unicode document, not
transliteration source or font-specific codes.

### 10.3 Project document format

A project-specific container may preserve both source and output state.
It should be versioned and documented.

Illustrative metadata:

``` json
{
  "format_version": 1,
  "name": "rigveda",
  "input_scheme": "itrans",
  "output_script": "devanagari",
  "source_text": "agnim iiLe purohitaM",
  "content": "अग्निम् ईळे पुरोहितम्"
}
```

This is an illustrative schema. Decide whether to use JSON, a directory
format or another container after evaluating document size and
portability.

The plain-text export must remain available regardless of the project
container format.

### 10.4 Autosave and recovery

-   Show unsaved-change status.
-   Provide manual save.
-   Provide autosave.
-   Recover unsaved work after unexpected closure where feasible.
-   Keep a backup before overwriting an existing file.
-   Do not autosave in a way that overwrites a newer external version
    without warning.

------------------------------------------------------------------------

## 11. Clipboard requirements

### 11.1 Input pane

-   Cmd-C copies the selected ITRANS source.
-   Cmd-V pastes plain text into the input pane.
-   Pasted input is processed according to the selected input scheme.

### 11.2 Output pane

-   Cmd-C copies Unicode text.
-   Cmd-V pastes Unicode text directly.
-   Pasted Unicode must not be passed through ITRANS conversion.
-   Vedic combining marks and other Unicode characters must be
    preserved.
-   Pasting must replace the current selection at the cursor.

Prefer standard browser clipboard behaviour. Use the Clipboard API only
where necessary and respect browser permission requirements.

### 11.3 Clipboard acceptance test

Copy a Vedic passage from an external Unicode website, paste it into the
output pane, save it, close and reopen the document, then compare the
Unicode code points. The text must remain unchanged.

------------------------------------------------------------------------

## 12. Find, replace and text navigation

Initial editor functionality should include:

-   Find text in the output document.
-   Replace one occurrence.
-   Replace all occurrences.
-   Find in the ITRANS source.
-   Preserve combining marks during search and replacement.
-   Navigate between matches.

Search behaviour for visually equivalent but differently normalised
Unicode sequences should be documented. Exact code-point search is the
safest initial default.

------------------------------------------------------------------------

## 13. Testing strategy

Testing must include Sanskrit and Vedic-specific cases, not just
ordinary English text.

### 13.1 Transliteration tests

Cover:

-   Independent vowels.
-   Dependent vowel signs.
-   Consonants.
-   Aspirated consonants.
-   Conjuncts.
-   Anusvara.
-   Visarga.
-   Chandrabindu.
-   Special ITRANS sequences.
-   Ambiguous sequences.
-   Incomplete sequences.
-   Whitespace and punctuation.
-   Editing and deletion in the middle of a word.

Expected results must come from a verified reference or reviewed mapping
table.

### 13.2 Vedic tests

Cover:

-   Udātta.
-   Anudātta.
-   Svarita.
-   Independent svarita where applicable.
-   Relevant Vedic Extensions.
-   Combining-mark sequences.
-   Multiple marks attached to a base character.
-   Copy/paste preservation.
-   Font fallback and missing glyph behaviour.

### 13.3 Script conversion tests

Cover:

-   Devanagari to Kannada.
-   Devanagari to Tamil.
-   Kannada to Devanagari.
-   Tamil to Devanagari.
-   Script switching after direct edits.
-   Vedic mark preservation.
-   Unsupported-character reporting.
-   Round-trip conversion where reversible.

Round-trip tests must explicitly identify expected lossy conversions. Do
not assume every script conversion is reversible.

### 13.4 Editing tests

Cover:

-   Direct Unicode typing.
-   Pasting Unicode from websites.
-   Pasting from external applications.
-   Manual symbol insertion.
-   Cursor movement around combining marks.
-   Deletion and selection around combining marks.
-   Undo and redo in both panes.
-   Source edits after output edits.
-   Regenerate confirmation.
-   Script switching after output edits.
-   Save and reopen.
-   Autosave recovery.

### 13.5 Performance targets

Initial targets:

-   No perceptible lag during normal typing.
-   Incremental or affected-range conversion where practical.
-   Support documents of at least 50,000 Unicode characters.
-   No text loss during rapid typing or large paste operations.
-   Avoid unnecessary full-document re-rendering.

Performance targets should be measured on a documented reference machine
and browser.

------------------------------------------------------------------------

## 14. Acceptance criteria for version 1

The first public release is acceptable when all of the following are
true.

### Dual-pane editor

-   [ ] Two independently usable text panes are displayed.
-   [ ] ITRANS can be typed in the input pane.
-   [ ] The output updates in real time for supported sequences.
-   [ ] The output pane is fully editable.
-   [ ] Manual output edits are not silently overwritten by input
    changes.
-   [ ] A deliberate regenerate operation is available.

### Clipboard

-   [ ] Cmd-C and Cmd-V work in both panes on macOS.
-   [ ] Unicode text can be pasted directly into the output pane.
-   [ ] Pasted output is not passed through ITRANS.
-   [ ] Vedic marks survive copy, paste, save and reopen.

### Scripts

-   [ ] Devanagari output works.
-   [ ] Kannada output works for the supported conversion scope.
-   [ ] Tamil output works for the documented conversion convention.
-   [ ] Switching scripts does not silently discard unsupported
    characters.
-   [ ] The original ITRANS source remains unchanged by script
    switching.

### Vedic symbols

-   [ ] The initial verified symbol inventory is documented.
-   [ ] The symbol palette inserts supported characters.
-   [ ] Unicode code points are preserved.
-   [ ] Supported font/browser combinations render the test corpus
    correctly.
-   [ ] Missing glyphs or unsupported conversions are reported.

### Documents

-   [ ] UTF-8 plain-text save and open work.
-   [ ] Unsaved changes are indicated.
-   [ ] Undo and redo work.
-   [ ] A document can be recovered after an unexpected closure, subject
    to the documented recovery mechanism.

### Security and distribution

-   [ ] The daemon binds to localhost by default.
-   [ ] File operations are restricted to configured directories.
-   [ ] The application works without a cloud service.
-   [ ] Third-party dependencies and licences are documented.

------------------------------------------------------------------------

## 15. Development roadmap

### Phase 1 --- Editor foundation

Deliver:

-   Go daemon serving the frontend.
-   Dual-pane interface.
-   Independent input and output state.
-   Editable Unicode output pane.
-   Clipboard support.
-   UTF-8 open/save.
-   Basic undo/redo.

**Exit condition:** A useful two-pane Unicode editor exists even without
transliteration.

### Phase 2 --- ITRANS

Deliver:

-   Verified ITRANS mapping set.
-   Incremental parser.
-   Live transliteration.
-   Incomplete-sequence handling.
-   Middle-of-text editing support.
-   Automated test corpus.

**Exit condition:** Common Sanskrit ITRANS input converts reliably to
Devanagari.

### Phase 3 --- Vedic support

Deliver:

-   Verified Vedic character catalogue.
-   Symbol palette.
-   Manual insertion.
-   Font/rendering test matrix.
-   Vedic sample corpus.
-   Configurable keyboard mapping framework.

**Exit condition:** Required Vedic marks can be inserted, saved,
reopened and rendered correctly in the documented environment.

### Phase 4 --- Kannada and Tamil

Deliver:

-   Script conversion integration.
-   Script selector.
-   Document preservation.
-   Loss/ambiguity reporting.
-   Vedic mark preservation tests.

**Exit condition:** Users can switch scripts within the documented
supported conversion scope without silent data loss.

### Phase 5 --- Public release

Deliver:

-   macOS packaging.
-   Linux support where practical.
-   Installation and developer documentation.
-   Contribution guidelines.
-   Licence and third-party notices.
-   Release builds and test automation.

**Exit condition:** A contributor can build the application from a clean
checkout using documented instructions.

------------------------------------------------------------------------

## 16. Open-source project management

### 16.1 Repository name and description

Suggested repository:

`vedic-editor`

Suggested GitHub description:

> An open-source Unicode Sanskrit and Vedic text editor with live ITRANS
> transliteration, editable dual-pane workflow, Vedic symbols and
> multi-script support.

### 16.2 Licence

MIT or Apache-2.0 are reasonable candidates.

Before selecting a licence:

-   Review all third-party transliteration libraries.
-   Review font licences.
-   Review any imported mapping tables.
-   Preserve attribution and licence notices.
-   Do not copy proprietary Baraha implementation code or undocumented
    assets.

### 16.3 Contribution areas

The project should make it straightforward to contribute:

-   ITRANS mappings.
-   Vedic character definitions.
-   Verified Vedic test cases.
-   Script conversion rules.
-   Font/rendering test results.
-   New input schemes.
-   Additional scripts.
-   Documentation and examples.

Prefer data-driven mappings and independently testable conversion
packages.

### 16.4 Continuous integration

A future GitHub Actions workflow should:

-   Run Go tests.
-   Run frontend tests.
-   Run formatting and lint checks.
-   Validate mapping data.
-   Run Unicode preservation tests.
-   Build supported platform binaries.

------------------------------------------------------------------------

## 17. Open technical decisions

These decisions require investigation or user validation before they are
finalised.

1.  **Transliteration engine:** Select an existing library or implement
    the required ITRANS subset.
2.  **Execution location:** Decide whether transliteration and script
    conversion run in TypeScript, Go or a combination.
3.  **Editor component:** Evaluate CodeMirror 6 against a native
    textarea for Indic combining-mark behaviour.
4.  **Canonical script:** Decide whether the canonical document is
    always Devanagari or whether it is script-neutral Unicode with
    explicit script conversion.
5.  **Tamil convention:** Define how Sanskrit phonemic distinctions are
    represented in Tamil.
6.  **Vedic inventory:** Identify the exact Vedic accents and signs
    required, using verified source material.
7.  **Vedic keystrokes:** Determine whether to reproduce Baraha
    mappings, define a new mapping scheme or support both.
8.  **Project file format:** Decide whether source text and metadata are
    stored in a JSON project file or separate files.
9.  **Font distribution:** Decide which fonts can be bundled and which
    should be user-installed.
10. **Legacy Baraha import:** Determine whether real sample files are
    available and what encodings need to be supported.

These decisions should be recorded in architecture decision records
(ADRs) as the project develops.

------------------------------------------------------------------------

## 18. Recommended implementation order

Do not start by attempting to reproduce all of Baraha's transliteration
behaviour.

The recommended sequence is:

1.  Build the dual-pane editor.
2.  Make the output pane a reliable Unicode editor.
3.  Verify copy/paste of Vedic Unicode from external sources.
4.  Implement save/open and undo/redo.
5.  Add ITRANS conversion.
6.  Add the Vedic symbol catalogue and insertion palette.
7.  Add Kannada and Tamil conversion.
8.  Add configurable Vedic keyboard mappings.
9.  Improve compatibility and add more scripts.

This order produces useful software early and avoids making the editor
dependent on an unfinished transliteration engine.

------------------------------------------------------------------------

## 19. Reference resources

The following are starting points for technical investigation. Their
suitability, current maintenance status and licensing must be verified
before integration.

### Unicode

-   Unicode Consortium: https://www.unicode.org/
-   Devanagari chart: https://www.unicode.org/charts/PDF/U0900.pdf
-   Devanagari Extended chart:
    https://www.unicode.org/charts/PDF/UA8E0.pdf
-   Vedic Extensions chart: https://www.unicode.org/charts/PDF/U1CD0.pdf
-   Unicode Character Database:
    https://www.unicode.org/Public/UCD/latest/

### Transliteration and Indic tools

-   Aksharamukha: https://github.com/virtualvinodh/aksharamukha
-   Lipika IME: https://github.com/ratreya/lipika-ime
-   Samsaadhanii: https://sanskrit.uohyd.ac.in/manual/transliterate/
-   Sanskrit Documents tools:
    https://sanskritdocuments.org/processing_tools/

### Editor and backend technology

-   CodeMirror: https://codemirror.net/
-   Go: https://go.dev/
-   Go HTTP package: https://pkg.go.dev/net/http

------------------------------------------------------------------------

## 20. Summary

Vedic Editor is fundamentally a Unicode document editor with an
ITRANS-assisted input pane.

The most important product decision is that the output pane is an
independent, fully editable document. Transliteration is an input
convenience, not the source of truth.

The project should prioritise:

1.  Correct Unicode preservation.
2.  Reliable editing and clipboard behaviour.
3.  Deterministic ITRANS conversion.
4.  Correct Vedic accent representation and rendering.
5.  Script conversion with explicit handling of limitations.

A small, correct editor is more valuable than a large feature set that
silently changes Vedic text.
