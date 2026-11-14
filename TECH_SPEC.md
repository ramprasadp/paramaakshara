# Paramaakshara --- Technical Specification

**Repository name:** `paramaakshara`\
**Document:** `TECH_SPEC.md`\
**Version:** 1.1\
**Status:** Draft for implementation --- core decisions recorded in §18\
**Primary platform:** macOS\
**Architecture:** Local-first browser application served by a Go daemon\
**Primary input:** ITRANS\
**Initial output scripts:** Devanagari, Kannada, Tamil\
**Canonical document format:** Unicode UTF-8\
**Licence:** GPL-3.0

**Revision history**

  Version   Changes
  --------- ------------------------------------------------------------
  1.0       Initial draft.
  1.1       Segment-based editing model (§4); no hidden canonical
            script; ITRANS table corrections; tradition-aware Vedic
            accents; configuration, startup and session security
            (§9.5--9.8); project file format decided; dependencies
            (§16); decision log (§18).

------------------------------------------------------------------------

## 1. Project summary

Paramaakshara is an open-source, local-first text editor for composing,
editing and preserving Sanskrit and Vedic texts.

The primary workflow is a dual-pane editor:

1.  The user types English transliteration using ITRANS in the left
    pane.
2.  The right pane renders the corresponding Sanskrit text in real time.
3.  The right pane is a fully editable Unicode document, not a read-only
    preview.
4.  Manual corrections in the right pane affect only the lines they
    touch; the user can keep typing ITRANS and the remaining lines keep
    updating.
5.  The user can paste Unicode Sanskrit text from websites or other
    applications directly into the output pane.
6.  The user can change the output script between Devanagari, Kannada
    and Tamil.
7.  Vedic accents are typed in the ITRANS source: `_` for anudātta,
    `'` for svarita and `'''` for double svarita (§5.3). They can also
    be inserted from a symbol palette; further accents will be available
    through configurable keyboard mappings.

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
    svarita, labelled according to the Vedic tradition in use.
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
-   Access to the daemon from other machines on the network.

These may be considered after the core editing and Unicode requirements
are stable.

------------------------------------------------------------------------

## 2. Product principles

The following principles guide implementation decisions.

### 2.1 Unicode is authoritative

The document is Unicode text. ITRANS is an input representation, not the
document's storage format.

### 2.2 The output pane is an editor

The output pane must support ordinary text editing, selection, clipboard
operations, direct typing, symbol insertion, undo and redo. It must
never be treated as a disposable preview.

### 2.3 Manual work is never discarded implicitly

The ITRANS source and the Unicode output are separate state. Manual
changes to the output must not silently modify, or be overwritten by,
the source pane. A source edit never deletes manually edited output
(§4.3).

### 2.4 What is stored is what is shown

There is no hidden canonical copy of the output in another script. The
text in the output pane is exactly the text that is saved. Changing the
output script is an explicit, undoable operation that rewrites the
output and reports anything that could not be converted faithfully.

### 2.5 Deterministic conversion

Transliteration and script conversion must be deterministic. An LLM must
not be in the live text-conversion path. AI may assist development,
documentation and test generation, but production conversion must use
deterministic rules or a vetted library.

### 2.6 Local-first and privacy-conscious

The application should work offline after installation. Document content
must not leave the user's machine.

------------------------------------------------------------------------

## 3. User experience and main interface

### 3.1 Main window

The primary interface contains two side-by-side panes.

``` text
+------------------------------------------------------------------+
| Paramaakshara                                     File  Edit Help |
+------------------------------------------------------------------+
| Input scheme: ITRANS                    Output script: Devanagari |
+--------------------------------+---------------------------------+
| ITRANS INPUT                   | UNICODE OUTPUT                  |
|                                |                                 |
|   agnim iiLe purohitaM         |   अग्निम् ईळे पुरोहितम्             |
| ✎ yaj~nasya devam              | ✎ यज्ञस्य देवम्                     |
|                                |                                 |
+--------------------------------+---------------------------------+
| Vedic Symbols | Regenerate | Save | Find | 1 line edited | Saved  |
+------------------------------------------------------------------+
```

`✎` is a gutter marker showing a line whose output was edited manually
(§4.4). The example is illustrative. Exact transliteration output must
be validated against the selected ITRANS convention and test corpus.

### 3.2 Pane behaviour

**Input pane**

-   Accepts ITRANS text.
-   Maintains the original source text.
-   Provides real-time transliteration.
-   Supports ordinary text selection, copy, paste and undo/redo.
-   Shows segment state markers in the gutter (§4.4).

**Output pane**

-   Displays the Unicode document.
-   Is fully editable.
-   Accepts direct keyboard input and pasted Unicode.
-   Supports Vedic symbol insertion.
-   Supports selection, copy, paste, undo/redo, find and replace.
-   Preserves combining marks and unsupported characters.
-   Is the content that is saved and exported.
-   Shows segment state markers in the gutter (§4.4).

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
-   Regenerate line / Regenerate all (icon buttons).
-   Import Unicode (icon button in the ITRANS input header, §6.9).
-   Undo and redo.
-   Find and replace.
-   Open (document browser for configured folders) and Import (any file
    from the computer).
-   Save and Save As.
-   Export.
-   Document status.

### 3.5 Keyboard shortcuts

At minimum, preserve platform-native shortcuts:

  Action       macOS         Other platforms
  ------------ ------------- -----------------------
  Copy         Cmd-C         Ctrl-C
  Paste        Cmd-V         Ctrl-V
  Cut          Cmd-X         Ctrl-X
  Select all   Cmd-A         Ctrl-A
  Undo         Cmd-Z         Ctrl-Z
  Redo         Cmd-Shift-Z   Ctrl-Shift-Z, Ctrl-Y
  Find         Cmd-F         Ctrl-F
  Save         Cmd-S         Ctrl-S
  Open         Cmd-O         Ctrl-O

Shortcuts act on the focused pane. Cmd-S, Cmd-O and Cmd-F are handled by
the application and must call `preventDefault` so the browser's own
save/open/find does not run. No other shortcuts should be intercepted.

Browsers reserve Cmd-N, Cmd-T, Cmd-W and Cmd-Q, and the page cannot
override them. The application must therefore:

-   Not depend on Cmd-N for "New document" (use the toolbar or File
    menu).
-   Show a `beforeunload` confirmation when there are unsaved changes.
-   Rely on recovery snapshots (§10.4) for the cases where the browser
    closes anyway.

------------------------------------------------------------------------

## 4. Core document and editing model

This section defines the most important state-management requirements.

### 4.1 Segments

A document is an ordered list of **segments**. A segment pairs one line
of output with the ITRANS source that produced it.

``` ts
type Segment = {
  id: string;            // stable, generated; never shown to the user
  source: string | null; // one or more ITRANS lines; null = output-only
  output: string;        // exactly one line of Unicode text
  linked: boolean;       // output is generated from source
  stale: boolean;        // detached, and source changed since detaching
};
```

Segment kinds:

-   **Linked:** `output == transliterate(source, outputScript)`. The
    output is regenerated whenever the source changes.
-   **Detached:** has a source, but the output was edited manually. The
    output is no longer regenerated automatically.
-   **Output-only:** `source == null`. Created by typing or pasting new
    lines into the output pane, or by opening a plain-text file.

Rules that hold at all times:

-   Every output line belongs to exactly one segment. Output line breaks
    are segment boundaries.
-   Every source line belongs to exactly one segment. A segment normally
    covers one source line; it covers several only after output lines
    were merged (§4.3).
-   The input pane shows the sources of all segments that have one, in
    document order. Output-only segments do not appear in the input
    pane.

The granularity is the line because Vedic texts are naturally line
oriented (pāda, ṛk, mantra). A correction to one line must not stop the
rest of the document from following the source.

### 4.2 Source edits

  Source edit                          Effect
  ------------------------------------ ---------------------------------
  Edit inside a linked segment         Output regenerated.
  Edit inside a detached segment       Output unchanged; `stale = true`.
  New line typed                       New linked segment, inserted
                                       after the preceding source
                                       segment and any output-only
                                       segments that follow it.
  Line split (Enter mid-line)          Linked: two linked segments.
                                       Detached: first part keeps the
                                       manual output and becomes stale;
                                       second part is a new linked
                                       segment.
  Lines joined (line break deleted)    Both linked: one linked segment.
                                       Otherwise: one detached, stale
                                       segment whose output is the two
                                       outputs joined by a space.
  Source line deleted                  Linked: segment removed.
                                       Detached: segment becomes
                                       output-only (manual output is
                                       kept).
  Paste of multiple lines              Treated as typing those lines.

A merged segment (several source lines, created by §4.3) absorbs any
source edit inside it, including new line breaks, and becomes stale.
The exception is new lines typed at its very end, which become new
linked segments as above.

### 4.3 Output edits

