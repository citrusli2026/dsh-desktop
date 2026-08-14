# 0002: Harness runs on a bundled standalone Node

- Date: 2026-02-09
- Status: accepted
- 中文:[0002](0002-bundled-node-runtime.zh.md)

## Context

Electron embeds its own Node, but the harness needs a real Node runtime
(upstream engines: `^22.19.0 || >=24.0.0`). The closure contains native modules:
`node-pty` (NAN, built per Node ABI), `koffi` (pure FFI, ABI-stable), `sharp`
(N-API, ABI-stable), `node-addon-require-builtin` (platform-prebuilt addon), and
`@deepseek-ai/node-addon-landlock-run` (Linux-only sandbox launcher).

Two candidates:

- A. Bundle an official Node 22 LTS binary with the app and run the harness as
  a separate child process;
- B. Run the harness on Electron's embedded Node (`ELECTRON_RUN_AS_NODE=1`).

## Decision

Chose **A: bundled standalone Node 22 LTS (≥ 22.19)**:

- Identical to the upstream-supported way of running the harness — no new
  combination outside upstream's test matrix;
- Native modules install against the ordinary Node ABI; zero
  `@electron/rebuild`;
- Electron upgrades are fully decoupled from the harness runtime;
- Cost: roughly 30MB more per installer (compressed).

`scripts/fetch-node.mjs` downloads the official Node distribution
(npmmirror by default, `NODE_DIST_MIRROR` to override), verifies it against
`SHASUMS256.txt`, extracts it to `resources/harness/node/`, picks the latest
22.x LTS automatically, and records a provenance manifest.

## Consequences

- Positive: parity, no rebuilds, upgrade isolation;
- Negative: two runtimes (Electron + Node) and one Node download per platform;
  CI must reach the dist source, which the built-in SHA256 verification makes
  safe.

## Alternatives

- B (`ELECTRON_RUN_AS_NODE`): Electron ≥ 40 embeds Node 24, satisfying engines;
  smaller, but node-pty / require-builtin / landlock need `@electron/rebuild`
  and every Electron major bump re-verifies the ABI matrix — deferred as a
  future slim-down option, rejected for now;
- Embedding the harness in the Electron main process: ESM loader, native ABI,
  and process-ownership differences vs upstream — riskiest, rejected.

## Amendment 2026-08-14: pinned runtime

The staged Node was originally resolved dynamically (latest 22.x LTS at
bootstrap time), which made builds non-reproducible and let the checksum
arrive from the same mirror as the payload. The version and per-platform
SHA-256 are now pinned in `manifest/node-runtime.json`; mirrors only deliver
bytes that must match the committed hash. Maintainers bump the pin with
`node scripts/fetch-node.mjs --update-pin` against the official nodejs.org
dist.
