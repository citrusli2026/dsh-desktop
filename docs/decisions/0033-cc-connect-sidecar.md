# 0033: cc-connect as an opt-in Desktop messaging sidecar

- Date: 2026-10-07
- Status: Accepted
- 中文：[0033](0033-cc-connect-sidecar.zh.md)

## Context

Users need a way to start and control DSH tasks from Feishu without making
the desktop shell a second Agent workbench. cc-connect already owns messaging
platform adapters and can drive an Agent through the official ACP stdio
protocol. DSH therefore remains the owner of Agent, tool, permission, and
session semantics while the desktop shell supplies packaging, configuration,
credentials, and process supervision.

## Decision

The Feishu integration is a user-enabled cc-connect sidecar managed by
dsh-desktop. The sidecar starts an official DSH ACP process and communicates
with it over ACP stdio. The Web Harness and ACP process use the same Desktop
`DSH_HOME`, but remain separate processes; the integration does not copy the
Harness session model or call Web-internal APIs.

The integration is exposed only from the Desktop settings page. It is not
added to the overlay, tray, or Extensions/Desktop tools action set. The
sidecar stays disabled until the user has enabled it and supplied complete
settings. The desktop process starts it after the Web Harness is ready,
stops it in Safe Mode, and resumes it when Safe Mode ends if the configuration
is still complete. An enabled setting is retained when Safe Mode stops the
sidecar.

Credentials cross the boundary only through the desktop main process and the
sidecar environment. The configuration contains a secret placeholder rather
than the Feishu App Secret. The renderer can save a new secret and can learn
only whether one is configured; it cannot read the secret. The main process
uses Electron protected storage when available and a permission-restricted
local fallback otherwise. Sidecar logs and surfaced errors redact secrets,
tokens, and environment values.

The first release boundary is one Feishu long connection, one project, and
one default workspace. It covers text, existing attachment degradation,
tool progress, permission decisions, stopping a task, and listing or
resuming persistent sessions. It does not add other messaging platforms, a
cc-connect management or webhook UI, ACP model/reasoning selection, native
ACP image blocks, live ACP embedding in the Web Harness, or automatic import
or takeover of a user's existing global cc-connect daemon.

This decision supplements ADR 0023: the messaging configuration is a settings
surface, not an extension action, so the three extension surfaces remain
unchanged. It supplements ADR 0030: the shell packages and supervises the
sidecar but does not become an Agent workbench or session authority. It uses
the settings and local-first boundaries from ADR 0031.

This record defines the target boundary; it does not claim that the
integration is implemented or that manual Feishu acceptance has passed.

## Consequences

- DSH remains the single owner of Agent execution and persistent session
  semantics, reducing the risk of divergent desktop and messaging behavior.
- A configured Desktop instance can provide a supervised Feishu entry point
  without exposing credentials to renderer code or adding new global actions.
- The shared `DSH_HOME` makes Web and ACP state discoverable to the same DSH
  installation, while process separation keeps their lifecycles independent.
- The first release has a deliberately narrow platform and project scope;
  broader platform support or richer ACP UI requires a separate decision.
- Safe Mode can stop messaging while preserving the user's intent to enable
  it, so recovery remains explicit and reversible.

## Alternatives

- **Reimplement the Agent/session loop in dsh-desktop:** rejected because it
  would duplicate Harness semantics and create a second source of truth.
- **Expose cc-connect in the overlay or tray:** rejected because messaging
  configuration is not one of the shared extension actions defined by ADR
  0023.
- **Run a shared global cc-connect daemon or import its configuration:**
  rejected because the Desktop must supervise only its own packaged process
  and must not mutate a user's existing global setup.
- **Put the App Secret in the generated TOML or renderer state:** rejected
  because configuration files and renderer code are not credential stores.
