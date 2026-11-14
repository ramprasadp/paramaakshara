# Legacy (non-Unicode) fonts

Many Sanskrit and Vedic PDFs were typeset with 8-bit Indic fonts such as
Shree-Lipi (`SHREE-SAN-0962`), Baraha BRH or Sanskrit 99. Each byte is
an ordinary Latin character that the font draws as a Devanagari glyph.
These PDFs usually have no `/ToUnicode` map, so copying from them gives
Latin text such as `íT"] X"p…` instead of Devanagari.

Converting such text means mapping each font's byte sequences to
Unicode. The fonts change mid-word (a conjunct or an accent can come
from a companion font such as `SHREE-SAN-0964E`), so the conversion
needs the font of each byte, which plain text copied from a PDF viewer
does not carry. The input is therefore the PDF itself.

## `legacyfont`

`cmd/legacyfont` shows what a PDF actually draws. It uses
`internal/pdfread`, a minimal standard-library PDF reader (Flate only,
no encryption).

```sh
go run ./cmd/legacyfont fonts file.pdf                 # fonts and byte counts
go run ./cmd/legacyfont dump -pages 22 file.pdf        # each line as font runs
go run ./cmd/legacyfont codes -font SHREE-SAN-0962 file.pdf
go run ./cmd/legacyfont convert -pages 22 file.pdf     # Unicode, with the tables so far
```

-   `dump` prints each line as runs of one font. A run shows its bytes
    read as Windows-1252 and, below, in hex. `(gap)` marks a horizontal
    gap that is wider than a quarter of the font size.
-   `codes` lists every code used in each font, with its advance width,
    a count and the first word it appears in. Width-5 glyphs are
    zero-width marks (accents, vowel signs, virama, anusvara). Use it to
    check that a mapping table covers a document.
-   `convert` writes each line as Unicode. A code without a table entry
    appears as `‹XX›` and is counted on stderr; fonts without a table
    are written as Windows-1252.

## Mapping tables

Tables are JSON files in `internal/legacyfont/tables/`, one per font.
Each entry maps a code sequence (longest match wins) to Unicode and has
a kind that decides reordering from the font's visual order:

  Kind          Meaning                                      Reordering
  ------------- -------------------------------------------- ------------------------------
  `consonant`   full consonant or conjunct                   ends a cluster
  `half`        half form (consonant + virama)               part of the next cluster
  `stem`        stem glyph that completes a half form        makes the half form full
  `pre`         i sign drawn before its cluster              after the cluster's consonant
  `reph`        र् drawn after its cluster                    before the cluster
  `sign`        vowel sign or virama                         before accents
  `subjoined`   ra, ya or na below a consonant               with its cluster, before a pre sign
  `modifier`    anusvara, visarga, candrabindu               before accents (ADR 0002)
  `accent`      Vedic accent                                 after a space: onto the syllable before it
  `vowel`, `space`, `punct`                                  none
  `none`        piece of a glyph drawn in parts (no text)    dropped

In Shree-Lipi, many consonants are a half form plus a stem glyph (`22`,
or `70` for ga, Na and sha); the table lists the pair as the full
consonant, and the half form alone separately.

A glyph that stands for two kinds at once (the reph with an anusvara)
lists `units` instead of `kind` and `text`. The `stem` kind completes the
half form before it even when accents were drawn in between, and
`compose` joins two signs drawn separately (aa + e = o), also across an
accent.

A table lists under `also` other fonts that share its encoding: the
Shree-Lipi heading fonts `SHREE-SAN-0964` and `SHREE-SAN-0960` (and the
companions `0962E`, `0964E`) differ from `SHREE-SAN-0962` only in
typeface. Fonts without a table are written as Windows-1252, which is
right for the Latin fonts (`SHREE-ENG-0010`, Arial).

`pdfread.Lines` drops a glyph drawn again over an identical one (bold
imitated by overprinting, as on the title page) and treats a gap wider
than 0.15 of the font size as a word break, since headings are often
placed word by word without space characters.

Tables so far: `SHREE-SAN-0962` (also the heading fonts, checked with a
sheet of 72 heading words) and `SHREE-KAN-0852` (the rupee sign),
covering pages 7, 122, 140, 141 and 276, lines 2-12
of page 22 and one word for each remaining code of mantrastotra.pdf (the
tests in `internal/legacyfont`). `legacyfont find -code XX` lists the
words containing a code, with their position on the page, for picking
such words.

## Building a mapping table

Tables are data, as with the other conversions (AGENTS.md), and the
expected Unicode comes from a verified reading of the page, not from
memory or from the code under test:

1.  Dump a page and pair each line's bytes with the Unicode text a
    person has checked against the rendered page.
2.  Derive byte-sequence → Unicode entries per font, including
    reordering (for example the short-i sign stored before its
    consonant) and accent order (ADR 0002).
3.  Keep the verified page pairs as test data for the table.

Converting in the app (an import command with a preview) is planned
once tables have been verified; it will need a spec update.
