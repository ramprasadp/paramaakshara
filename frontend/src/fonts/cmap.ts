// SPDX-License-Identifier: GPL-3.0-or-later

// Reads the character map of a TrueType/OpenType font, so the palette can
// mark symbols the font has no glyph for (TECH_SPEC §6.4) instead of
// showing a misleading fallback.

/** Code points mapped to a real glyph (not .notdef) in the font. */
export function coveredCodePoints(font: ArrayBuffer): Set<number> {
  const v = new DataView(font);
  const numTables = v.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(
      v.getUint8(rec),
      v.getUint8(rec + 1),
      v.getUint8(rec + 2),
      v.getUint8(rec + 3),
    );
    if (tag === "cmap") cmap = v.getUint32(rec + 8);
  }
  if (cmap < 0) throw new Error("font has no cmap table");

  // Prefer a full-Unicode subtable (format 12), else the BMP one (format 4).
  let best = -1;
  let bestFormat = 0;
  const subtables = v.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = v.getUint16(rec);
    const encoding = v.getUint16(rec + 2);
    const offset = cmap + v.getUint32(rec + 4);
    const format = v.getUint16(offset);
    const unicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode && (format === 12 || (format === 4 && bestFormat !== 12))) {
      best = offset;
      bestFormat = format;
    }
  }
  if (best < 0) throw new Error("font has no Unicode cmap subtable");
  return bestFormat === 12 ? format12(v, best) : format4(v, best);
}

function format12(v: DataView, t: number): Set<number> {
  const out = new Set<number>();
  const groups = v.getUint32(t + 12);
  for (let g = 0; g < groups; g++) {
    const rec = t + 16 + g * 12;
    const start = v.getUint32(rec);
    const end = v.getUint32(rec + 4);
    const glyph = v.getUint32(rec + 8);
    for (let c = start; c <= end; c++)
      if (glyph + (c - start) !== 0) out.add(c);
  }
  return out;
}

function format4(v: DataView, t: number): Set<number> {
  const out = new Set<number>();
  const segX2 = v.getUint16(t + 6);
  const ends = t + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2; s += 2) {
    const end = v.getUint16(ends + s);
    const start = v.getUint16(starts + s);
    const delta = v.getInt16(deltas + s);
    const ro = v.getUint16(rangeOffsets + s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (ro === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const at = rangeOffsets + s + ro + (c - start) * 2;
        glyph = v.getUint16(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
  return out;
}
