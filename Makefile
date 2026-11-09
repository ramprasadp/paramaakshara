VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
BIN     := bin/paramaakshara

.PHONY: all build frontend test e2e lint fmt dev clean docker-binary docker release

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

# Docker (docker/README.md): a static Linux binary for the image, then
# the image itself. DOCKER_ARCH defaults to this machine's architecture.
DOCKER_ARCH ?= $(shell go env GOARCH)

docker-binary: frontend
	mkdir -p docker/bin
	CGO_ENABLED=0 GOOS=linux GOARCH=$(DOCKER_ARCH) go build -tags timetzdata -trimpath \
		-ldflags "-s -w -X main.version=$(VERSION)" -o docker/bin/paramaakshara ./cmd/paramaakshara
	cp LICENSE THIRD_PARTY_NOTICES.md docker/bin/

docker: docker-binary
	docker compose -f docker/compose.yaml build

# Release artifacts in dist/ (docs/release.md). Set DEVELOPER_ID and
# NOTARY_PROFILE to sign and notarize the macOS app.
release:
	scripts/release.sh

clean:
	rm -rf bin frontend/node_modules
	find frontend/dist -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
