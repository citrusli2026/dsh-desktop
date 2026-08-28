# 0022: Repository renamed back to `dsh-desktop`

- Date: 2026-08-29
- Status: accepted
- 中文:[0022](0022-repo-rename-dsh-desktop.zh.md)

## Context

Decision 0013 named the product `dsh-desktop` while deliberately keeping the
repository as `citrusli2026/dsh-electron-shell`, and the GitCode mirror and
R2 mirror path derived from it. The split naming kept resurfacing as
friction: every URL, doc, and verification command carries a name the
product never uses, and each new published link deepens the investment in
the old name. The user count is still small, so the cost of a clean rename
(stale links in the wild, already-installed builds going quiet about
updates) is lowest now and only grows later.

## Decision

- The GitHub repository is renamed to `citrusli2026/dsh-desktop`; the
  GitCode mirror is renamed to `citrusli2026/dsh-desktop` to match, and the
  R2 mirror prefix becomes `dsh-desktop/<tag>/` going forward (existing R2
  objects stay under the old prefix).
- Every repository reference in code, CI, site, docs, and release tooling
  is updated to the new name; `site/data/release.json` is regenerated.
- The `appId` stays `io.github.citrusli2026.dsh-electron-shell` — 0013's
  rationale (install identity and upgrade continuity) is unchanged; the
  appId is a bundle identifier, not a link.
- **Never re-create a repository named `citrusli2026/dsh-electron-shell`.**
  GitHub's automatic redirects from the old name (web, git, API) die the
  moment a repository re-occupies it, which would strand every published
  link and point old update feeds at an unrelated repository.
- Accepted breakage (small user base): macOS builds installed before the
  rename stop seeing update prompts — their hardcoded release-URL allowlist
  (`src/main/update-check.ts`) only knows the old repo path, so they keep
  running but must be updated manually from the website. GitCode links
  published before the rename may stop resolving. No compatibility release
  is shipped for either.

## Consequences

- Positive: one name across repository, product, artifacts, website,
  mirror, and verification commands; the 0013 tension (product says
  `dsh-desktop`, URLs say `dsh-electron-shell`) is gone.
- Negative: old links in the wild depend on GitHub's redirect; old macOS
  builds go quiet about updates until manually upgraded; GitCode and R2
  history is reachable only under the new path (GitCode aliases the old
  API path, R2 keeps the old objects).

## Alternatives

- Ship a compatibility release first that widens the update allowlist to
  both repo names, then rename: correct for installed clients, but
  pointless at the current user count — rejected;
- Keep the split naming per 0013: the friction is permanent and grows with
  every published link — rejected.
