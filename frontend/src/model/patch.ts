// SPDX-License-Identifier: GPL-3.0-or-later

// Undoable changes to the segment list. An edit replaces a contiguous run
// of segments; the patch records that run before and after, located by
// segment ids so it still applies after unrelated edits elsewhere.

import type { Segment } from "./segments";

export interface Patch {
  /** Id of the segment just before the run, or null at the start. */
  readonly prevId: string | null;
  readonly before: readonly Segment[];
  readonly after: readonly Segment[];
}

/** The patch turning old into next (segments compared by identity). */
export function diff(
  old: readonly Segment[],
  next: readonly Segment[],
): Patch | null {
  let p = 0;
  while (p < old.length && p < next.length && old[p] === next[p]) p++;
  let s = 0;
  while (
    s < old.length - p &&
    s < next.length - p &&
    old[old.length - 1 - s] === next[next.length - 1 - s]
  )
    s++;
  const before = old.slice(p, old.length - s);
  const after = next.slice(p, next.length - s);
  if (before.length === 0 && after.length === 0) return null;
  return { prevId: p > 0 ? old[p - 1]!.id : null, before, after };
}

export function invert(p: Patch): Patch {
  return { prevId: p.prevId, before: p.after, after: p.before };
}

/**
 * Applies p to segs. Returns null if the run p.before is no longer where
 * the patch expects it (the caller then falls back to the text edit).
 *
 * merge, if given, is called for each segment of p.after whose current
 * version (same id) differs from the version recorded in p.before, i.e.
 * a segment edited since the patch was made. It lets a patch restore one
 * pane's side of a segment while keeping later edits from the other.
 *
 * keep, if given, is called for each current segment that the patch
 * removes; a non-null result is kept after the patched run.
 */
export function apply(
  segs: readonly Segment[],
  p: Patch,
  merge?: (patched: Segment, current: Segment) => Segment,
  keep?: (removed: Segment) => Segment | null,
): Segment[] | null {
  let start: number;
  if (p.before.length > 0) {
    start = segs.findIndex((s) => s.id === p.before[0]!.id);
    if (start < 0 || start + p.before.length > segs.length) return null;
    for (let i = 0; i < p.before.length; i++) {
      if (segs[start + i]!.id !== p.before[i]!.id) return null;
    }
  } else if (p.prevId === null) {
    start = 0;
  } else {
    const prev = segs.findIndex((s) => s.id === p.prevId);
    if (prev < 0) return null;
    start = prev + 1;
  }
  const recorded = new Map(p.before.map((s) => [s.id, s]));
  const current = new Map(
    segs.slice(start, start + p.before.length).map((s) => [s.id, s]),
  );
  const after = p.after.map((s) => {
    const cur = current.get(s.id);
    return merge && cur && !same(cur, recorded.get(s.id)!) ? merge(s, cur) : s;
  });
  const afterIds = new Set(p.after.map((s) => s.id));
  const kept = keep
    ? [...current.values()].flatMap((s) => {
        if (afterIds.has(s.id)) return [];
        const k = keep(s);
        return k ? [k] : [];
      })
    : [];
  return [
    ...segs.slice(0, start),
    ...after,
    ...kept,
    ...segs.slice(start + p.before.length),
  ];
}

function same(a: Segment, b: Segment): boolean {
  return (
    a.source === b.source &&
    a.output === b.output &&
    a.linked === b.linked &&
    a.stale === b.stale
  );
}
