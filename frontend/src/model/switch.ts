// SPDX-License-Identifier: GPL-3.0-or-later

// Changing the output script (TECH_SPEC §4.6). Linked lines are
// regenerated from their ITRANS, which loses nothing; manually edited and
// output-only lines are converted, and anything not represented exactly
// is reported. The ITRANS source is not touched.

import { convertScript, type Script } from "../conversion/script";
import type { Context, Segment } from "./segments";

export interface LineIssues {
  /** 1-based output line. */
  line: number;
  messages: string[];
}

export interface SwitchResult {
  segments: Segment[];
  issues: LineIssues[];
}

/** ctx must already convert ITRANS into the target script. */
export function switchScript(
  segs: readonly Segment[],
  target: Script,
  ctx: Context,
): SwitchResult {
  const issues: LineIssues[] = [];
  const segments = segs.map((s, i): Segment => {
    if (s.linked) return { ...s, output: ctx.convert(s.source!) };
    const r = convertScript(s.output, target);
    if (r.issues.length > 0)
      issues.push({
        line: i + 1,
        messages: [...new Set(r.issues.map((x) => x.message))],
      });
    const next = { ...s, output: r.text };
    // A detached line whose converted output now equals its converted
    // source becomes linked again (§4.3).
    if (
      next.source !== null &&
      !next.source.includes("\n") &&
      ctx.convert(next.source) === next.output
    ) {
      return { ...next, linked: true, stale: false };
    }
    return next;
  });
  return { segments, issues };
}
