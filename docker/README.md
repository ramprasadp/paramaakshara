# Running Paramaakshara in Docker

A small image (`FROM scratch`) with only the prebuilt static Linux
binary, which already contains the editor and its fonts. Nothing is
compiled inside Docker.

## Build and start

From the repository root (needs Go, Node.js and Docker):

``` sh
make docker                                  # Linux binary + image paramaakshara:local
mkdir -p ~/Documents/Paramaakshara           # your documents folder
docker compose -f docker/compose.yaml up -d
docker compose -f docker/compose.yaml logs   # look for "Open this link to sign in"
```

Open the printed link (`http://127.0.0.1:7531/auth?token=…`) in your
browser. It works once; after that the browser stays signed in until it
is closed or the container restarts.

To get a new sign-in link at any time:

``` sh
docker compose -f docker/compose.yaml exec paramaakshara /paramaakshara --no-browser
```

## Settings

Set these in the environment or in a `docker/.env` file:

  Variable                    Default                          Meaning
  --------------------------- -------------------------------- --------------------------------
  `PARAMAAKSHARA_PORT`        `7531`                           Port, the same on host and
                                                               container
  `PARAMAAKSHARA_DOCUMENTS`   `~/Documents/Paramaakshara`      Host folder shown as
                                                               "Documents"
  `TZ`                        `UTC`                            Time zone for log timestamps,
                                                               e.g. `Asia/Kolkata`

Logs go to `docker compose logs`. Config, recovery snapshots and backups
are kept in the `paramaakshara_state` volume.

## How it stays private

-   The port is published on the host's `127.0.0.1` only, so other
    machines cannot reach it.
-   Inside the container the daemon listens on all interfaces, because
    the container's own loopback is not reachable from the host. It does
    this only when `PARAMAAKSHARA_CONTAINER=1`, which the image sets; on
    a normal machine it still refuses anything but loopback
    (TECH_SPEC §9.5).
-   The usual session token, Host and Origin checks apply.
-   The container runs as an unprivileged user with a read-only root
    file system, no capabilities and no privilege escalation.

## Updating

``` sh
make docker
docker compose -f docker/compose.yaml up -d
```

The image is built for the machine's own architecture
(`go env GOARCH`); set `DOCKER_ARCH=amd64` or `arm64` to build for
another.
