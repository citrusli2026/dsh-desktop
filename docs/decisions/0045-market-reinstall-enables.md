# 0045: Reinstalling the plugin market leaves it enabled

- Date: 2026-10-24
- Status: accepted
- 中文: [0045](0045-market-reinstall-enables.zh.md)

## Context

The Extensions setting's "Install plugin market" action spawns the bundled
`dsh plugin --profile web add dshmarket` and then verifies that `dshmarket` is
on the profile's boot list. Two upstream behaviours make that verification
fail while the command still exits 0:

- `dsh plugin add` only enables *newly added* dependencies. When the profile
  already lists `dshmarket` in `dependencies`, pnpm keeps the pinned version
  and the reconcile step deliberately does not re-enable the retained bundle —
  exit 0, boot list unchanged.
- A dependency whose declared kernel requirements the running Harness rejects
  is reported as a warning and left installed but unbooted ("profile startup
  denies it until you grant an exemption"). Again exit 0.

The profile in the field had drifted exactly this way: `dshmarket@1.45.1`
required `@deepseek-ai/dsh-settings ^0.1.x`, the shipped kernel was
`0.2.1-rc.2`, and the market was installed, pinned, and off the boot list. The
shell reported reason `profile` ("the data directory is not writable or the
profile is incomplete"), so the user was told to repair permissions for a
problem that had nothing to do with permissions.

## Decision

- The market install asks for `dshmarket@latest`. A bare name is a no-op for a
  retained dependency, so an outdated pin would otherwise never move forward.
- After a successful install, if the boot list still does not name the market,
  the shell adds that one entry itself (`dsh.profile.bundles`), keeping the
  dependency range and the package directory untouched. This is the same
  file and the same atomic write the plugin-recovery actions already use, and
  it is the inverse of the existing disable action — still one field, still
  user-owned, still reversible from Harness Settings.
- The compatibility gate stays upstream's. When the CLI names the package as
  incompatible with the running kernel, the install reports reason
  `incompatible` with that line as the sanitized detail, and never enables a
  bundle the next boot would skip.
- `profile` keeps its literal meaning (unwritable directory, broken manifest,
  missing package) so the repair advice stays honest.

## Consequences

- Reinstalling the market heals the "installed, pinned, not enabled" state
  without asking the user to edit files, and without a second network round
  trip when the installed version is already current.
- A kernel older than the newest published market now fails with an
  actionable message that carries the exact `dsh plugin allow-version`
  command, instead of a false data-directory error.
- Upstream's reconcile remains authoritative for removals; the shell only
  ever re-adds the one bundle the user explicitly asked to install.
