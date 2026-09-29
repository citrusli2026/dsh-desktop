#!/bin/bash
# Daily automatic GitCode mirror (idempotent): find the latest published
# release via git ls-remote (same network path as the maintainer's pushes)
# and run scripts/mirror-gitcode-v2.mjs — the web-api v2 pipeline, which is
# the only upload path GitCode currently persists (the legacy v5 pipeline
# reports success but never stores the object; see docs/decisions and the
# release runbook). Failures only append to the log — the mirror is
# best-effort and re-runs every day; the release runbook still mirrors
# explicitly at release time.
#
# Requires a logged-in gitcode.com tab with the kimi-webbridge daemon up
# (the script borrows that session's auth). When the browser is closed the
# run fails fast and cleanly — the next scheduled run retries.
#
# Configuration lives OUTSIDE the repo (never commit credentials):
#   ~/.gitcode-mirror.env  —  optional NODE_BIN=… / KIMI_WEBBRIDGE_URL=…
# (GITCODE_TOKEN is no longer needed: v2 auth is browser-borrowed.)
# Log: ~/Library/Logs/dsh-gitcode-mirror.log
set -uo pipefail

# launchd provides a minimal PATH; add the usual tool locations so gh/git
# resolve (the daemon's own node lookup below handles node explicitly).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"

LOG="$HOME/Library/Logs/dsh-gitcode-mirror.log"
ENV_FILE="$HOME/.gitcode-mirror.env"
REPO_DIR="${DSH_DESKTOP_REPO:-$HOME/dsh-desktop}"
GITCODE_REPO="citrusli2026/dsh-desktop"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; }

# launchd provides no user PATH; resolve node from the usual install spots
# (Homebrew ARM/Intel, volta, nvm) and allow an explicit override.
NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.volta/bin/node" "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [ -z "$NODE_BIN" ] && command -v node > /dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
fi
if [ -z "$NODE_BIN" ]; then
  log "node not found (set NODE_BIN in $ENV_FILE) — skipping"
  exit 1
fi

[ -f "$ENV_FILE" ] || { log "no $ENV_FILE — skipping (mirror needs a token)"; exit 0; }
[ -d "$REPO_DIR" ] || { log "no repo at $REPO_DIR — skipping"; exit 0; }

set -a
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
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
if ! (cd "$REPO_DIR" && "$NODE_BIN" scripts/mirror-gitcode-v2.mjs "$TAG" >> "$LOG" 2>&1); then
  log "mirror $TAG FAILED — will retry on the next scheduled run"
  exit 1
fi
log "mirror $TAG done"
