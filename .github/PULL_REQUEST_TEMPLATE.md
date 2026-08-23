## What does this PR do?

## Verification checklist

- [ ] `pnpm run verify` passes locally (typecheck + unit tests + site checks + build)
- [ ] Site-only changes: `pnpm run site:check` green, bilingual keys aligned
- [ ] Release-item changes: `version.mjs check` clean; tag/branch rules respected
- [ ] Docs touched: docs/README.md governance followed (no historical ADR rewrite)
- [ ] Pushed to **both** remotes (`origin` + `gitcode`) — the GitCode mirror must not lag

## Hazards

- Behavior change? Which docs/ADR references it?
- Any field to add to .sha256/attestation contract? (Release items)