Any user edit in the output pane (typing, paste, delete, cut, symbol
insertion, find/replace) follows these rules:

  Output edit                          Effect
  ------------------------------------ ---------------------------------
  Edit inside a linked segment         Segment becomes detached.
  Edit inside a detached segment       Output updated; source
                                       unchanged.
  Enter at the end of a line           New, empty output-only segment
                                       after it. The current segment
                                       is unchanged.
  Enter at the start of a line         New output-only segment before
                                       it.
  Enter mid-line                       First part keeps the source and
                                       becomes detached; second part
                                       becomes output-only.
  Line break deleted (merge)           One detached segment. Its source
                                       is both sources joined by a line
                                       break, so no source is lost.
  Whole output line deleted            Segment removed. Its source line
                                       is removed from the input pane
                                       too, as one undoable operation.
  Multi-line paste                     First line merges into the
                                       segment at the cursor (detaching
                                       it); remaining lines become
                                       output-only segments.

The ITRANS source is never modified by an output edit, except when a
whole segment is deleted.

### 4.3a Edits that span several lines

The rows of §4.2 and §4.3 are special cases of one rule, which also
covers replacing or deleting a selection across several lines. It
applies to either pane; "text" means the source in the input pane and
the output in the output pane.

1.  Let A and B be the segments containing the start and end of the
    edit. A keeps its text before the edit; B keeps its text after it.
2.  Segments entirely inside the edit lose all their text.
3.  If A and B both keep text and the inserted text has no line break,
    they are joined (§4.2 / §4.3 "line break deleted").
4.  Otherwise A keeps the first resulting line, B the last, and every
    other line becomes a new segment: linked in the input pane,
    output-only in the output pane. An end segment that keeps no text
    loses it like the segments in step 2.
5.  An edit inside a single segment that adds line breaks keeps the
    segment on the line holding its leading text, or, if it has none,
    on the line holding its trailing text (so Enter at the start of a
    line does not move the segment).
6.  A segment that loses all its text: in the input pane, a linked one
    is removed and a detached one becomes output-only; in the output
    pane, it is removed together with its source.

The implementation is `frontend/src/model/segments.ts`; randomised
tests check that both panes' text always equals a plain text edit and
that no manual output is lost.

**Re-linking:** whenever a detached segment's output exactly equals
`transliterate(source, outputScript)`, it becomes linked again and
`stale` is cleared. This makes undoing a manual edit behave naturally.

### 4.4 Segment state indicators

  State              Gutter marker   Meaning
  ------------------ --------------- --------------------------------------
  Linked             none            Output follows the source.
  Detached           `✎`             Output edited manually.
  Detached + stale   `✎!`            Source changed after the manual edit;
                                     regeneration is available.
  Output-only        `+`             No source (output pane only).
  Conversion error   `⚠`             The source contains sequences that
                                     could not be converted.

While the cursor or a selection is in either pane, the lines of the
segments it touches are highlighted in both panes, so the matching line
in the other pane is easy to find. The highlight is removed when
neither pane has focus.

Markers appear in both panes where the segment is visible. The status
bar shows counts of detached, stale and error segments. Hovering a stale
marker shows the current transliteration of the source next to the
manual output.

### 4.5 Regenerate output

-   **Regenerate line** replaces the output of the segment at the cursor
    with the transliteration of its source and re-links it. A segment
    that covers several source lines splits back into one linked segment
    per source line.
-   **Regenerate all** does the same for every detached segment.
    Output-only segments are not affected.
-   If a regeneration would replace manual output, the application must
    ask for confirmation and say how many lines will be replaced.
-   Each regeneration is a single undoable operation in the output
    history.

A future enhancement may show a side-by-side diff of the manual output
and the regenerated output. This is not required for version 1.

### 4.6 Script switching

The output script is a property of the document. Changing it:

1.  Regenerates every linked segment directly from its ITRANS source in
    the new script. This is lossless.
2.  Converts the output of every detached and output-only segment from
    its current script to the new script using the script converter
    (§7). Text in other scripts, Latin text, digits and punctuation that
    has no mapping is left unchanged.
3.  Reports, per segment, any character that could not be converted
    faithfully (§7.3).
4.  Does not modify the ITRANS source.
5.  Is a single undoable operation.

Converted detached segments stay detached unless the re-linking rule
(§4.3) applies.

There is no hidden Devanagari copy of the document. Mixed-script
documents (for example a Devanagari verse with a Kannada commentary
line) are allowed and saved exactly as shown.

### 4.7 Undo/redo

-   Each pane has its own history. Cmd-Z acts on the focused pane.
-   The **input history** records source edits. Undoing a source edit
    updates linked outputs, but those updates are not recorded in the
    output history.
-   The **output history** records manual edits, paste, symbol
    insertion, regeneration and script switching. Automatic updates of
    linked segments are not recorded in it; the editor maps the output
    history through them (CodeMirror does this natively).
-   Deleting a whole output line also removes its source line (§4.3).
    This is one entry in the output history; undoing it restores both.
-   Undoing a manual output edit restores the previous output; the
    re-linking rule then makes the segment linked again if the output
    matches the source.
-   Undo and redo in one pane restore only that pane's side of a line
    that the other pane has changed since. For example: edit output line
    2, then edit its ITRANS, then undo in the output pane. The output is
    restored and the ITRANS edit is kept; the line stays detached and
    stale.
-   Undo in the input pane never discards manual output. If it removes a
    line whose output was edited by hand, that output stays as an
    output-only line.

Implementation: every edit records a patch of the segments it changed
(`frontend/src/model/patch.ts`) in the same CodeMirror transaction, so
the pane's history replays the inverse patch with the text
(`frontend/src/model/undo.ts`).

------------------------------------------------------------------------

## 5. Transliteration engine

### 5.1 Initial scheme

ITRANS is the mandatory initial input scheme.

The reference convention is **ITRANS 5.3**. Any deviation (for example
an added sequence for ZWJ/ZWNJ or a Vedic sign) must be listed in
`docs/itrans-mappings.md` with its reason. Mappings must be verified
against the reference rather than inferred from a small example list.

### 5.2 Illustrative mappings

The following examples are indicative, not the normative mapping table.
Where alternatives exist, all must be accepted on input.

  ITRANS                  Devanagari   Notes
  ----------------------- ------------ ---------------------------------
  `a`                     अ            inherent vowel after consonants
  `aa` / `A`              आ / ा
  `i`                     इ / ि
  `ii` / `I`              ई / ी
  `u`                     उ / ु
  `uu` / `U`              ऊ / ू
  `RRi` / `R^i`           ऋ / ृ        vocalic ṛ
  `RRI` / `R^I`           ॠ / ॄ        vocalic ṝ
  `LLi` / `L^i`           ऌ / ॢ        vocalic ḷ
  `e`, `o`                ऎ / ॆ, ऒ / ॊ  short e, o (ಎ ೆ ಒ ೊ, எ ெ ஒ ொ)
  `E`, `ai`, `O`, `au`    ए ऐ ओ औ      long e, o (ಏ ೇ ಓ ೋ, ஏ ே ஓ ோ)
  `k kh g gh ~N`          क ख ग घ ङ    `~N` is ṅa (velar nasal)
  `ch Ch j jh ~n`         च छ ज झ ञ    `ch` is unaspirated; `chh` = `Ch`;
                                       `JN` = `~n`
  `T Th D Dh N`           ट ठ ड ढ ण
  `t th d dh n`           त थ द ध न
  `p ph b bh m`           प फ ब भ म
  `y r l v`               य र ल व      `w` = `v`
  `sh Sh s h`             श ष स ह      `shh` = `Sh`
  `L` / `ld`              ळ            Vedic ḷa
  `x` / `kSh`             क्ष
  `GY` / `j~n` / `dny`    ज्ञ
  `M`                     ं             anusvara
  `H`                     ः             visarga
  `.N`                    ँ             chandrabindu
  `.a`                    ऽ            avagraha
  `.h`                    ्             explicit virama
  `{}`                    (nothing)    separator that blocks a conjunct
  `OM`                    ॐ
  `|` / `||`              । / ॥
  `_`                     ॒ U+0952     anudātta (§5.3)
  `'`                     ॑ U+0951     svarita (§5.3)
  `'''`                   ᳚ U+1CDA     double svarita (§5.3)

The complete table must live in documented, testable mapping data, not
in UI event handlers. The table must also define:

-   How digits are handled (ASCII or Devanagari digits); this must be a
    documented option.
-   Input sequences for ZWJ (U+200D) and ZWNJ (U+200C), which control
    conjunct rendering.

### 5.3 Vedic accent input

Vedic accents are typed directly in the ITRANS source with these
sequences. This is the project's accent scheme for version 1 and is
required, not illustrative.

  Accent           Sequence   Code point   Unicode name                     Appearance
  ---------------- ---------- ------------ -------------------------------- ---------------------------
  Anudātta         `_`        U+0952       DEVANAGARI STRESS SIGN ANUDATTA  horizontal line below
  Svarita          `'`        U+0951       DEVANAGARI STRESS SIGN UDATTA    vertical line above
  Double svarita   `'''`      U+1CDA       VEDIC TONE DOUBLE SVARITA        two vertical lines above

The udātta is left unmarked. This matches the Ṛgveda convention in
§6.2. Note that U+0951 is named *UDATTA* in Unicode but is used here
for the svarita; the UI must show the traditional name.

**Example** (Ṛgveda 1.1.1):

