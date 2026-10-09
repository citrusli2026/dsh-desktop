# 0034: Multi-runtime Dashboard with explicit Edition adapters

- Date: 2026-10-08
- Status: Accepted
- 中文：[0034](0034-multi-runtime-dashboard.zh.md)

## Context

The dsh ecosystem contains several desktop shells and multiple official
`@deepseek-ai/dsh` releases. A single global `active.json` and a single
`DSH_HOME` cannot safely represent simultaneous environments. Community
desktop applications also cannot be treated as npm runtimes: they have their
own installer, updater, data policy, and trust boundary.

## Decision

Add a Dashboard layer with three explicit concepts:

- **Edition**: a catalog entry for an official or community desktop/runtime
  source;
- **Runtime**: an installed version of `@deepseek-ai/dsh` or another supported
  executable source;
- **Environment**: a named process instance with its own `DSH_HOME`, workspace,
  port, and lifecycle.

The first implementation manages official npm runtimes. It selects a runtime
explicitly per environment and never changes the shell's global active pointer.
An environment can run beside another environment, and uninstalling a runtime
does not delete environment data. A running environment blocks runtime
uninstall.

Future community desktop editions must be integrated through an explicit
Adapter describing install, launch, stop, uninstall, update, supported
platforms, data paths, and trust metadata. The Dashboard must not copy or
silently execute arbitrary community binaries.

Isolation is displayed in levels: L1 data directories, L2 processes/ports,
L3 install roots, and L4 OS sandboxing. The first release promises L1-L3 only;
L4 requires a separate platform-security project.

## Consequences

- The current shell remains a reliable Electron shell rather than becoming an
  Agent workbench.
- Multiple official versions can be installed and exercised without changing
  the main Harness pointer.
- Community entries can be discovered without giving the catalog authority to
  install or update software silently.
- Runtime data survives uninstall, so users can reinstall a version or export
  the environment later.
- The Dashboard needs source and trust metadata in addition to version strings.

## Alternatives

- **Keep one global active runtime:** rejected because it cannot support
  simultaneous environments or safe per-instance data ownership.
- **Copy every community desktop project into this repository:** rejected
  because it creates an unmaintainable fork and blurs ownership.
- **Call separate directories a security sandbox:** rejected; directory and
  process isolation reduce accidental cross-talk but do not contain malicious
  code.
- **Let a remote catalog install whatever it lists:** rejected; discovery and
  execution require separate user-confirmed steps.

