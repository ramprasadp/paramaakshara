# Third-party notices

Paramaakshara is licensed under GPL-3.0-or-later (see `LICENSE`). It
includes the following third-party software, each under its own
licence. All are compatible with GPL-3.0 (TECH_SPEC §17.2).

Exact versions are pinned in `go.sum` and `frontend/package-lock.json`.
The full licence text of each package is in its source distribution.

## Go modules (compiled into the binary)

  Module                              Version   Licence   Use
  ----------------------------------- --------- --------- ----------------
  `gopkg.in/natefinch/lumberjack.v2`  v2.2.1    MIT       Log file rotation

## Frontend packages (bundled into the embedded frontend)

  Package                        Version   Licence   Use
  ------------------------------ --------- --------- ----------------------------
  `@codemirror/state`            6.7.6     MIT       Editor state
  `@codemirror/view`             6.43.15   MIT       Editor view, gutters
  `@codemirror/commands`         6.11.1    MIT       Keymap, undo history
  `@codemirror/language`         6.13.1    MIT       Dependency of the above
  `@codemirror/streamparser`     6.0.0     MIT       Dependency of the above
  `@lezer/common`                1.5.5     MIT       Dependency of the above
  `@lezer/highlight`             1.2.5     MIT       Dependency of the above
  `@lezer/lr`                    1.4.12    MIT       Dependency of the above
  `@marijn/find-cluster-break`   1.0.4     MIT       Dependency of the above
  `crelt`                        1.0.7     MIT       Dependency of the above
  `style-mod`                    4.1.4     MIT       Dependency of the above
  `w3c-keyname`                  2.2.8     MIT       Dependency of the above

## Build and test tools (not distributed)

Go toolchain (BSD-3-Clause), Node.js (MIT), TypeScript (Apache-2.0),
Vite (MIT), Vitest (MIT), Playwright (Apache-2.0), Prettier (MIT),
`@types/node` (MIT).

## Fonts

None bundled yet. Noto Sans/Serif Devanagari (OFL-1.1) will be added in
M7 (ADR 0002).
