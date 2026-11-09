// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="vitest/config" />

import { resolve } from "node:path";
import { defineConfig, type ProxyOptions } from "vite";

// The Go daemon serves the built files from dist/. During development,
// Vite serves the frontend and passes /api calls through to the daemon.
// PARAMAAKSHARA_DAEMON lets the browser tests use their own daemon.
const daemon = process.env.PARAMAAKSHARA_DAEMON ?? "http://127.0.0.1:7531";

const daemonProxy: ProxyOptions = {
  target: daemon,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on("proxyReq", (req) => {
      if (req.getHeader("origin")) req.setHeader("origin", daemon);
    });
  },
};

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        // M1 spike page; removed once the editor decision is recorded.
        spike: resolve(import.meta.dirname, "spike/editor.html"),
      },
    },
  },
  server: {
    // The daemon checks Host and Origin (spec §9.5), so the proxy presents
    // the daemon's own address and origin. /auth is proxied too, so the
    // daemon's sign-in link works with the Vite port in place of 7531.
    proxy: {
      "/api": daemonProxy,
      "/auth": daemonProxy,
    },
    // The spike loads sample texts from ../testdata.
    fs: { allow: [".."] },
  },
  test: {
    // Playwright tests in tests/e2e run separately (npm run e2e).
    include: ["tests/unit/**/*.test.ts"],
  },
});