``` text
a_gnimii'LE pu_rOhi'taM ya_j~nasya' dE_vamR^i_tvija'm
अ॒ग्निमी॑ळे पु॒रोहि॑तं य॒ज्ञस्य॑ दे॒वमृ॒त्विज॑म्
```

**Rules:**

-   **Position.** The accent sequence is typed immediately after the
    vowel of the accented syllable (`pu_`, `hi'`, `ja'`). For a syllable
    with the inherent vowel, it follows the `a` (`ya_`). The mark is
    written after the vowel sign in the output, so it attaches to the
    whole syllable.
-   **Anusvara, visarga and chandrabindu.** Both `aM'` and `a'M` are
    accepted. The output always writes the sign **first** and the
    accent after it: भूमिं॑ (U+0902 U+0951), not भूमि॑ं. The reverse order,
    which Baraha produces, shows a dotted circle in every font tested
    (ADR 0002). The same applies to visarga (ः) and chandrabindu (ँ).
-   **Longest match.** `'''` is read before `'`. A run of apostrophes
    must have length 1 or 3. Any other length (`''`, `''''`) is not
    converted to marks: it is passed through unchanged and the segment
    is flagged with a conversion error, so that a typing slip never
    produces a wrong but plausible accent.
-   **Accent without a vowel.** An accent sequence at the start of a
    line, after a space, or after a consonant with no vowel is passed
    through unchanged and flagged.
-   **Accents on a digit.** An accent may also follow a digit. The
    Ṛgveda marks a kampa with १ carrying the accents of the
    surrounding syllables: `dE_vya1_'kShabhi'H` gives दे॒व्य१॒॑क्षभिः॑
    (Ṛgveda 10.127.1). This holds with ASCII digits too.
-   **Literal characters.** In the ITRANS source, `'` and `_` always
    mean accents. A literal apostrophe or underscore is typed directly
    in the output pane.
-   **Deviation from ITRANS 5.3.** This scheme is a project choice and
    takes precedence over any other meaning `'` or `_` has in the ITRANS
    reference. The deviation is recorded in `docs/itrans-mappings.md`.
-   **Other scripts.** The three marks are kept as the same code points
    when the output is Kannada or Tamil. Their rendering in each script
    must be verified in the Phase 3 font tests.
-   **Distinct characters.** Double svarita is always U+1CDA. It must
    never be produced as two U+0951 marks, and two U+0951 marks must
    never be shown or reported as a double svarita.
-   **Baraha's double svarita.** Baraha's `$` produces U+0953 DEVANAGARI
    GRAVE ACCENT, which standard fonts draw as a single slanted stroke.
    Paramaakshara never produces U+0953 for the double svarita. Existing
    Baraha text keeps U+0953 until the user converts it with Clean up
    text (§6.8).

### 5.4 Conversion granularity

Conversion is cheap. On every source change, the affected segments are
re-converted in full from their source line. No incremental parser state
is kept between keystrokes.

-   Incomplete sequences are shown as their partial result: typing `k`
    shows क्, then `ka` shows क. The input pane itself is the pending
    buffer, so no commit timeout or delimiter is required.
-   Inserting or deleting in the middle of a line is handled by
    re-converting that line.
-   The user never has to press Enter to commit a word.

The parser must still handle complete and incomplete sequences,
ambiguous prefixes (longest match), multi-character consonants, long
vowels, special tokens, whitespace and punctuation. Sequences that are
not valid ITRANS are passed through unchanged and the segment is marked
with a conversion error (§4.4).

### 5.5 Conversion interfaces

Conversion runs in the frontend (TypeScript); see §18, decision 2.

``` ts
interface Transliterator {
  // Converts one source line. Never throws; problems are reported.
  convert(source: string, targetScript: Script): ConversionResult;
}

interface ConversionResult {
  text: string;
  issues: ConversionIssue[]; // e.g. unknown sequence at offset 12
}
```

The Go daemon does not transliterate. If a Go implementation is ever
needed (for example a command-line batch converter), it must pass the
same test corpus.

### 5.6 Existing transliteration engines

  Candidate                       Licence*     Fit
  ------------------------------- ------------ -------------------------
  `@indic-transliteration/        MIT          JavaScript, runs in the
  sanscript`                                   browser, data-driven
                                               schemes, supports ITRANS,
                                               Devanagari, Kannada, Tamil.
                                               **Evaluated and not used**
                                               (ADR 0003): inserts ZWJ
                                               for `{}`, has no `'''`
                                               or accent rules, cannot
                                               report errors.
  Aksharamukha                    AGPL-3.0     Python; not usable in the
                                               browser. May be used
                                               offline as a test oracle.
  Lipika IME                      GPL-3.0      macOS input method, not a
                                               library. Its mapping data
                                               may be reused under the
                                               project's GPL-3.0 licence
                                               (§17.2).
  Samsaadhanii                    ---          Reference only.

\* Licences must be confirmed from each project's current `LICENSE`
file before use.

Before adoption, the provisional choice must pass the Phase 2 test
corpus for:

-   ITRANS 5.3 coverage, including the alternatives in §5.2.
-   Devanagari output correctness.
-   Kannada and Tamil conversion.
-   Preservation of combining marks and of unmapped characters.
-   Whether the accent scheme in §5.3 (`_`, `'`, `'''`) can be added as
    a custom scheme, or must be handled by a project-owned layer before
    or after the library call.

If it fails, the project implements its own table-driven converter from
`docs/itrans-mappings.md`. ITRANS is small enough (about 100 tokens,
longest-match parsing) that this is a reasonable fallback. Either way,
the project's own test corpus is the authority, not the library.

The accent rules in §5.3 (position, run lengths, error flagging) are
project-specific and are owned and tested by the project whichever
engine is used.

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

The document must preserve combining marks, viramas, vowel signs,
punctuation, Vedic characters, ZWJ/ZWNJ, avagraha, danda and double
danda, nukta and OM.

### 6.2 Vedic accents depend on the tradition

The same Unicode character means different things in different Vedic
traditions, and Unicode character names do not match traditional usage.

For example, in the common Ṛgveda (Śākala) Devanagari convention the
vertical stroke above, U+0951 (Unicode name *DEVANAGARI STRESS SIGN
UDATTA*), marks the **svarita**, the horizontal stroke below, U+0952,
marks the **anudātta**, and the udātta is left unmarked. Taittirīya,
Śukla Yajurveda and Sāmaveda texts (the last with numerals above the
letters, U+A8E0--U+A8F1) use other conventions.

The first release must:

-   Document the accent inventory **per tradition**, starting with the
    traditions the project's users actually need (to be confirmed;
    §18, decision 6).
-   Label accents by their traditional meaning in the selected
    tradition, with the Unicode name shown only as secondary
    information.
-   Never treat similar-looking marks as interchangeable.

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
  Tradition(s)     Traditions that use it
  Vedic meaning    Traditional meaning in each tradition, where verified
  Category         Combining mark, independent sign, punctuation, etc.
  Input mapping    Optional keyboard sequence
  Script support   Tested output scripts
  Font test        Fonts and browsers in which rendering was checked
  References       Reliable source for interpretation

### 6.4 Symbol palette

Provide a searchable Vedic symbol palette, grouped by tradition.

The palette must:

-   Let the user choose the tradition; remember the choice per document.
-   Display the symbol, its traditional name, its Unicode name and code
    point.
-   Insert the character at the output editor's cursor position.
-   Preserve the current selection/cursor behaviour.
-   Support keyboard accessibility.
-   Permit future configurable mappings.
-   Mark symbols the bundled font has no glyph for. Coverage is read from
    the font's character map; for other fonts it is not known and the
    palette says so.

Version 1 always uses the bundled Noto Serif fonts. A font menu offering
the macOS Devanagari fonts was removed: none of them has U+1CDA, and
Firefox then draws the double svarita on a dotted circle because it does
not combine a mark from a fallback font with its base letter.
`editor.fonts` in the config is not yet used.

Example layout:

``` text
+------------------------------------------------+
| VEDIC SYMBOLS        Tradition: [Ṛgveda    ▾]  |
+------------------------------------------------+
| Svarita      Anudātta     Double svarita       |
|   [mark]      [mark]        [mark]             |
|   U+0951      U+0952        U+1CDA             |
|   '           _             '''                |
|                                                |
| Other signs                                    |
| [sign] [sign] [sign] [sign]                    |
+------------------------------------------------+
```

The actual glyphs must be verified with the chosen font. A missing glyph
must be indicated rather than represented by a misleading substitute.

### 6.5 Keyboard mappings

-   Version 1 supports `_` (anudātta), `'` (svarita) and `'''` (double
    svarita) in the ITRANS source (§5.3).
-   The palette shows each mark's input sequence.
-   Further accents should be insertable through configurable sequences.
-   Do not invent or hardcode Baraha key mappings without verification.

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
-   Preserve ZWJ and ZWNJ.
-   Test cursor movement, deletion and selection around combining
    sequences.
-   Test multiple marks attached to one base character.
-   Test rendering in every supported output script.

No Unicode normalization is applied anywhere in version 1. Exact
preservation is the rule. Any later normalization feature must be an
explicit user action and must be tested against the Vedic corpus.

### 6.7 Vedic correctness

