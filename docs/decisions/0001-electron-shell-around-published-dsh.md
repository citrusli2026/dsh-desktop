# 0001: Electron shell around the published @deepseek-ai/dsh, functionality unchanged

- Date: 2026-02-09
- Status: accepted
- 中文:[0001](0001-electron-shell-around-published-dsh.zh.md)

## Context

DeepSeek Harness (`dsh`) is an MIT-licensed agent framework published to npm:
`npx @deepseek-ai/dsh web` serves the full Web UI (React frontend + local
HTTP/WebSocket server) at `http://127.0.0.1:3080`. The goal is a download-and-use
desktop app whose agent functionality stays identical to upstream, with the
shell itself open source.

## Decision

The Electron shell implements no agent functionality of its own:

- The shell only provides: the window, harness child-process supervision
  (start/ready/restart/graceful stop), a tray icon, logging, and auto-updates;
- It runs the published `@deepseek-ai/dsh` package verbatim (exact version pin),
  booting `dsh --profile web --port 0`;
- The renderer loads the loopback URL the harness serves, reusing the upstream
  Web UI wholesale (chat, settings, API-key configuration, session management).
  The shell adds no configuration UI of its own.

Facts established from upstream code during research:

- The web profile is `dsh-base` + `dsh-web-app` cordis patch bundles;
- The WebServer supports `--port 0` (OS-assigned port) and deliberately rejects
  `--host 0.0.0.0` (remote code execution safety), so loopback-only fits the
  desktop shell;
- The readiness contract is one stdout line, `dsh web: http://127.0.0.1:<port>`,
  explicitly documented upstream as the supervisor signal;
- API keys, models, and providers are configured in the Web UI's settings page,
  persisted under `DSH_HOME` (default `~/.dsh`).

## Consequences

- Positive: byte-for-byte parity with upstream; upgrading is one version bump;
  the security boundary stays upstream's; 
- Negative: no deep native-window integrations (per-notification OS hooks etc.)
  — an accepted trade-off; upstream rc releases may break, so the shell follows
  their cadence (see 0004).

## Alternatives

- A native re-implementation of the UI inside Electron: large effort, lagging
  features, violates "functionality unchanged" — rejected;
- Depending on upstream git source instead of npm: pre-release churn, npm is
  the official consumption surface — rejected.
