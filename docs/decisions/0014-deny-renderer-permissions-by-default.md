# 0014: Deny renderer permissions by default

- Date: 2026-08-15
- Status: accepted
- 中文: [0014](0014-deny-renderer-permissions-by-default.zh.md)

## Context

The Harness UI is loaded from a loopback HTTP origin inside a sandboxed
`BrowserWindow`. Context isolation, sandboxing, disabled Node integration,
navigation guards, and a one-method preload bridge already limit its reach,
but Electron's session-level web permissions were not explicitly handled.
An upstream page could therefore request media, geolocation, notifications,
capture, USB, serial, or filesystem access and rely on platform defaults.

## Decision

Install both Electron session permission handlers before creating the main
window. Permission checks return `false`, and permission requests resolve
their callback with `false`. The current desktop shell needs none of these
permissions. Any future capability that needs one must add a narrow,
documented allowlist with tests instead of relaxing the default.

## Consequences

- Positive: renderer capabilities are explicit and consistent across
  platforms; unexpected upstream permission prompts cannot escape the shell's
  intended boundary.
- Negative: a future Harness feature that legitimately needs a web permission
  will remain unavailable until the shell reviews and allows it deliberately.

## Alternatives

- Rely on Electron and operating-system defaults: rejected because defaults
  vary and do not express the product's security contract.
- Allow every request from the loopback origin: rejected because origin trust
  does not imply that every powerful browser capability is required.