Rendering and encoding are separate concerns. A character can be
correctly stored but displayed incorrectly by a font or browser.

The project must maintain verified sample passages and screenshot
references for supported font/browser combinations (§13.6). A text
comparison alone is not enough to validate visual placement of accents.

### 6.8 Text from other tools

Text from other tools may use look-alike characters. For example, a
Baraha source typed with `:` instead of `H` produces an ASCII colon
(U+003A) instead of the visarga ः (U+0903). Such text looks right but is
not converted, searched or shaped as a visarga.

-   Pasted and opened text is always kept exactly as it is (§6.6).
-   The output pane provides an explicit **Clean up text** command. In
    version 1 it offers these fixes, each of which the user can select
    or deselect:

  Fix                  From                           To
  -------------------- ------------------------------ ---------------------------
  Visarga              ASCII `:` (U+003A) directly    ः U+0903 (Devanagari),
                       after a Devanagari or Kannada  ಃ U+0C83 (Kannada)
                       letter, vowel sign or Vedic
                       mark
  Double svarita       U+0953 (Baraha `$`)            U+1CDA
  Sanskrit e/o         Devanagari short e/o:          Long e/o:
                       ॆ U+0946, ॊ U+094A,             े U+0947, ो U+094B,
                       ऎ U+090E, ऒ U+0912              ए U+090F, ओ U+0913
  Taittirīya anusvara  (ग्म्), (ग्ग्) as plain text       ꣳ U+A8F3, ꣴ U+A8F4
                       (Baraha)                       (ITRANS `(gm)`, `(gg)`)
  Accent order         Accent followed by anusvara,   The sign, then the accent
                       visarga or chandrabindu        (§5.3)
                       (भूमि॑ं)                         (भूमिं॑)

-   Tamil has no visarga sign; Tamil text is left to the Tamil
    convention (§7.3).
-   The command shows the number of changes per fix and a preview before
    applying them, applies to the selection or the whole document, and
    is a single undoable operation. Changed segments are detached
    (§4.3).
-   Further fixes are added only when observed in real samples, each
    with a test case in `testdata/`.

### 6.9 Importing Unicode text

Text that already exists in Unicode (Devanagari, Kannada or Tamil) can
be brought into the input pane as ITRANS, so it is edited and converted
like typed text.

-   **Import Unicode** opens a dialog where the text is pasted. Unicode
    text pasted directly into the ITRANS pane (more Indic characters
    than Latin letters) opens the same dialog, which also offers to
    paste it unchanged.
-   Kannada and Tamil are first brought to Devanagari (§7). Each line is
    rewritten in ITRANS with the spellings in `docs/itrans-mappings.md`
    ("Unicode → ITRANS"); `{}` or `.h` is written where two spellings
    would otherwise read as something else (`ka{}i` कइ, `k.ha` क्अ).
-   Characters with no ITRANS spelling (for example U+0953, or ऩ from
    Tamil ன) are kept as they are and listed; the converter passes them
    through.
-   Nothing changes silently (§6.6): the dialog converts each line's
    ITRANS back and marks with ⚠ every line that does not give back the
    pasted text exactly in Devanagari, such as Baraha's accent before
    anusvara (§5.3) or precomposed nukta letters.
-   The ITRANS is inserted at the input cursor as one undoable edit; the
    output follows it as linked segments in the current output script.

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
-   ZWJ and ZWNJ.
-   Anusvara and visarga.
-   Chandrabindu.
-   Avagraha, danda, double danda and OM.
-   Vedic marks.
-   Punctuation.
-   Whitespace.

Unsupported characters must be left unchanged and reported. They must
not silently disappear.

### 7.3 Tamil convention

Tamil script does not have separate letters for every Sanskrit
consonant.

The default convention is **Tamil with superscript numerals**: the
aspirated and voiced consonants are written with a superscript digit
(for example क → க, ख → க², ग → க³, घ → க⁴), and the Grantha letters that are
part of the Tamil Unicode block (ஜ ஷ ஸ ஹ க்ஷ) are used where they
exist. The position of the superscript relative to vowel signs must be
chosen and documented in `docs/script-conversion.md`.

-   Superscripted Tamil converts back to Devanagari for the documented
    scope. Round-trip tests must prove this.
-   Plain Tamil without superscripts may be offered later as an option;
    it is lossy and conversion back to Devanagari must report every
    ambiguous character.
-   The converter must never claim that a lossy conversion was exact.

### 7.4 Script converter interface

``` ts
interface ScriptConverter {
  // Converts one line; text in other scripts passes through unchanged.
  convert(text: string, from: Script, to: Script): ConversionResult;
  // Detects the script of each run of characters by Unicode block.
  detect(text: string): ScriptRun[];
}
```

The conversion layer is a plain TypeScript module with no dependency on
the editor UI, so it can be tested on its own.

### 7.5 Script switching and manual edits

Script switching follows §4.6. It must work after manual output edits,
must not discard them, and must report what could not be converted. The
ITRANS source remains unchanged.

------------------------------------------------------------------------

## 8. Frontend architecture

### 8.1 Technology

-   HTML5 and CSS.
-   TypeScript.
-   CodeMirror 6 for both panes (provisional; see below).
-   No UI framework. The UI is small enough for plain TypeScript
    components.
-   Built with Vite into static files that are embedded in the Go
    binary.

The segment model (§4) needs range tracking across edits and gutter
markers, which CodeMirror 6 provides (state fields, decorations, gutter
extensions, history that maps through non-history changes). A plain
textarea cannot show gutter markers and would need the segment model to
be simplified.

The M1 spike confirmed CodeMirror 6 (ADR 0001): it behaves the same in
Chromium, Firefox and WebKit with Vedic text, never places the cursor
between a letter and its marks, and Backspace removes one mark at a
time. The plain textarea behaved differently in each engine. A
hand-written `contenteditable` editor is excluded.

### 8.2 Frontend component layout

Suggested structure:

``` text
frontend/
  index.html
  package.json
  vite.config.ts
  src/
    app.ts
    components/
      InputEditor.ts
      OutputEditor.ts
      ScriptSelector.ts
      SymbolPalette.ts
      Toolbar.ts
      StatusBar.ts
      DocumentBrowser.ts
    model/
      segments.ts          # segment list and the rules in §4.2--4.3
      segment-tracking.ts  # CodeMirror state fields and gutters
    conversion/
      transliteration.ts
      script-conversion.ts
      mappings/            # data tables, see docs/itrans-mappings.md
    services/
      api.ts               # calls to the Go daemon
      recovery.ts
    styles/
      editor.css
      layout.css
  assets/
    fonts/
  tests/
    unit/
    e2e/
```

### 8.3 Font strategy

Evaluate appropriate fonts for:

-   Devanagari.
-   Kannada.
-   Tamil.
-   Vedic Extensions and combining marks.

The Noto families (OFL-1.1) are the baseline and may be bundled (§16.5).
No font should be assumed to cover every Vedic character correctly;
fonts with better Vedic coverage must be evaluated and, if their licence
does not allow bundling, supported as user-installed fonts.

Choosing a font per script (§9.6, `editor.fonts`) is planned; a font
is offered only if it renders the Vedic accents in all supported
browsers (§6.4).

### 8.4 Rendering tests

Test at minimum:

-   macOS with Chrome, Firefox and Safari.
-   Each output script.
-   Vedic combining marks.
-   Multiple accents on one base character.
-   Copy/paste round trips.
-   Zoom and font-size changes.

------------------------------------------------------------------------

## 9. Go daemon and backend architecture

### 9.1 Responsibilities

The Go daemon:

-   Serves the frontend assets, embedded in the binary.
-   Issues the browser session (§9.5).
-   Lists, opens and saves documents within configured folders.
-   Imports uploaded files and stores recovery snapshots and backups.
-   Reads and writes editor settings.

It does **not** transliterate, convert scripts or normalize text. All
conversion happens in the frontend.

A webview shell (for example Wails) would give native file dialogs and
no open port, but adds a native toolchain. Version 1 uses the browser
and daemon; the trade-off is recorded in §18, decision 11.

### 9.2 Suggested repository structure

``` text
paramaakshara/
  cmd/
    paramaakshara/
      main.go

  internal/
    server/
      server.go
      routes.go
      auth.go           # session cookie, Host/Origin checks
    document/
      store.go          # os.Root based access, revisions, atomic
                        # writes, backups
      recovery.go       # recovery snapshots
    config/
      config.go
      paths.go          # per-OS config, data and log directories
    instance/
      instance.go       # single-instance detection, session file

  frontend/             # see §8.2; built output embedded via go:embed

  docs/
    architecture.md
    itrans-mappings.md
    vedic-symbols.md
    unicode-handling.md
    script-conversion.md
    adr/

  testdata/
    itrans/
    vedic/
    unicode/
    script-conversion/

  README.md
  TECH_SPEC.md
  CONTRIBUTING.md
  THIRD_PARTY_NOTICES.md
  LICENSE
  go.mod
```

This is a suggested starting structure. Packages may be reorganised as
the implementation evolves.

### 9.3 HTTP API

