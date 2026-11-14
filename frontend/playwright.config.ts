// SPDX-License-Identifier: GPL-3.0-or-later

import { resolve } from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

// The tests run their own daemon on port 7541 with HOME set to .e2e/home,
// so they never touch the user's documents, recovery files or a daemon
// already running on 7531.
export const E2E = resolve(import.meta.dirname, ".e2e");
const DAEMON_PORT = 7541;
const VITE_PORT = 5174;

const config = JSON.stringify({
  server: { port: DAEMON_PORT, open_browser: false },
  documents: { roots: [{ name: "Documents", path: `${E2E}/docs` }] },
  recovery: { interval_seconds: 1 },
  logging: { file: `${E2E}/daemon.log` },
  // Export all makes PDFs with Playwright's own Chromium.
  pdf: { browser: chromium.executablePath() },
});

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  reporter: "list",
  // One daemon and document folder are shared, so tests run one at a time.
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${VITE_PORT}` },
  webServer: [
    {
      // Build first, then run with HOME pointing at the throwaway folder.
      command:
        `go build -o .e2e-bin/paramaakshara ../cmd/paramaakshara && rm -rf .e2e && mkdir -p .e2e/home && ` +
        `printf '%s' '${config}' > .e2e/config.json && ` +
        `HOME='${E2E}/home' .e2e-bin/paramaakshara --config .e2e/config.json --no-browser`,
      url: `http://127.0.0.1:${DAEMON_PORT}/api/health`,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${VITE_PORT} --strictPort`,
      url: `http://127.0.0.1:${VITE_PORT}/spike/editor.html`,
      env: { PARAMAAKSHARA_DAEMON: `http://127.0.0.1:${DAEMON_PORT}` },
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
