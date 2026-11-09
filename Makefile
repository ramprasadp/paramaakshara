VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
BIN     := bin/paramaakshara

.PHONY: all build frontend test e2e lint fmt dev clean

all: lint test build

frontend/node_modules: frontend/package-lock.json
	npm --prefix frontend ci
	@touch $@

# The frontend is built into frontend/dist and embedded in the binary.
frontend: frontend/node_modules
	npm --prefix frontend run build

build: frontend
	go build -ldflags "-X main.version=$(VERSION)" -o $(BIN) ./cmd/paramaakshara

test: frontend/node_modules
	go test ./...
	npm --prefix frontend test

# Browser tests (Playwright). First run: npx --prefix frontend playwright install
e2e: frontend/node_modules
	npm --prefix frontend run e2e

lint: frontend/node_modules
	@test -z "$$(gofmt -l .)" || { gofmt -l .; echo "gofmt: files above need formatting"; exit 1; }
	go vet ./...
	npm --prefix frontend run typecheck
	npm --prefix frontend run format:check

fmt: frontend/node_modules
	gofmt -w .
	npm --prefix frontend run format

# Runs the daemon (port 7531, logging to the terminal) and the Vite dev
# server together. Open the printed sign-in link with 7531 replaced by the
# Vite port (5173); Vite passes /auth and /api through to the daemon.
dev: frontend/node_modules
	@trap 'kill 0' EXIT; \
	go run ./cmd/paramaakshara --port 7531 --no-browser --log-file - & \
	npm --prefix frontend run dev

clean:
	rm -rf bin frontend/node_modules
	find frontend/dist -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
