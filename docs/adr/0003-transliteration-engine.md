# ADR 0003: Transliteration engine

-   **Status:** Accepted (2026-11-09).
-   **Spec:** TECH_SPEC §5.6, §18 decision 1.

## Context

The spec made `@indic-transliteration/sanscript` the provisional engine,
with a project-owned, table-driven converter as the fallback. The engine
must support the project's accent input (`_`, `'`, `'''`), its accent
rules (position, sign order, error reporting), and report sequences it
cannot convert so the editor can mark them (§4.4).

## Evaluation

`@indic-transliteration/sanscript` 1.3.3 (MIT), run on the same cases as
our unit tests:

-   Plain ITRANS (vowels, consonants, conjuncts, anusvara, visarga,
    chandrabindu, avagraha, OM, dandas, digits): correct.
-   `{}` inserts a zero-width joiner (क‍इ, क्‍ह). That would put hidden
    characters into the user's text.
-   Accents only as ITRANS `\'` and `\_`; nothing for `'''`; no accent
    position, sign order or error rules.
-   Unknown input passes through silently; there is no way to report it.

The project's own converter (`frontend/src/conversion/itrans.ts`,
about 250 lines plus tables) passes:

-   Hand-written unit tests for every row of `docs/itrans-mappings.md`
    and every accent rule.
-   All 90 lines of the two Baraha samples (Ṛgveda and Taittirīya):
    Baraha source rewritten in our notation converts to Baraha's own
    Unicode output, apart from the documented Clean up text differences
    and the open `(gg)` accent question.

## Decision

Use the project's own table-driven converter. Do not add sanscript.

## Consequences

-   No new runtime dependency.
-   The mapping tables are owned and documented in
    `docs/itrans-mappings.md`.
-   A sanskritdocuments.org corpus is still to be added to the tests
    (the site refuses automated downloads; the files have to be saved by
    hand).