All `/api` endpoints except `/api/health` require the session cookie
(§9.5). Documents are identified by `{root, path}`: `root` is the name
of a configured document folder and `path` is a relative path inside
it. Absolute paths are never accepted from the browser.

  Method   Path                      Purpose
  -------- ------------------------- --------------------------------------
  GET      `/auth?token=…`           Exchange the launch token for a
                                     session cookie; redirect to `/`
  GET      `/`                       Serve the editor
  GET      `/api/health`             `{"app":"paramaakshara","version":…}`
  GET      `/api/config`             Editor settings and read-only
                                     information (roots, limits)
  PUT      `/api/config/editor`      Update editor settings only
  GET      `/api/documents?root=`    List documents in a folder
  GET      `/api/document?root=&path=` Open a document
  PUT      `/api/document`           Save a document
  POST     `/api/export/pdf`         Make a PDF of the output lines
                                     and write it in a document folder
                                     (§10.1b)
  POST     `/api/folders/pick`       Show the system folder picker on
                                     this computer; returns an opaque
                                     folder name (§10.1b)
  GET      `/api/recovery`           List recovery snapshots (without
                                     their content)
  GET      `/api/recovery/{key}`     Read one recovery snapshot
  PUT      `/api/recovery/{key}`     Store a recovery snapshot
  DELETE   `/api/recovery/{key}`     Discard a recovery snapshot
  POST     `/api/shutdown`           Stop the daemon

Import and export happen in the browser and need no endpoint. Import
reads a file chosen from anywhere on the computer with the browser's
file picker (rejecting invalid UTF-8); the result is an untitled
document that Save puts into a document folder. Export downloads the
Unicode output as a `.txt` file. Export all (§10.1b) writes its text
files with `PUT /api/document`, like Save, and its PDF with
`POST /api/export/pdf`.

Example save request:

``` json
{
  "root": "Documents",
  "path": "rigveda/mandala-1.paramaakshara.json",
  "base_revision": "sha256:9f2c…",
  "content": "{ … project file … }"
}
```

Example responses:

``` json
{ "revision": "sha256:41ab…" }
```

``` json
{
  "error": {
    "code": "conflict",
    "message": "The file changed on disk since it was opened.",
    "current_revision": "sha256:77d0…"
  }
}
```

Error codes: `bad_request`, `unauthorized`, `forbidden`, `not_found`,
`conflict`, `too_large`, `invalid_utf8`, `internal`.

### 9.4 Document API semantics

-   **Revisions:** the revision is the SHA-256 of the file bytes. A save
    must include `base_revision` (empty for a new file). If the file on
    disk has a different revision, or a new file already exists, the
    save fails with `conflict` (HTTP 409) and nothing is written.
-   **Atomic writes:** write a temporary file in the same directory,
    `fsync`, then rename over the target.
-   **Backups:** before overwriting, copy the previous version to the
    backups directory (§9.6, `documents.backup_count`).
-   **Encoding:** files must be valid UTF-8. Invalid UTF-8 is rejected
    with `invalid_utf8`; it is never replaced with U+FFFD. A leading BOM
    is removed on open, remembered, and written back on save.
-   **Line endings:** LF and CRLF are detected on open, LF is used in
    the editor, and the original style is written back on save.
-   **No content changes:** the backend never transliterates or
    normalizes document content.
-   **Path safety:** all file access goes through `os.Root` opened on
    the configured folder, which rejects `..`, absolute paths and
    symlinks that escape the folder.
-   **Picked folders:** besides the configured folders, a folder the
    user chooses in the operating system's folder picker (shown by the
    daemon, §10.1b) is a document folder until the daemon stops. The
    browser receives a random name (`picked-…`) and the folder's last
    path element, never the path, and cannot name a folder itself.
-   **Size limit:** requests and files larger than
    `documents.max_document_bytes` are rejected with `too_large`.

### 9.5 Local security

A server on `127.0.0.1` can still be reached by any web page the user
visits (cross-site requests, DNS rebinding). The following are
requirements, not options:

-   **Loopback only.** `server.listen_address` must be a loopback
    address; the daemon refuses to start otherwise. The one exception
    is a container (`PARAMAAKSHARA_CONTAINER=1`, set by the image in
    `docker/`): there the daemon listens on all interfaces inside the
    container, whose own loopback the host cannot reach, and the port
    is published on the host's `127.0.0.1` only. The setting can come
    only from the environment, never from the config file.
-   **Host check.** Every request must have a `Host` header of
    `127.0.0.1:<port>` or `localhost:<port>`; others get 403. This
    blocks DNS rebinding.
-   **Session token.** At startup the daemon generates a 32-byte random
    token (`crypto/rand`). It opens the browser at
    `http://127.0.0.1:<port>/auth?token=<token>`. `/auth` checks the
    token, sets the cookie `pak_session` (`HttpOnly`,
    `SameSite=Strict`, `Path=/`) and redirects to `/`. The token is
    single-use; the cookie value is a separate random session ID.
-   **Origin check.** Every request other than GET must have an `Origin`
    header equal to the daemon's own origin.
-   **No CORS.** The daemon never sends `Access-Control-Allow-*`
    headers.
-   **Content Security Policy.** `default-src 'self'; style-src 'self'
    'unsafe-inline'; frame-ancestors 'none'; base-uri 'none';
    form-action 'self'`. No inline scripts; fonts and scripts are served
    by the daemon, never from a CDN. Inline styles are allowed because
    CodeMirror injects its own stylesheet at runtime.
-   **Restricted files.** File access is limited to configured document
    folders (§9.4).
-   **Settings boundary.** The browser can change editor settings only.
    The listen address, port, document folders and limits can be
    changed only by editing the config file, so a compromised page
    cannot widen file access.
-   **No shell commands** based on document content.
-   **No document text in logs** (§9.8).
-   **No network calls** to external services.

### 9.6 Configuration

**Precedence (lowest to highest):** built-in defaults, config file,
environment variables, command-line flags.

**Locations** (resolved with `os.UserConfigDir` and friends):

  Item              macOS                                          Linux
  ----------------- ---------------------------------------------- -----------------------------------
  Config file       `~/Library/Application Support/Paramaakshara/`  `~/.config/paramaakshara/`
                    `config.json`                                  `config.json`
  Session file      same directory, `session.json` (mode 0600)     same directory
  Recovery          `…/Paramaakshara/recovery/`                     `~/.local/state/paramaakshara/`
                                                                   `recovery/`
  Backups           `…/Paramaakshara/backups/`                      `~/.local/state/paramaakshara/`
                                                                   `backups/`
  Logs              `~/Library/Logs/Paramaakshara/`                 `~/.local/state/paramaakshara/`
                    `paramaakshara.log`                             `paramaakshara.log`
  Default folder    `~/Documents/Paramaakshara/`                    `~/Documents/Paramaakshara/`

The config file is JSON so it can be read and written with the standard
library. If it does not exist, the daemon starts with defaults and does
not create it until a setting is changed. The default document folder is
created on first run.

**Example `config.json`** (all keys optional):

``` json
{
  "server": {
    "listen_address": "127.0.0.1",
    "port": 7531,
    "open_browser": true
  },
  "documents": {
    "roots": [
      { "name": "Documents", "path": "~/Documents/Paramaakshara" }
    ],
    "max_document_bytes": 10485760,
    "backup_count": 5
  },
  "recovery": {
    "interval_seconds": 15,
    "retention_days": 30
  },
  "logging": {
    "file": "",
    "max_backups": 14
  },
  "pdf": {
    "browser": ""
  },
  "editor": {
    "input_scheme": "itrans",
    "output_script": "devanagari",
    "tamil_convention": "superscript",
    "vedic_tradition": "rigveda",
    "digits": "devanagari",
    "fonts": {
      "devanagari": "Noto Serif Devanagari",
      "kannada": "Noto Serif Kannada",
      "tamil": "Noto Serif Tamil"
    },
    "font_size_px": 20,
    "layout": "side-by-side",
    "autosave_to_file": false
  }
}
```

**Keys:**

  Key                              Default                   Set from UI   Notes
  -------------------------------- ------------------------- ------------- --------------------------------
  `server.listen_address`          `127.0.0.1`               no            Loopback only (§9.5).
  `server.port`                    `7531`                    no            Fixed so the browser origin,
                                                                           cookie and bookmarks stay the
                                                                           same across launches.
  `server.open_browser`            `true`                    no            Open the editor on launch.
  `documents.roots`                one folder (above)        no            Name/path pairs; `~` expanded.
  `documents.max_document_bytes`   10 MiB                    no
  `documents.backup_count`         `5`                       no            Backups kept per document;
                                                                           `0` disables.
  `recovery.interval_seconds`      `15`                      no            Snapshot interval while dirty.
  `recovery.retention_days`        `30`                      no            Old snapshots are deleted.
  `logging.file`                   per-OS path (above)       no            Empty means the default path;
                                                                           `-` means standard error.
  `logging.max_backups`            `14`                      no            Rotated log files kept.
  `pdf.browser`                    empty                     no            Chrome/Edge/Chromium executable
                                                                           for Export all PDFs (§10.1b);
                                                                           empty searches the usual
                                                                           places; `~` expanded.
  `editor.input_scheme`            `itrans`                  yes           Only `itrans` in v1.
  `editor.output_script`           `devanagari`              yes           Default for new documents.
  `editor.tamil_convention`        `superscript`             yes           §7.3.
  `editor.vedic_tradition`         `rigveda`                 yes           Default palette grouping (§6.4).
  `editor.digits`                  `devanagari`              yes           `devanagari` or `ascii` (§5.2).
  `editor.fonts`                   Noto families             yes           Per script.
  `editor.font_size_px`            `20`                      yes
  `editor.layout`                  `side-by-side`            yes           Or `stacked`.
  `editor.autosave_to_file`        `false`                   yes           Recovery snapshots are always
                                                                           on; this also saves the file
                                                                           itself (§10.4).

