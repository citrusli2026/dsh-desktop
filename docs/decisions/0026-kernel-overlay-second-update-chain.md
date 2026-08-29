# 0026: Kernel overlay — the second update chain

- Date: 2026-08-29
- Status: accepted
- 中文:[0026](0026-kernel-overlay-second-update-chain.zh.md)

## Context

The app ships one pinned kernel per release; users cannot get a newer
`@deepseek-ai/dsh` without an app update, while upstream rc cuts break
things frequently. Three high-star shells productized kernel management
(qufei1993's version manager, EAC's dual update chains with atomic switch
and rollback, dsh-tauri-desk's multi-kernel with health checks). Our
pinned-kernel-per-release + recovery center is half of that answer.

## Decision

- **Overlay directory**: `<userData>/kernels/<version>/` holds an
  independently installed official kernel (`pnpm add
  @deepseek-ai/dsh@<version>` with the bundled pnpm, hoisted layout,
  build scripts approved). `active.json` selects the active version; the
  supervisor re-evaluates the bin on every spawn (`dshBinOverride`), so a
  switch or rollback lands on the next restart.
- **The bundled kernel is the floor**: a missing, broken, or failed
  overlay always falls back to the bundled closure. An overlay that does
  not reach ready within one supervised boot (90 s) is marked
  `<version>.failed.json`, the pointer is cleared, and the shell restarts
  on the bundled kernel automatically (the manual switch surfaces the
  failure; the recovery center remains available throughout).
- **Layout parity**: the overlay installs with `--config.node-linker=
  hoisted` — the same flat layout as the vendored closure
  (deploy-harness) — so plugins resolve dependencies identically under
  either kernel. With pnpm's strict layout the seeded plugins could not
  resolve `schemastery` (verified in the isolated real-app run) and the
  health check correctly rolled the switch back.
- **Ownership**: kernels live in shell userData, never in the user's
  profile; restore-bundled clears the pointer and restarts but keeps the
  installed overlay for retry. Failed markers persist until a newer
  install of that version clears them by reinstall.

## Consequences

- Positive: kernel updates decouple from app releases; a bad kernel can
  never strand the user (bundled floor + automatic rollback); install is
  offline-safe to retry.
- Negative: a second full closure on disk (~400 MB via pnpm store
  hard-links, less in practice); plugin compatibility under a newer
  kernel is the health check's problem, not prevented; Windows junctions
  follow the same code path but are untested until a Windows runner exists.

## Alternatives

- Swap the kernel inside the vendored closure: mutates app-owned files,
  breaks signature/size assumptions, no floor to fall back to — rejected;
- Ship multiple kernels inside the app: installer bloat for versions most
  users never touch — rejected;
- `npm install` instead of the bundled pnpm: npm is not part of our
  supported closure tooling and lacks our lockfile discipline — rejected.
