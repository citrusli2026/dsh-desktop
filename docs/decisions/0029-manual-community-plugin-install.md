# 0029: Manual installation for all community plugins

- Date: 2026-08-30
- Status: accepted
- 中文: [0029](0029-manual-community-plugin-install.zh.md)

## Context

`v0.1.1-rc.2.shell.12` accidentally turned a test-time community-plugin setup
into product behavior: `dshmarket`, Better Sidebar, and Task Board were listed
in the vendored Harness closure, and a new profile automatically seeded them on
first launch. The two visible extensions may have come from test installs, but
the release package did contain the community packages, making them look like
official built-ins.

## Decision

- The vendored Harness closure contains only the official Harness bundles and
  the shell-owned `dsh-desktop-controls`; no community plugin is bundled.
- Remove first-run curated seeding. A new profile is created with only the
  official bundles from the Harness template.
- Keep the Extensions setting's "Install plugin market" action. The user
  explicitly installs dsh-market first, then chooses other community plugins
  and themes from Harness Settings → Plugin Market.
- Never silently modify or delete an existing profile. Plugins already written
  into a user's test profile remain user-owned and can be removed from Settings
  → Plugins.

## Consequences

- Installers are smaller, and the installed plugin list is entirely user
  controlled; community plugins are not presented as official built-ins.
- First use of the market takes one manual install action, but network
  installation, source review, and build-script approval are explicit.
- ADR 0024 remains as a historical decision record; this ADR supersedes its
  first-run preinstall behavior in the current implementation.
