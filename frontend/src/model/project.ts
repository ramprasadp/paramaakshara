// SPDX-License-Identifier: GPL-3.0-or-later

// File formats (TECH_SPEC §10): the project file keeps source, output and
// segment state; plain text keeps only the output; ITRANS text only the
// source.

import {
  fromOutput,
  fromSource,
  outputText,
  sourceText,
  type Context,
  type Segment,
} from "./segments";

export const FORMAT_VERSION = 1;

export type FileKind = "project" | "text" | "itrans";

export function fileKind(path: string): FileKind {
  const p = path.toLowerCase();
  if (p.endsWith(".paramaakshara.json")) return "project";
  if (p.endsWith(".itx")) return "itrans";
  return "text";
}

export interface Settings {
  input_scheme: string;
  output_script: string;
  tamil_convention: string;
  vedic_tradition: string;
}

export interface ProjectFile extends Settings {
  format: "paramaakshara";
  format_version: number;
  converter_version: string;
  segments: {
    source: string | null;
    output: string;
    linked: boolean;
    stale?: boolean;
  }[];
}

export class FormatError extends Error {}

/** Serialises a document as a project file (two-space JSON, final newline). */
export function toProject(
  segs: readonly Segment[],
  settings: Settings,
  converterVersion: string,
): string {
  const file: ProjectFile = {
    format: "paramaakshara",
    format_version: FORMAT_VERSION,
    converter_version: converterVersion,
    ...settings,
    segments: segs.map((s) =>
      s.source !== null && !s.linked
        ? { source: s.source, output: s.output, linked: false, stale: s.stale }
        : { source: s.source, output: s.output, linked: s.linked },
    ),
  };
  return JSON.stringify(file, null, 2) + "\n";
}

export interface Loaded {
  segments: Segment[];
  settings: Settings | null;
  /** Linked lines whose stored output differs from the current converter. */
  changedByConverter: number;
}

/**
 * Reads a project file. Stored text is never changed: a linked line whose
 * output the current converter would produce differently keeps its stored
 * output and becomes detached and stale (§10.3).
 */
export function fromProject(json: string, ctx: Context): Loaded {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new FormatError("The file is not valid JSON.");
  }
  const f = data as Partial<ProjectFile>;
  if (typeof f !== "object" || f === null || f.format !== "paramaakshara") {
    throw new FormatError("This is not a Paramaakshara project file.");
  }
  if (
    typeof f.format_version !== "number" ||
    f.format_version > FORMAT_VERSION
  ) {
    throw new FormatError(
      `This file was saved by a newer version of Paramaakshara (format ${String(f.format_version)}); ` +
        `this version reads format ${FORMAT_VERSION}.`,
    );
  }
  if (!Array.isArray(f.segments))
    throw new FormatError("The project file has no segments.");
  let changedByConverter = 0;
  const segments = f.segments.map((raw, i): Segment => {
    const s = raw as Partial<ProjectFile["segments"][number]>;
    const where = `segment ${i + 1}`;
    if (typeof s.output !== "string" || s.output.includes("\n"))
      throw new FormatError(`${where}: invalid output.`);
    if (s.source !== null && typeof s.source !== "string")
      throw new FormatError(`${where}: invalid source.`);
    if (typeof s.linked !== "boolean")
      throw new FormatError(`${where}: invalid linked flag.`);
    const id = ctx.newId();
    if (s.source === null)
      return {
        id,
        source: null,
        output: s.output,
        linked: false,
        stale: false,
      };
    if (s.linked) {
      if (s.source.includes("\n"))
        throw new FormatError(
          `${where}: a linked segment has one source line.`,
        );
      if (ctx.convert(s.source) !== s.output) {
        changedByConverter++;
        return {
          id,
          source: s.source,
          output: s.output,
          linked: false,
          stale: true,
        };
      }
      return {
        id,
        source: s.source,
        output: s.output,
        linked: true,
        stale: false,
      };
    }
    return {
      id,
      source: s.source,
      output: s.output,
      linked: false,
      stale: s.stale === true,
    };
  });
  const settings =
    typeof f.input_scheme === "string" && typeof f.output_script === "string"
      ? {
          input_scheme: f.input_scheme,
          output_script: f.output_script,
          tamil_convention: String(f.tamil_convention ?? ""),
          vedic_tradition: String(f.vedic_tradition ?? ""),
        }
      : null;
  return { segments, settings, changedByConverter };
}

/** Content to save for a file of the given kind. */
export function serialise(
  kind: FileKind,
  segs: readonly Segment[],
  settings: Settings,
  converterVersion: string,
): string {
  switch (kind) {
    case "project":
      return toProject(segs, settings, converterVersion);
    case "itrans":
      return sourceText(segs);
    case "text":
      return outputText(segs);
  }
}

/** Reads file content of the given kind. */
export function load(kind: FileKind, content: string, ctx: Context): Loaded {
  switch (kind) {
    case "project":
      return fromProject(content, ctx);
    case "itrans":
      return {
        segments: fromSource(content, ctx),
        settings: null,
        changedByConverter: 0,
      };
    case "text":
      return {
        segments: content === "" ? [] : fromOutput(content, ctx),
        settings: null,
        changedByConverter: 0,
      };
  }
}

/** What saving segs as kind would leave out, or null if nothing. */
export function lostOnSave(
  kind: FileKind,
  segs: readonly Segment[],
): string | null {
  if (
    kind === "text" &&
    segs.some((s) => s.source !== null && s.source !== "")
  ) {
    return "Plain text keeps only the Unicode output; the ITRANS input is not saved.";
  }
  if (kind === "itrans" && segs.some((s) => !s.linked && s.output !== "")) {
    return "An ITRANS file keeps only the input; manually edited and output-only lines are not saved.";
  }
  return null;
}
