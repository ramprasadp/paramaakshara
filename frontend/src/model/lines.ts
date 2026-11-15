// SPDX-License-Identifier: GPL-3.0-or-later

// The document model (TECH_SPEC §4.1, ADR 0006): output line n is the
// conversion of input line n. Pure; no editor or DOM.

/** The output for an ITRANS text, converted line by line. */
export function outputOf(
  source: string,
  convert: (line: string) => string,
): string {
  return source.split("\n").map(convert).join("\n");
}
