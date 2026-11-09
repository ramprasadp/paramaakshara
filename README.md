# Paramaakshara

A local-first Unicode editor for Sanskrit and Vedic texts. Type ITRANS on
the left, get Devanagari, Kannada or Tamil on the right, with Vedic
accents, and correct the output by hand without losing the link to the
ITRANS.

-   **ITRANS with Vedic accents:** `_` anudātta, `'` svarita, `'''` double
    svarita; `(gm)`/`(gg)` for the Taittirīya anusvara. Text typed in
    Baraha can be pasted and is converted.
-   **Two panes, one document:** edit any output line by hand; only that
    line stops following the ITRANS (marked ✎), and Regenerate brings it
    back. Undo works per pane.
-   **Devanagari, Kannada, Tamil:** switch the output script at any time;
    anything a script cannot write exactly is reported, never dropped.
-   **Export** the output as plain text or **PDF** (through the browser's
    Save as PDF, with the fonts embedded).
-   **Clean up text** for Baraha output (accent order, double svarita,
    short e/o, colon visarga) and a **Vedic symbol palette**.
-   **Your files stay on your computer.** The editor runs in your browser
    but talks only to a small program on your own machine. Saves are
    atomic, with backups and crash recovery.

The full design is in [TECH_SPEC.md](TECH_SPEC.md); the ITRANS table is
in [docs/itrans-mappings.md](docs/itrans-mappings.md).

## Install

Download the latest release from the
[Releases page](https://github.com/ramprasadp/paramaakshara/releases).

### macOS

1.  Download `paramaakshara-<version>-macos.zip` and double-click it.
2.  Move **Paramaakshara.app** to **Applications**.
3.  Open it. Your browser opens the editor, already signed in.

The app has no Dock icon: the editor lives in the browser tab. Opening
the app again opens another signed-in tab. To stop it, use **Quit** in
the editor's toolbar.

If the release notes say the app is **not notarized**, macOS will refuse
to open it the first time. Open it once with Control-click → **Open** →
**Open**, or run `xattr -dr com.apple.quarantine /Applications/Paramaakshara.app`.

### Linux

``` sh
tar -xzf paramaakshara-<version>-linux-amd64.tar.gz   # or -linux-arm64
./paramaakshara-<version>-linux-amd64/paramaakshara
```

The browser opens with `xdg-open`; use `--no-browser` to print the
sign-in link instead.

### Docker

A small image (about 8 MB); see [docker/README.md](docker/README.md).

## Where things are

  What                       macOS                                                Linux
  -------------------------- ---------------------------------------------------- ----------------------------------------
  Your documents             `~/Documents/Paramaakshara/`                          `~/Documents/Paramaakshara/`
  Settings (optional)        `~/Library/Application Support/Paramaakshara/`        `~/.config/paramaakshara/`
                             `config.json`                                         `config.json`
  Recovery and backups       `~/Library/Application Support/Paramaakshara/`        `~/.local/state/paramaakshara/`
  Log                        `~/Library/Logs/Paramaakshara/paramaakshara.log`      `~/.local/state/paramaakshara/`

To uninstall, quit the app and delete it; delete the folders above to
remove settings, recovery snapshots, backups and logs. Your documents are
never deleted.

## Running from the command line

The program is the same in the app and the downloads
(`Paramaakshara.app/Contents/MacOS/paramaakshara` on macOS).

``` sh
paramaakshara                          # start and open the browser
paramaakshara --port 9333 --log-file /var/log/apps/paramaakshara.log
paramaakshara --no-browser             # print the sign-in link instead
paramaakshara --log-file -             # log to the terminal
```

  Flag                  Environment variable       Default
  --------------------- -------------------------- ---------------------------------------
  `--config <path>`     `PARAMAAKSHARA_CONFIG`     the settings file above
  `--port <n>`          `PARAMAAKSHARA_PORT`       `7531`
  `--log-file <path>`   `PARAMAAKSHARA_LOG_FILE`   the log file above
  `--no-browser`                                   open the browser
  `--version`                                      print the version

Flags override environment variables, which override `config.json`. All
settings are described in TECH_SPEC §9.6. The program listens on
`127.0.0.1` only; other computers cannot reach it.

## Building from source

Requires Go 1.25 or later and Node.js (current LTS, for the build only).

``` sh
make build          # bin/paramaakshara, with the editor embedded
./bin/paramaakshara
make release        # all release artifacts in dist/ (docs/release.md)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and tests.

## Licence

GPL-3.0-or-later; see [LICENSE](LICENSE). Bundled fonts and libraries
keep their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
