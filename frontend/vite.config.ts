// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from "vite";

// The Go daemon serves the built files from dist/. During development,
// Vite serves the frontend and passes /api calls through to the daemon.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:7531",
    },
  },
});
