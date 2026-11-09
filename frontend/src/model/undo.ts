// SPDX-License-Identifier: GPL-3.0-or-later

// Undo and redo per pane (TECH_SPEC §4.7). Each pane's history replays
// segment patches. A patch from one pane restores that pane's side of a
// segment and keeps the other side as it is now, so undo in one pane
// never silently reverts later edits made in the other.

import { apply, type Patch } from "./patch";
import type { Context, Segment } from "./segments";

export type Pane = "source" | "output";

/** Applies a patch recorded in pane, or returns null if it no longer fits. */
export function applyPanePatch(
  segs: readonly Segment[],
  p: Patch,
  pane: Pane,
  ctx: Context,
): Segment[] | null {
  return apply(
    segs,
    p,
    (patched, current) => relink(merge(pane, patched, current, ctx), ctx),
    // Undo in the input pane can remove a line that was typed and then
    // edited by hand in the output; the manual output is kept (§2.3).
    (removed) =>
      pane === "source" && removed.source !== null && !removed.linked
        ? { ...removed, source: null, linked: false, stale: false }
        : null,
  );
}

function merge(
  pane: Pane,
  patched: Segment,
  current: Segment,
  ctx: Context,
): Segment {
  if (pane === "output") {
    // Restore the output; keep the current source.
    const source = current.source;
    if (source === null)
      return { ...patched, source: null, linked: false, stale: false };
    const changed = source !== patched.source;
    if (patched.linked && !changed) return { ...patched, source };
    return {
      ...patched,
      source,
      linked: false,
      stale: patched.linked ? changed : patched.stale || changed,
    };
  }
  // Restore the source; keep the current output unless it is generated.
  if (patched.source === null) return { ...patched, output: current.output };
  if (current.linked) {
    return {
      ...patched,
      output: ctx.convert(patched.source),
      linked: true,
      stale: false,
    };
  }
  const changed = patched.source !== current.source;
  return {
    ...patched,
    output: current.output,
    linked: false,
    stale: current.stale || changed,
  };
}

function relink(s: Segment, ctx: Context): Segment {
  if (
    s.source !== null &&
    !s.linked &&
    !s.source.includes("\n") &&
    ctx.convert(s.source) === s.output
  ) {
    return { ...s, linked: true, stale: false };
  }
  return s;
}
