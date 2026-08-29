# 0028: Extension surfaces gain a restart action

- Date: 2026-08-30
- Status: Accepted
- 中文:[0028](0028-extension-surface-restart.zh.md)

## Context

Decision 0023 collapsed the extension surfaces into a fixed trio (device
pairing / Safe Mode / About), but it missed a frequent moment: after
installing, upgrading, or troubleshooting a plugin, the Harness must restart
for the new bundle list to load. Restart lived only in the tray and the Help
menu — the overlay panel, the window context menu, and the app Extensions
menu had none. Installing a plugin from the overlay meant hunting elsewhere
for a restart.

## Decision

Every extension surface — the overlay panel, the app Extensions menu, the
tray, and the window context menu — gains a fourth action next to the trio:
**Restart Harness** (the 0023 trio is unchanged; the order is pairing →
Safe Mode → restart → About).

- All surfaces drive the same path, `ShellApp.requestRestart()`, which asks
  for confirmation while the harness is ready (a restart may interrupt
  running tasks) — matching today's tray and Help menu behavior;
- The overlay triggers it through a new `restartHarness` desktop action; the
  panel closes immediately and the main process raises the confirmation;
- No unconfirmed variant: a plugin refresh is worth one confirmation click.

## Consequences

- Positive: all four extension surfaces carry identical actions; installing
  a plugin flows straight into a restart; restart and Safe Mode together
  close the troubleshooting loop;
- Negative: the extension action set grows from three to four; decision
  0023's "trio" wording is amended by this decision;
- Neutral: the existing restart entries in the tray and Help menu stay as
  they are — nothing migrates, nothing is removed.

## Alternatives

- Restart only in the overlay (smallest change): the surfaces would drift
  again — exactly what 0023 set out to prevent; rejected;
- A restart button inside the extension settings: restart is an action, not
  a preference — wrong home for it; rejected;
- Silently restarting after a plugin install: the install flow already
  carries "a restart picks it up" semantics, and a silent restart would
  interrupt running tasks; rejected.