**Environment variables:** `PARAMAAKSHARA_CONFIG` (config file path),
`PARAMAAKSHARA_PORT`, `PARAMAAKSHARA_LOG_FILE`.

**Command-line flags:** `--config <path>`, `--port <n>`,
`--log-file <path>` (`-` for standard error), `--no-browser`,
`--version`.

`session.json` is written next to the config file in use, so instances
started with different config files do not share it.

Unknown keys are reported as a warning at startup and ignored. Invalid
values (for example a non-loopback address or a port outside 1024--65535)
stop the daemon with a message naming the key.

### 9.7 Startup, single instance and shutdown

1.  Load configuration (§9.6).
2.  Try to listen on `listen_address:port`.
3.  If the port is in use, call `/api/health` on it:
    -   If it is Paramaakshara, read the running instance's
        `session.json`, open the browser at its `/auth` URL, and exit.
        This works because the running instance replaces its launch
        token as soon as one is used and rewrites `session.json`, so the
        file always holds an unused token.
    -   Otherwise exit with an error that names the port and the
        `server.port` setting / `--port` flag. The daemon does not pick
        another port silently, because the origin would change.
4.  Write `session.json` (`port`, `pid`, current launch token; mode
    0600).
5.  Open the browser (`open` on macOS, `xdg-open` on Linux, run with
    `os/exec` and no shell) unless `--no-browser`. With `--no-browser`,
    or if the browser cannot be opened, print the sign-in link on
    standard output. The link is never written to the log.
6.  On SIGINT, SIGTERM or `POST /api/shutdown`: stop accepting
    requests, finish in-flight writes, remove `session.json`, exit.

### 9.8 Logging

-   Standard library `log`, configured with `log.SetFlags(log.LstdFlags)`
    and `log.SetOutput` to the log file. Messages are plain text,
    unquoted.
-   The log file is written through `gopkg.in/natefinch/lumberjack.v2`,
    rotated daily by calling `Rotate()`; `logging.max_backups` files are
    kept.
-   Log startup, configuration warnings, request method, path, status
    and duration, and errors.
-   Never log document content, the `/auth` query string (it contains
    the token) or cookie values.

------------------------------------------------------------------------

## 10. Document storage and file formats

