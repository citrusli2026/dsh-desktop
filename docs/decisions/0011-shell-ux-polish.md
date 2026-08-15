# 0011: Shell UX polish — retry recovery, persisted window state, tray surface

- Date: 2026-08-15
- Status: accepted
- 中文:[0011](0011-shell-ux-polish.zh.md)

## Context

A shell-layer review after 0.1.0-rc.6.shell.3 found several gaps, none
touching harness behavior. Three are handled here; the fourth — macOS having
no update signal at all — is handled separately in [0010](0010-macos-check-only-update.md):

1. **Retry could strand the error page**: `harness:retry` resolves `false`
   when a restart never reaches readiness, but the page only handled promise
   rejections — the button stayed disabled on "正在启动…" forever;
2. **The window always opened at 1280×860**, ignoring the user's geometry;
3. **The tray had only open/quit** — no status, no restart, no diagnostics.

## Decision

1. **Retry recovery**: the error page restores its button on every failure
   shape — a resolved `false`, a rejection, or a missing preload bridge —
   and says so in a hint line. A smoke-only hook
   (`DSH_DESKTOP_TEST_RETRY_FAIL=1`) forces the `false` path so CI
   regression-tests the recovery. The restart body moved into a shared
   `restartHarness()`, reused by the tray's restart item.
2. **Window state**: normal bounds plus the maximized flag persist to
   `userData/window-state.json` (debounced on resize/move, exact on close).
   The geometry rules are pure (`src/main/window-state.ts`): clamp to the
   window minimums, reuse a saved position only when at least 100 px would
   still be visible on some connected display, fall back to defaults on
   malformed input.
3. **Tray surface**: status line (启动中/运行中/已崩溃), 重启 Harness,
   打开日志目录, 检查更新…(behavior per 0010), and the running version.
   The menu rebuilds on every supervisor state transition.

## Consequences

- Positive: crash recovery can no longer strand the user on a dead button;
  the window remembers its geometry; harness state and lifecycle actions are
  visible from the tray;
- Negative: the shell's own copy (pages, tray, dialogs) remains
  Chinese-only.

## Alternatives

- Polling a harness health endpoint after readiness (process alive but HTTP
  dead): deferred — a watchdog that kills a busy-but-slow harness is worse
  than the gap it closes;
- Full i18n of the shell pages: deferred until a second language is actually
  requested.
