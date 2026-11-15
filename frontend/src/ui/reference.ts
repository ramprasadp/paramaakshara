// SPDX-License-Identifier: GPL-3.0-or-later

// The ITRANS reference sheet: how to type the letters, signs and accents
// that are hard to guess (docs/itrans-mappings.md). The output column is
// converted live, so it always matches the converter and the output
// script.

import { el, show } from "./dialog";

interface Entry {
  itrans: string;
  note: string;
}

const ENTRIES: Entry[] = [
  { itrans: ".a", note: "avagraha" },
  { itrans: "OM", note: "om; after a consonant it is O and anusvara" },
  { itrans: "~g", note: "ṅ; ~ga for ṅa; also ~N" },
  { itrans: "j~ja", note: "jña; also j~na, GY, dny" },
  { itrans: "kSha", note: "kṣa; also xa" },
  { itrans: "kaa'", note: "svarita U+0951, after the vowel" },
  { itrans: "kaa_", note: "anudātta U+0952" },
  { itrans: "kaa'''", note: "double svarita U+1CDA" },
  { itrans: "ra(gm)", note: "Taittirīya anusvara U+A8F3; (gg) for U+A8F4" },
];

/** Shows the reference sheet; convert turns ITRANS into the output. */
export async function referenceSheet(
  convert: (itrans: string) => string,
): Promise<void> {
  const rows = ENTRIES.map((e) =>
    el(
      "tr",
      {},
      el("td", {}, el("code", {}, e.itrans)),
      el("td", { className: "reference-output" }, convert(e.itrans)),
      el("td", { className: "muted" }, e.note),
    ),
  );
  const table = el(
    "table",
    { className: "reference" },
    el(
      "thead",
      {},
      el("tr", {}, el("th", {}, "Type"), el("th", {}, "Gives"), el("th")),
    ),
    el("tbody", {}, ...rows),
  );
  await show(
    "ITRANS reference",
    [
      table,
      "An anusvara, visarga or chandrabindu comes before the accent: bhUmiM'.",
    ],
    [{ label: "Close", value: null, primary: true }],
  );
}
