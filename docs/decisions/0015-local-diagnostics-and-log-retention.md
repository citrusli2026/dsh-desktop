# 0015: Local-only diagnostics and bounded log retention

- Date: 2026-08-15
- Status: accepted
- 中文: [0015](0015-local-diagnostics-and-log-retention.zh.md)

## Context

The supervised Harness process writes a persistent `harness.log`, but the file
had no size limit and users had to locate and inspect it manually. Mature
developer tools make failure state portable enough to review and attach to an
issue. Diagnostics can also expose paths, prompts, and credentials, so an
automatic upload would conflict with this shell's local-first boundary.

## Decision

- Rotate `harness.log` after 5 MiB and keep three numbered generations.
- Let users export one plain-text report from Help, the tray, or the built-in
  error page. The report contains product/runtime versions, OS and architecture,
  the supervisor state, and at most the newest 256 KiB of the Harness log.
- Mask the user home path and common credential forms on a best-effort basis.
- Explain the report contents before export, save only to a user-selected local
  path, and never upload it automatically.

## Consequences

- Positive: disk use stays bounded and support reports carry consistent facts.
- Positive: the user remains in control of where diagnostic content goes.
- Negative: masking is not a proof that a report contains no sensitive data;
  the UI must continue telling users to review it before sharing.
- Negative: plain text is less compact than an archive, but it is transparent,
  dependency-free, and easy to inspect.

## Alternatives

- Zip all application data: rejected because it would collect far more private
  state than needed and add a runtime dependency.
- Upload reports to a hosted endpoint: rejected until there is an explicit
  privacy policy, consent flow, retention policy, and operational owner.
- Keep an unlimited log: rejected because long-running tray applications need a
  predictable storage bound.
