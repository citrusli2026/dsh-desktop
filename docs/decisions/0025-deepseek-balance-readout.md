# 0025: DeepSeek balance readout in tray and extension settings

- Date: 2026-08-29
- Status: accepted
- 中文:[0025](0025-deepseek-balance-readout.zh.md)

## Context

Community shells treat balance/cost visibility as a low-cost, high-perception
feature (myYangyunfan's balance widget, GeekRicardo's dsh-balance plugin,
AppliedYuu's merged wallpaper+cost plugin). We ship none: a user must open
the DeepSeek platform to learn whether their credits are about to run out.

## Decision

- The shell reads the DeepSeek key from the harness credential store
  (`.credentials.yaml`, `refs.DEEPSEEK_API_KEY`) and queries the official
  user-balance API — fetch on demand with a five-minute cache and in-flight
  dedupe; no background polling, the key never leaves the main process
  except to that API.
- Two surfaces: a tray line (`余额：¥…`, clicking opens the DeepSeek
  platform recharge page) placed after the harness status, and a read-only
  余额 row with a 充值 button in the extension settings section.
- No key configured, network failure, or malformed payload → the surfaces
  disappear. No error surfaces, no empty-state noise.

## Consequences

- Positive: the balance is visible in the two shells-owned surfaces without
  touching the harness Web UI; the recharge action is one click away.
- Negative: DeepSeek-only (multi-provider coverage remains the
  dsh-market ecosystem's job); the tray line can be up to one cache TTL
  stale; a tray menu opened before the first fetch lands shows no line
  until the next rebuild.

## Alternatives

- Ship dsh-balance as a seeded bundle: its npm package declares no license
  field (rejected for vendoring in 0024), and it duplicates what a tray
  line does natively;
- Poll the API in the background for low-balance notifications: costs
  requests for value we have not validated — deferred.