### 10.1 Formats

  Format                  Extension               Open   Save   Notes
  ----------------------- ----------------------- ------ ------ ---------------------------
  Paramaakshara project   `.paramaakshara.json`   yes    yes    Native format; keeps source,
                                                                output and segment state.
  UTF-8 plain text        `.txt`                  yes    yes    Output only. Opened as
                                                                output-only segments.
  ITRANS source           `.itx`, `.txt`          yes    yes    Imported into the input pane
                                                                as linked segments ("Import
                                                                as ITRANS").

Future possibilities: Markdown, HTML and DOCX export; Baraha
legacy-format import; other legacy Sanskrit encodings, subject to
licensing and technical feasibility.

### 10.1a PDF export

**Export PDF…** prints the output text on its own through the browser's
print engine, where the user chooses Save as PDF:

-   Only the output lines are printed, with an optional title; editor
    panes, gutters and markers are not. Empty lines are kept, and a line
    is not split across pages.
-   Page size (A4 or Letter) and text size are chosen in a dialog and
    remembered per browser.
-   The browser shapes the text exactly as on screen and embeds the
    bundled fonts, so conjuncts and Vedic accents are correct in the PDF.
    JavaScript PDF libraries are not used because they cannot shape
    Devanagari, Kannada or Tamil correctly.

### 10.1b Export all

**Export all…** asks for a document folder and a name, then writes
three files in that folder through the daemon. **Choose…** next to the
folder list asks the daemon to show the system folder picker (macOS
`choose folder`, PowerShell's FolderBrowserDialog on Windows, zenity or
kdialog on Linux; not in the container); the chosen folder is added to
the list for the session (§9.4). Export all starts in the folder it last
used.

-   `name.itrans.txt`: the ITRANS input, as in an `.itx` file.
-   `name.uni.txt`: the Unicode output (§10.2).
-   `name.pdf`: the output lines laid out as in §10.1a, without a
    title, with the page size and text size last chosen in Export PDF.

The name may contain subfolders. Existing files are replaced only after
confirmation (and a PDF is not made when its file would be refused).
The current document's name, location and saved state do not change.

The daemon makes the PDF by running a Chromium-based browser installed
on the computer (Chrome, Edge, Chromium or Brave) headless, with a
throwaway profile, on a page that holds the text and the bundled fonts
and loads nothing else (ADR 0004, §18 decision 15). The user may use any
browser for the editor itself. `pdf.browser` names the executable;
otherwise the usual install locations are searched. One PDF is made at a
time, with a 60-second limit. When no browser is found, the text files
are still written and the print dialog opens instead, with `name`
suggested as the PDF file name.

Opening a `.itrans.txt` file reads it as ITRANS input, like `.itx`.

### 10.2 Plain-text export

Exported plain text is the output lines joined by line breaks. It
contains the actual Unicode document, not the transliteration source or
font-specific codes. Plain-text export is always available.

### 10.3 Project file format

``` json
{
  "format": "paramaakshara",
  "format_version": 1,
  "converter_version": "itrans-5.3/1",
  "input_scheme": "itrans",
  "output_script": "devanagari",
  "tamil_convention": "superscript",
  "vedic_tradition": "rigveda",
  "segments": [
    {
      "source": "agnim iiLE purOhitaM",
      "output": "अग्निम् ईळे पुरोहितम्",
      "linked": true
    },
    {
      "source": "yaj~nasya devam",
      "output": "यज्ञस्य देवम्",
      "linked": false,
      "stale": false
    },
    {
      "source": null,
      "output": "…",
      "linked": false
    }
  ]
}
```

-   Segment IDs are not stored; they are regenerated on open.
-   The output of linked segments is stored too, so the file is readable
    without the converter and survives converter changes.
-   On open, if a linked segment's stored output differs from what the
    current converter produces (for example after a mapping fix), the
    stored output is kept, the segment is marked detached and stale,
    and the user is told how many lines are affected. Text never
    changes silently on open.
-   Readers must reject files with a higher `format_version` than they
    support, with a clear message.
-   The schema is validated by the frontend when a file is opened
    (`frontend/src/model/project.ts`). The daemon stores project files as
    opaque UTF-8 text.

### 10.4 Autosave, recovery and backups

-   **Unsaved status** is shown at all times.
-   **Manual save** (Cmd-S) writes the file with the revision check
    (§9.4).
-   **Recovery snapshots:** while the document has unsaved changes, the
    frontend sends the full project JSON to `PUT /api/recovery/{key}`
    every `recovery.interval_seconds`, and when the page is hidden or
    about to unload. `{key}` identifies the document (or an untitled
    document) and stays the same for the browser session.
-   **Recovery on startup:** when the editor starts, each snapshot left
    by a closed or crashed page is offered with Restore, Discard or
    Later. A restored document keeps its folder, path and base revision,
    so saving it still detects changes made on disk in the meantime.
    Snapshots are deleted when the document is saved, and after
    `recovery.retention_days`.
-   **Autosave to file** (`editor.autosave_to_file`, off by default)
    also saves the file itself on the same interval, with the same
    revision check.
-   **Conflicts:** if a save fails with `conflict`, the user chooses
    between Overwrite, Save As, and Reload from disk. Autosave never
    overwrites; it stops and shows the conflict.
-   **Backups:** the previous version is kept before every overwrite
    (§9.4).

------------------------------------------------------------------------

## 11. Clipboard requirements

### 11.1 Input pane

-   Cmd-C copies the selected ITRANS source.
-   Cmd-V pastes plain text into the input pane.
-   Pasted input is processed according to the selected input scheme and
    the segment rules (§4.2).

### 11.2 Output pane

-   Cmd-C copies Unicode text.
-   Cmd-V pastes Unicode text directly, as plain text.
-   Pasted Unicode must not be passed through ITRANS conversion.
-   Vedic combining marks, ZWJ/ZWNJ and other Unicode characters must be
    preserved exactly.
-   Pasting replaces the current selection at the cursor and follows the
    segment rules (§4.3).

Use standard browser clipboard events. The asynchronous Clipboard API is
not needed in version 1.

### 11.3 Clipboard acceptance test

Copy a Vedic passage from an external Unicode website, paste it into the
output pane, save it, close and reopen the document, then compare the
Unicode code points. The text must remain unchanged.

------------------------------------------------------------------------

## 12. Find, replace and text navigation

Initial editor functionality should include:

-   Find text in the output document.
-   Replace one occurrence.
-   Replace all occurrences (one undoable operation).
-   Find in the ITRANS source.
-   Preserve combining marks during search and replacement.
-   Navigate between matches.

Search compares exact code points. Text that looks the same but uses
different code points will not match; this is documented in
`docs/unicode-handling.md`. Replacements in the output pane detach the
segments they change (§4.3).

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
-   Avagraha, virama, separator `{}`, OM, danda.
-   Vedic accents `_`, `'` and `'''` (§5.3), including every rule: position, anusvara order, invalid apostrophe runs, accents without a vowel.
-   Every alternative spelling in §5.2.
-   Ambiguous and incomplete sequences.
-   Invalid sequences (passed through and reported).
-   Whitespace and punctuation.

Expected results must come from a verified reference or reviewed mapping
table.

### 13.2 Vedic tests

Cover, for each supported tradition:

-   Every accent in the documented inventory.
-   Relevant Vedic Extensions.
-   Combining-mark sequences.
-   Multiple marks attached to a base character.
-   Copy/paste preservation.
-   Font fallback and missing glyph behaviour.

### 13.3 Script conversion tests

Cover:

-   Devanagari to Kannada.
-   Devanagari to Tamil (superscript convention).
-   Kannada to Devanagari.
-   Tamil to Devanagari.
-   Mixed-script lines.
-   Script switching after direct edits.
-   Vedic mark preservation.
-   Unsupported-character reporting.
-   Round-trip conversion where reversible.

Round-trip tests must explicitly identify expected lossy conversions. Do
not assume every script conversion is reversible.

### 13.4 Segment model tests

Unit tests for every row of the tables in §4.2 and §4.3, the re-linking
rule, regeneration (line and all), script switching, and undo/redo in
both panes. These run without a browser.

### 13.5 Editing and backend tests

Cover:

-   Direct Unicode typing.
-   Pasting Unicode from websites and external applications.
-   Manual symbol insertion.
-   Cursor movement, deletion and selection around combining marks.
-   Regenerate confirmation.
-   Save and reopen (`.paramaakshara.json` and `.txt`).
-   Save conflict when the file changed on disk.
-   Invalid UTF-8, BOM and CRLF handling.
-   Path traversal and symlink escape attempts.
-   Requests without the session cookie, with a wrong `Host` or with a
    foreign `Origin`.
-   Second launch while running.
-   Autosave recovery after the browser is killed.

### 13.6 Visual tests

Playwright screenshot tests of the Vedic sample corpus in each output
script, in Chromium, Firefox and WebKit on macOS, with the bundled
fonts. Reference screenshots are reviewed by a person before they are
accepted.

### 13.7 Performance targets

Measured on a documented reference machine (for example an Apple M1 with
current Chrome):

-   Converting one edited line: under 1 ms.
-   Keystroke to updated output on screen: under 50 ms with a
    50,000-character document.
-   Script switch of a 50,000-character document: under 200 ms.
-   Opening a 50,000-character document: under 500 ms.
-   No text loss during rapid typing or large paste operations.

------------------------------------------------------------------------

## 14. Acceptance criteria for version 1

The first public release is acceptable when all of the following are
true.

### Dual-pane editor

-   [ ] Two independently usable text panes are displayed.
-   [ ] ITRANS can be typed in the input pane.
-   [ ] The output updates in real time for supported sequences.
-   [ ] The output pane is fully editable.
-   [ ] A manual edit to one output line detaches only that line; other
    lines keep following the source.
-   [ ] Manual output edits are never silently overwritten or deleted by
    source changes.
-   [ ] Regenerate line and Regenerate all are available, with
    confirmation.

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

-   [ ] The initial verified symbol inventory is documented per
    tradition.
-   [ ] `_`, `'` and `'''` produce anudātta, svarita and double svarita in ITRANS input.
-   [ ] The symbol palette inserts supported characters.
-   [ ] Unicode code points are preserved.
-   [ ] Supported font/browser combinations render the test corpus
    correctly (§13.6).
-   [ ] Missing glyphs or unsupported conversions are reported.

### Documents

-   [ ] `.paramaakshara.json` save and open preserve source, output and segment
    state.
-   [ ] UTF-8 plain-text save and open work.
-   [ ] Unsaved changes are indicated.
-   [ ] Undo and redo work in both panes as described in §4.7.
-   [ ] A save over a file changed on disk is detected and not applied
    silently.
-   [ ] A document can be recovered after the browser or daemon is
    killed.

### Security and distribution

-   [ ] The daemon listens on loopback only.
-   [ ] API requests without a valid session, with a wrong `Host` or
    with a foreign `Origin` are rejected.
-   [ ] File operations are restricted to configured folders.
-   [ ] A second launch reuses the running instance.
-   [ ] The application works without a network connection.
-   [ ] Third-party dependencies and licences are listed in
    `THIRD_PARTY_NOTICES.md`.

------------------------------------------------------------------------

## 15. Development roadmap

### Phase 1 --- Editor foundation

Deliver:

-   CodeMirror 6 spike (§8.1); confirm or switch.
-   Go daemon: embedded assets, configuration, session security,
    single instance, logging.
-   Dual-pane interface with the segment model (§4), using a placeholder
    converter that copies the source unchanged.
-   Editable Unicode output pane, clipboard support.
-   `.paramaakshara.json` and `.txt` open/save with revisions, backups and
    recovery.
-   Undo/redo in both panes.

**Exit condition:** A useful Unicode editor exists, and the segment
rules are proven with the placeholder converter.

### Phase 2 --- ITRANS

Deliver:

-   Verified ITRANS 5.3 mapping set and the Vedic accent input (§5.3).
-   Evaluation of `@indic-transliteration/sanscript` against the corpus;
    adopt it or implement the table-driven fallback.
-   Live transliteration.
-   Automated test corpus.

**Exit condition:** Common Sanskrit ITRANS input converts reliably to
Devanagari.

### Phase 3 --- Vedic support

Deliver:

-   Verified Vedic character catalogue per tradition.
-   Symbol palette.
-   Font/rendering test matrix and screenshot tests.
-   Vedic sample corpus.
-   Configurable keyboard mapping framework.

**Exit condition:** Required Vedic marks can be inserted, saved,
reopened and rendered correctly in the documented environment.

### Phase 4 --- Kannada and Tamil

Deliver:

-   Script conversion integration.
-   Script selector and script switching (§4.6).
-   Tamil superscript convention.
-   Loss/ambiguity reporting.
-   Vedic mark preservation tests.

**Exit condition:** Users can switch scripts within the documented
supported conversion scope without silent data loss.

### Phase 5 --- Public release

Deliver:

-   macOS packaging (signed and notarized binary; launch item that opens
    the browser).
-   Linux support where practical.
-   Installation and developer documentation.
-   Contribution guidelines.
-   Licence and third-party notices.
-   Release builds and test automation.

**Exit condition:** A contributor can build the application from a clean
checkout using documented instructions.

------------------------------------------------------------------------

## 16. Dependencies

The aim is a small, auditable dependency set. Every addition must be
justified in an ADR and listed in `THIRD_PARTY_NOTICES.md`. Licences
marked "verify" must be confirmed from the project's current `LICENSE`
file before the first release.

### 16.1 What the end user needs

-   One `paramaakshara` binary with the frontend embedded.
-   A current Chrome, Firefox or Safari.
-   Nothing else: no Node.js, no Python, no network access.

### 16.2 Go (backend)

**Go 1.25 or later** (required for `os.Root`, including `Rename` and
`MkdirAll` inside a root).

Standard library packages used:

  Package                          Use
  -------------------------------- ------------------------------------------
  `net/http`                       Server; method-based routing in `ServeMux`
  `embed`, `io/fs`                 Embedded frontend assets
  `encoding/json`                  API, config and project files
  `os` (`os.Root`), `path/filepath` Confined file access
  `crypto/rand`, `crypto/subtle`   Session token generation and comparison
  `crypto/sha256`                  Document revisions
  `unicode/utf8`                   UTF-8 validation
  `log`                            Logging (§9.8)
  `flag`                           Command-line flags
  `os/exec`                        Opening the browser (no shell)
  `os/signal`, `context`           Graceful shutdown
  `testing`, `net/http/httptest`   Tests

Third-party:

  Module                              Licence   Use
  ----------------------------------- --------- ------------------------
  `gopkg.in/natefinch/lumberjack.v2`  MIT       Log file rotation

Not used: web frameworks, `logrus`/`zap`/`zerolog`, CGO.
`golang.org/x/text` is not needed because the backend does not normalize
text.

### 16.3 Frontend runtime libraries

  Package                              Licence        Use
  ------------------------------------ -------------- ------------------------
  `@codemirror/state`                  MIT            Editor state, segment
                                                      tracking
  `@codemirror/view`                   MIT            Editor view, gutters,
                                                      decorations
  `@codemirror/commands`               MIT            Default keymap, history
                                                      (undo/redo)
  `@codemirror/search`                 MIT            Find and replace

Not used: UI frameworks (React, Vue and similar), CDNs, analytics.

### 16.4 Build, test and development tools

Not shipped to users.

  Tool                    Licence      Use
  ----------------------- ------------ ----------------------------------
  Node.js (current LTS)   MIT          Build only
  TypeScript              Apache-2.0   Language
  Vite                    MIT          Frontend build and dev server
                                       (proxies `/api` to the daemon)
  Vitest                  MIT          Unit tests (conversion, segment
                                       model)
  Playwright              Apache-2.0   End-to-end and screenshot tests in
                                       Chromium, Firefox and WebKit
  ESLint, Prettier        MIT          Lint and format
  `gofmt`, `go vet`       BSD-3        Go format and checks
  `staticcheck`           MIT          Go lint

Exact versions are pinned in `go.mod`/`go.sum` and
`package-lock.json`.

### 16.5 Fonts

  Font                                       Licence           Plan
  ------------------------------------------ ----------------- -------------------------
  Noto Serif / Sans Devanagari               OFL-1.1           Bundle; required. The
                                                               macOS Devanagari fonts
                                                               lack U+1CDA (ADR 0002)
  Noto Serif / Sans Kannada                  OFL-1.1           Bundle
  Noto Serif / Sans Tamil                    OFL-1.1           Bundle
  Fonts with stronger Vedic coverage         verify for each   Evaluate in Phase 3;
  (for example Shobhika, Siddhanta)                            bundle only if the licence
                                                               allows, otherwise support
                                                               as user-installed

### 16.6 Used only as references

Aksharamukha (AGPL-3.0, verify), Lipika IME (GPL-3.0, verify) and
Samsaadhanii may be consulted, or run offline to cross-check test
expectations. Code or data from them is copied into the project only if
its licence is compatible with GPL-3.0 (§17.2), with attribution in
`THIRD_PARTY_NOTICES.md`.

------------------------------------------------------------------------

## 17. Open-source project management

### 17.1 Repository name and description

Suggested repository:

`paramaakshara`

Suggested GitHub description:

> An open-source Unicode Sanskrit and Vedic text editor with live ITRANS
> transliteration, editable dual-pane workflow, Vedic symbols and
> multi-script support.

### 17.2 Licence

Paramaakshara is licensed under the **GNU General Public License,
version 3 (GPL-3.0)**. The full text is in `LICENSE`.

Consequences:

-   Anyone who distributes Paramaakshara, modified or not, must make the
    corresponding source available under GPL-3.0.
-   Dependencies must have GPL-3.0-compatible licences. MIT, BSD and
    Apache-2.0 are compatible, so everything in §16 is fine. GPL-2.0-only
    code is **not** compatible and must not be used.
-   GPL-3.0 code and data (for example Lipika's mapping tables) may be
    reused, with attribution.
-   AGPL-3.0 code (Aksharamukha) may legally be combined with GPL-3.0
    code, but the AGPL parts keep their extra network-use terms. Avoid
    linking it; use it only as an offline test oracle.
-   Bundled fonts keep their own licences (OFL-1.1 for Noto). They are
    distributed alongside the program, not relicensed.
-   Each Go and TypeScript source file carries the SPDX header
    `SPDX-License-Identifier: GPL-3.0-or-later`.

Also:

-   Review the licence of every transliteration library, font and
    imported mapping table before use.
-   Preserve attribution and licence notices in
    `THIRD_PARTY_NOTICES.md`.
-   Do not copy proprietary Baraha implementation code or undocumented
    assets.

### 17.3 Contribution areas

The project should make it straightforward to contribute:

-   ITRANS mappings.
-   Vedic character definitions per tradition.
-   Verified Vedic test cases.
-   Script conversion rules.
-   Font/rendering test results.
-   New input schemes.
-   Additional scripts.
-   Documentation and examples.

Prefer data-driven mappings and independently testable conversion
modules.

### 17.4 Continuous integration

A GitHub Actions workflow should:

-   Run Go tests.
-   Run frontend unit tests.
-   Run Playwright tests, including screenshot tests on macOS.
-   Run formatting and lint checks.
-   Validate mapping data.
-   Run Unicode preservation tests.
-   Check that every dependency is listed in `THIRD_PARTY_NOTICES.md`.
-   Build supported platform binaries.

------------------------------------------------------------------------

## 18. Technical decisions

Each decision is recorded as an ADR in `docs/adr/` when it is made or
changed.

  \#   Decision                Status        Outcome
  ---- ----------------------- ------------- ------------------------------------
  1    Transliteration engine  Decided       Project-owned table-driven
                                             converter (ADR 0003,
                                             `docs/itrans-mappings.md`).
  2    Where conversion runs   Decided       Frontend (TypeScript). The daemon
                                             does no conversion.
  3    Editor component        Decided       CodeMirror 6 (§8.1, ADR 0001).
  4    Canonical script        Decided       None. Stored text is shown text;
                                             script switching rewrites the
                                             output explicitly (§2.4, §4.6).
  5    Tamil convention        Decided       Superscript numerals at the end of
                                             the syllable; ृ/ऋ approximate and
                                             reported (`docs/script-
                                             conversion.md`). Anusvara is
                                             written ம் (reads back as म्).
  6    Vedic inventory         Partly        Ṛgveda and Taittirīya accents
                               decided       verified from sample texts
                                             (`docs/vedic-symbols.md`); other
                                             traditions need verified samples.
  7    Vedic keystrokes        Decided       `_` anudātta, `'` svarita, `'''`
                               for v1        double svarita (§5.3). Further
                                             mappings are data-driven. Baraha
                                             compatibility is open.
  8    Project file format     Decided       JSON `.paramaakshara.json` (§10.3).
  9    Font distribution       Decided       Bundle Noto Devanagari (OFL) as the
                               for           default; it is the only tested font
                               Devanagari    that renders U+1CDA. Kannada/Tamil
                                             and others per §16.5 (ADR 0002).
  10   Legacy Baraha import    Open          After v1; needs real sample files.
  11   Application shell       Decided       Browser + Go daemon for v1.
                               for v1        Revisit a webview shell (for example
                                             Wails) if file-dialog or
                                             shortcut limits hurt users.
  12   Editing model           Decided       Line segments with per-line
                                             detaching (§4). An input-method
                                             model (ITRANS typed into a
                                             composition box and inserted at the
                                             output cursor) was considered and
                                             rejected because it does not keep
                                             the source.
  13   HTTP port               Decided       Fixed default `7531`, configurable;
                                             no silent fallback (§9.6, §9.7).
  14   Licence                 Decided       GPL-3.0 (§17.2).
  15   PDFs written to a       Decided       The daemon runs an installed
       folder                                Chromium-based browser headless
                                             (§10.1b, ADR 0004); the print
                                             dialog remains for Export PDF and
                                             as the fallback.
  16   Folders outside         Decided       Chosen in the system folder picker
       the configured roots                  shown by the daemon, kept for the
                                             session under an opaque name; the
                                             browser never sends paths (§9.4).

------------------------------------------------------------------------

## 19. Recommended implementation order

Do not start by attempting to reproduce all of Baraha's transliteration
behaviour.

The recommended sequence is:

1.  Build the daemon, session security and configuration.
2.  Build the dual-pane editor with the segment model and a placeholder
    converter.
3.  Make the output pane a reliable Unicode editor.
4.  Verify copy/paste of Vedic Unicode from external sources.
5.  Implement save/open, recovery and undo/redo.
6.  Add ITRANS conversion.
7.  Add the Vedic symbol catalogue and insertion palette.
8.  Add Kannada and Tamil conversion.
9.  Add configurable Vedic keyboard mappings.
10. Improve compatibility and add more scripts.

This order produces useful software early and avoids making the editor
dependent on an unfinished transliteration engine.

------------------------------------------------------------------------

## 20. Reference resources

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

-   Sanscript (indic-transliteration):
    https://github.com/indic-transliteration/sanscript.js
-   Aksharamukha: https://github.com/virtualvinodh/aksharamukha
-   Lipika IME: https://github.com/ratreya/lipika-ime
-   Samsaadhanii: https://sanskrit.uohyd.ac.in/manual/transliterate/
-   Sanskrit Documents tools:
    https://sanskritdocuments.org/processing_tools/

### Editor and backend technology

-   CodeMirror: https://codemirror.net/
-   Go: https://go.dev/
-   Go HTTP package: https://pkg.go.dev/net/http
-   Go `os.Root`: https://pkg.go.dev/os#Root
-   lumberjack: https://github.com/natefinch/lumberjack
-   Vite: https://vite.dev/
-   Playwright: https://playwright.dev/

------------------------------------------------------------------------

## 21. Summary

Paramaakshara is fundamentally a Unicode document editor with an
ITRANS-assisted input pane.

The most important product decision is that the output pane is an
independent, fully editable document. Transliteration is an input
convenience, not the source of truth. Manual corrections detach only the
lines they touch, so the user can keep typing ITRANS while correcting
the output.

The project should prioritise:

1.  Correct Unicode preservation.
2.  Reliable editing and clipboard behaviour.
3.  Deterministic ITRANS conversion.
4.  Correct Vedic accent representation and rendering, per tradition.
5.  Script conversion with explicit handling of limitations.

A small, correct editor is more valuable than a large feature set that
silently changes Vedic text.
