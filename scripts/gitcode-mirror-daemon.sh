#!/bin/bash
# Daily automatic GitCode mirror (idempotent): find the latest published
# release via git ls-remote (same network path as the maintainer's pushes)
# and run scripts/mirror-gitcode.mjs. Failures only append to the log —
# the mirror is best-effort and re-runs every day; the release runbook
# still mirrors explicitly at release time.
#
# Configuration lives OUTSIDE the repo (never commit credentials):
#   ~/.gitcode-mirror.env  —  GITCODE_TOKEN=… and optional GH_PROXY_PREFIX=…
# Log: ~/Library/Logs/dsh-gitcode-mirror.log
set -uo pipefail

LOG="$HOME/Library/Logs/dsh-gitcode-mirror.log"
ENV_FILE="$HOME/.gitcode-mirror.env"
REPO_DIR="${DSH_DESKTOP_REPO:-$HOME/dsh-desktop}"
GITCODE_REPO="citrusli2026/dsh-electron-shell"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; }

[ -f "$ENV_FILE" ] || { log "no $ENV_FILE — skipping (mirror needs a token)"; exit 0; }
[ -d "$REPO_DIR" ] || { log "no repo at $REPO_DIR — skipping"; exit 0; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export GITCODE_REPO

# Latest release tag from the remote (the local checkout may lag behind bot
# syncs; the remote is authoritative). 45s cap keeps a dead network cheap.
TAG=$(git -C "$REPO_DIR" ls-remote --tags origin 'v*' 2>/dev/null \
  | awk -F/ '{print $NF}' | grep -E '^v[0-9]' | sort -V | tail -n 1)
if [ -z "$TAG" ]; then
  log "could not resolve the latest tag (network?) — skipping"
  exit 0
fi

log "mirror $TAG"
if ! (cd "$REPO_DIR" && node scripts/mirror-gitcode.mjs "$TAG" >> "$LOG" 2>&1); then
  log "mirror $TAG FAILED — will retry on the next scheduled run"
  exit 1
fi
log "mirror $TAG done"
