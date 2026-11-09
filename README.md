# paramaakshara

A local-first Unicode editor for Sanskrit and Vedic texts, with live
ITRANS transliteration and Vedic accents. See [TECH_SPEC.md](TECH_SPEC.md)
and [docs/dev-plan.md](docs/dev-plan.md).

## Building

Requires Go 1.24 or later and Node.js (current LTS, build only).

``` sh
make build          # builds the frontend and bin/paramaakshara
./bin/paramaakshara # serves the editor on http://127.0.0.1:7531/
```

The frontend is embedded in the binary; users need only the binary and a
browser.

## Development

``` sh
make dev    # daemon on :7531 plus the Vite dev server; open the Vite URL
make test   # Go and frontend tests
make lint   # gofmt, go vet, TypeScript and Prettier checks
make fmt    # format Go and frontend code
```

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
