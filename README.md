# paramaakshara

A local-first Unicode editor for Sanskrit and Vedic texts, with live
ITRANS transliteration and Vedic accents. See [TECH_SPEC.md](TECH_SPEC.md)
and [docs/dev-plan.md](docs/dev-plan.md).

## Building

Requires Go 1.25 or later and Node.js (current LTS, build only).

``` sh
make build          # builds the frontend and bin/paramaakshara
./bin/paramaakshara # starts the editor and opens it in the browser
```

The frontend is embedded in the binary; users need only the binary and a
browser.

## Running

The daemon listens on `127.0.0.1` only and opens the browser with a
one-time sign-in link. Starting it again while it runs just opens
another signed-in browser window.

``` sh
./bin/paramaakshara --port 9333 --log-file /var/log/apps/paramaakshara.log
./bin/paramaakshara --no-browser    # print the sign-in link instead
./bin/paramaakshara --log-file -    # log to the terminal
```

  Flag                  Environment variable       Default
  --------------------- -------------------------- ---------------------------------------
  `--config <path>`     `PARAMAAKSHARA_CONFIG`     `~/Library/Application Support/`
                                                   `Paramaakshara/config.json` (macOS)
  `--port <n>`          `PARAMAAKSHARA_PORT`       `7531`
  `--log-file <path>`   `PARAMAAKSHARA_LOG_FILE`   `~/Library/Logs/Paramaakshara/`
                                                   `paramaakshara.log` (macOS)
  `--no-browser`                                   open the browser

Flags override environment variables, which override `config.json`. All
settings are described in TECH_SPEC §9.6. Logs rotate daily; 14 days
are kept. Stop the daemon with Ctrl-C.

## Docker

A small image (about 8 MB) with the prebuilt binary; see
[docker/README.md](docker/README.md):

``` sh
make docker
docker compose -f docker/compose.yaml up -d
docker compose -f docker/compose.yaml logs    # sign-in link
```

## Development

``` sh
make dev    # daemon on :7531 plus Vite; open the printed link with port 5173
make e2e    # Playwright browser tests
make test   # Go and frontend tests
make lint   # gofmt, go vet, TypeScript and Prettier checks
make fmt    # format Go and frontend code
```

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
