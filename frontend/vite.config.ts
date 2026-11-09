// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="vitest/config" />

import { resolve } from "node:path";
import { defineConfig } from "vite";

// The Go daemon serves the built files from dist/. During development,
// Vite serves the frontend and passes /api calls through to the daemon.
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
    proxy: {
      "/api": "http://127.0.0.1:7531",
    },
    // The spike loads sample texts from ../testdata.
    fs: { allow: [".."] },
  },
  test: {
    // Playwright tests in tests/e2e run separately (npm run e2e).
    include: ["tests/unit/**/*.test.ts"],
  },
});
