# 0030: Reliable Electron Shell and Out-of-the-Box Scope

- Date: 2026-08-30
- Status: Accepted
- 中文：[0030](0030-reliable-electron-shell-scope.zh.md)

## Context

`dsh-desktop` is a community-maintained personal project with limited
maintenance capacity. Its value is making the official DeepSeek Harness easier
to install, start, keep running, and recover — not rebuilding an Agent
workbench. Following every desktop project into multi-agent views, file
workspaces, browsers, vision, and many model integrations would exceed the
boundary this project can maintain reliably.

## Decision

The product position is fixed as: **a reliable Electron shell plus an
out-of-the-box experience**.

The shell owns:

- a bundled Node runtime and Harness dependency closure so the app starts after download;
- native windows, tray, menus, single-instance behavior, supervision, and desktop preferences;
- update prompts, kernel selection/rollback, diagnostics, Safe Mode, and recovery;
- a manual entry point for community plugins, plus status and recovery support;
- cross-platform, network, path, locale, and first-launch polish within the existing scope.

Harness remains responsible for Agent, session, tool, model, and plugin behavior.
The shell does not create a second Agent workbench, chat product, or session model.

The following are out of scope for the current product:

- an Agent workbench, separate chat surface, or multi-agent orchestration;
- complex project/worktree management, file-diff workspaces, or an Agent Browser;
- Vision, default screen capture, desktop pets, gamification, or a large theme system;
- multi-provider aggregation, local-model lifecycle management, or an internet remote-control platform.

Community plugins remain manual user installs. They do not enter the installer
bundle or get seeded on first launch. Signing and notarization are not current
iteration work or release gates. After the main feature set is complete, real
downloads, active usage, and user feedback will determine whether a separate
signing initiative is justified.

## Consequences

- Maintenance scope stays controlled; test and release quality outrank feature count.
- “Out of the box” means a smooth install, launch, recovery, and official Harness path; it does not mean bundled community plugins.
- A new feature must directly improve reliable operation, installation, recovery, or desktop usability, or it belongs on the non-goals list.
- If usage later justifies signing/notarization, it can be a separate release-infrastructure project without changing the current architecture.

## Alternatives

- **Expand into an Agent workbench to match competitors:** rejected; the maintenance and product responsibility exceed a personal community project.
- **Prioritize signing/notarization now:** deferred; completing existing functionality has higher priority and usage does not yet justify the investment.
- **Keep shipping curated community plugins:** rejected; community plugins must be explicitly chosen and installed by the user rather than mistaken for official features.
