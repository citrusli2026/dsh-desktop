# 0003: Share ~/.dsh with the CLI by default

- Date: 2026-02-09
- Status: superseded by [0012](0012-isolated-dsh-home.md) (desktop home is isolated by default since 2026-08-15)
- 中文:[0003](0003-shared-dsh-home.zh.md)

## Context

The harness keeps all user data (session JSONL, settings, credentials, profiles,
plugins) under `DSH_HOME` (default `~/.dsh`, overridable via environment
variable; see upstream `dsh-home-paths`). CLI and desktop users are often the
same people, so the location decides whether the two surfaces interoperate.

## Decision

The desktop shell leaves `DSH_HOME` untouched by default, i.e. shares `~/.dsh`
with the CLI:

- Sessions, settings, and API keys carry over when switching between CLI and
  desktop, in both directions;
- The shell copies and migrates nothing, avoiding state drift between two
  copies;
- A future settings entry may let advanced users pick an isolated home; the
  default stays shared.

## Consequences

- Positive: zero migration, matches upstream docs, most predictable behavior;
- Negative: concurrent CLI + desktop use relies on upstream's own consistency
  (the harness is designed for multi-process sharing, e.g. multiple web
  instances); an isolated "desktop-only sandbox" would be an explicit opt-in,
  never the default.

## Alternatives

- App-private data dir (e.g. `~/Library/Application Support/dsh-desktop`):
  cleaner isolation but breaks CLI parity and needs migration tooling —
  rejected;
- A first-run dialog asking users to choose: extra friction against the
  download-and-use goal — possible optional feature later.
