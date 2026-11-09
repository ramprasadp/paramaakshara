// SPDX-License-Identifier: GPL-3.0-or-later

import { fetchHealth } from "./health";

const app = document.getElementById("app");

if (app) {
  app.textContent = "Paramaakshara";
  fetchHealth()
    .then((h) => {
      app.textContent = `Paramaakshara ${h.version}`;
    })
    .catch(() => {
      app.textContent = "Paramaakshara (daemon not reachable)";
    });
}
