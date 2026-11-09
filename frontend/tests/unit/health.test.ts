// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "../../src/health";

describe("fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the daemon's app name and version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ app: "paramaakshara", version: "dev" }),
      ),
    );
    await expect(fetchHealth()).resolves.toEqual({
      app: "paramaakshara",
      version: "dev",
    });
  });

  it("throws when the daemon returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    await expect(fetchHealth()).rejects.toThrow("500");
  });
});
