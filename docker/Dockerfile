# SPDX-License-Identifier: GPL-3.0-or-later
#
# Paramaakshara in a minimal container. The image holds only the prebuilt
# static binary (frontend and fonts embedded) and the licence files; build
# it with `make docker` from the repository root, not with docker build
# directly. See docker/README.md.

FROM scratch

# /data is HOME: config, session, recovery, backups and the document
# folder. Owned by the unprivileged user so a fresh named volume is
# writable.
COPY --chown=65532:65532 data/ /data/
COPY bin/LICENSE bin/THIRD_PARTY_NOTICES.md /licenses/
COPY bin/paramaakshara /paramaakshara

ENV HOME=/data \
    PARAMAAKSHARA_CONTAINER=1 \
    PARAMAAKSHARA_LOG_FILE=- \
    TZ=UTC

USER 65532:65532
EXPOSE 7531
ENTRYPOINT ["/paramaakshara"]
