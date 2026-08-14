# 0006: Harness supervision protocol

- Date: 2026-02-09
- Status: accepted
- 中文:[0006](0006-process-supervision-protocol.zh.md)

## Context

The main process must manage the harness child's full lifecycle: start, know
when the UI can load, deal with crashes, and give the harness a chance to
persist (session JSONL, settings) on quit.

## Decision

The protocol centers on the **upstream readiness line** (`dsh --profile web
--port 0` prints `dsh web: http://127.0.0.1:<port>` to stdout once its Loader
settles; upstream comments name it as the supervisor signal):

1. **Start**: spawn `<node> <dsh-bin.js> --profile web --port 0`, collect
   stdout/stderr line-by-line (append to `userData/logs/harness.log`, keep the
   last 40 lines in memory);
2. **Ready**: on the readiness line, swap the placeholder page for that
   loopback URL; 90s without readiness, or an exit before readiness, shows the
   error page and fails the boot;
3. **Crash restart**: an unexpected exit after readiness restarts with
   exponential backoff (2s base, 30s cap) under a budget of 5 crashes per
   10-minute window; over budget the supervisor gives up and shows the error
   page with the log tail. Pre-readiness exits do not auto-retry (a broken
   install must not spin); since 0.1.1-pre.0 the error page has a manual
   "retry" button wired through a sandboxed preload/IPC bridge;
4. **Graceful stop**: SIGTERM → 5s grace → SIGKILL. On Windows SIGTERM is
   TerminateProcess for the direct child, so `taskkill /T /F` sweeps the whole
   process tree — shell sessions and subagents must not survive an app quit
   (incremental JSONL writes bound the loss to the in-flight event; a real
   Ctrl+C-level graceful stop needs `GenerateConsoleCtrlEvent`, deferred);
5. **Navigation**: the window may only navigate to the harness loopback origin;
   anything else opens in the system browser;
6. **Single instance**: `requestSingleInstanceLock`; a second launch focuses
   the existing window. Closing the window parks the app in the tray.

## Consequences

- Positive: the protocol rests entirely on upstream's stable contracts
  (readiness line, loopback bind, signal semantics); crash recovery is visible
  (placeholder → UI, error page carries the log);
- Negative: none material after the retry button; the Windows graceful-stop
  gap is documented above.

## Alternatives

- Port polling instead of the readiness line: a listening socket proves
  nothing about service readiness and adds port races — rejected;
- Restarting forever after crashes: masks persistent faults — rejected;
- A retry button in the very first release: needed a preload/IPC bridge —
  shipped in the M3 polish round instead.
