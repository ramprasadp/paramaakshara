// SPDX-License-Identifier: GPL-3.0-or-later

// Test-only: rewrites Baraha source in Paramaakshara's ITRANS notation,
// using the legend in testdata/vedic/baraha/README.md, which was derived
// from the Baraha source/Unicode pairs. Not part of the application.

const MAP: [string, string][] = [
  ["~M", ".N"],
  ["~g", "~N"],
  ["~j", "~n"],
  ["RU", "R^I"],
  ["Ru", "R^i"],
  ["Sh", "Sh"],
  ["sh", "sh"],
  ["S", "sh"],
  ["Ch", "Ch"],
  ["ch", "ch"],
  ["C", "Ch"],
  ["c", "ch"],
  ["B", "bh"],
  ["G", "gh"],
  ["E", "e"],
  ["O", "o"],
  ["q", "_"],
  ["#", "'"],
  ["$", "'''"],
  [":", "H"],
  ["&", ".a"],
];

export function barahaToItrans(line: string): string {
  let out = "";
  let i = 0;
  outer: while (i < line.length) {
    for (const [from, to] of MAP) {
      if (line.startsWith(from, i)) {
        out += to;
        i += from.length;
        continue outer;
      }
    }
    out += line[i];
    i++;
  }
  return out;
}
