// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  FormatError,
  fileKind,
  fromProject,
  load,
  lostOnSave,
  serialise,
  toProject,
  type Settings,
} from "../../src/model/project";
import {
  applyOutputChange,
  fromSource,
  kind,
  outputText,
  sourceText,
  type Context,
} from "../../src/model/segments";

function context(convert = (s: string) => s.toUpperCase()): Context {
  let n = 0;
  return { convert, newId: () => `s${++n}` };
}

const settings: Settings = {
  input_scheme: "itrans",
  output_script: "devanagari",
  tamil_convention: "superscript",
  vedic_tradition: "rigveda",
  e_o_length: "sanskrit",
};

function sample(ctx: Context) {
  let segs = fromSource("aa\nbb\ncc", ctx);
  segs = applyOutputChange(segs, { from: 5, to: 5, insert: "!" }, ctx); // BB! detached
  segs = applyOutputChange(segs, { from: 9, to: 9, insert: "\nnote" }, ctx); // output-only
  return segs;
}

describe("project file", () => {
  it("round-trips source, output and segment state", () => {
    const ctx = context();
    const segs = sample(ctx);
    const json = toProject(segs, settings, "test/1");
    const loaded = fromProject(json, context());
    expect(loaded.segments.map((s) => [kind(s), s.source, s.output])).toEqual(
      segs.map((s) => [kind(s), s.source, s.output]),
    );
    expect(loaded.settings).toEqual(settings);
    expect(loaded.changedByConverter).toBe(0);
    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json).format_version).toBe(1);
  });

  it("keeps stored output when the converter now differs, and counts it", () => {
    const json = toProject(fromSource("aa\nbb", context()), settings, "old/1");
    const loaded = fromProject(
      json,
      context((s) => s.toUpperCase() + "*"),
    );
    expect(loaded.changedByConverter).toBe(2);
    expect(loaded.segments.map((s) => [kind(s), s.output])).toEqual([
      ["stale", "AA"],
      ["stale", "BB"],
    ]);
  });

  it("saves the e/o reading, and reads files without it as Sanskrit", () => {
    const ctx = context();
    const json = toProject(
      fromSource("aa", ctx),
      { ...settings, e_o_length: "dravidian" },
      "test/1",
    );
    expect(JSON.parse(json).e_o_length).toBe("dravidian");
    expect(fromProject(json, ctx).settings?.e_o_length).toBe("dravidian");
    const old = JSON.parse(json) as Record<string, unknown>;
    delete old.e_o_length;
    expect(fromProject(JSON.stringify(old), ctx).settings?.e_o_length).toBe(
      "sanskrit",
    );
  });

  it("preserves Vedic text exactly", () => {
    const ctx = context((s) => s);
    const text = "भूमि॑ं स्वाहा᳚ क्‍ष";
    const json = toProject(fromSource(text, ctx), settings, "id/1");
    expect(outputText(fromProject(json, ctx).segments)).toBe(text);
  });

  it("rejects newer formats and malformed files with a clear message", () => {
    const ctx = context();
    expect(() => fromProject("{", ctx)).toThrow(FormatError);
    expect(() => fromProject(`{"format":"other"}`, ctx)).toThrow(
      "not a Paramaakshara project",
    );
    expect(() =>
      fromProject(
        `{"format":"paramaakshara","format_version":2,"segments":[]}`,
        ctx,
      ),
    ).toThrow("newer version");
    expect(() =>
      fromProject(
        `{"format":"paramaakshara","format_version":1,"segments":[{"source":"a","output":"A\\nB","linked":true}]}`,
        ctx,
      ),
    ).toThrow("segment 1");
  });
});

describe("plain text and ITRANS files", () => {
  it("picks the kind from the extension", () => {
    expect(fileKind("rv/1.paramaakshara.json")).toBe("project");
    expect(fileKind("a.ITX")).toBe("itrans");
    expect(fileKind("a.txt")).toBe("text");
  });

  it("opens text as output-only lines and ITRANS as linked lines", () => {
    const ctx = context();
    expect(load("text", "x\ny\n", ctx).segments.map(kind)).toEqual([
      "output-only",
      "output-only",
      "output-only",
    ]);
    expect(load("text", "", ctx).segments).toEqual([]);
    const itx = load("itrans", "aa\nbb", ctx).segments;
    expect(itx.map((s) => [kind(s), s.output])).toEqual([
      ["linked", "AA"],
      ["linked", "BB"],
    ]);
  });

  it("round-trips the exact text, including a final newline", () => {
    const ctx = context();
    for (const text of ["x\ny\n", "x", "\n\n"]) {
      expect(
        serialise("text", load("text", text, ctx).segments, settings, ""),
      ).toBe(text);
    }
    expect(
      serialise(
        "itrans",
        load("itrans", "aa\nbb\n", ctx).segments,
        settings,
        "",
      ),
    ).toBe("aa\nbb\n");
  });

  it("warns about what a format leaves out", () => {
    const ctx = context();
    const segs = sample(ctx);
    expect(lostOnSave("text", segs)).toMatch(/ITRANS input is not saved/);
    expect(lostOnSave("itrans", segs)).toMatch(/manually edited/);
    expect(lostOnSave("project", segs)).toBeNull();
    expect(lostOnSave("text", load("text", "x", ctx).segments)).toBeNull();
    expect(sourceText(segs)).toBe("aa\nbb\ncc");
  });
});
