# 0035: Host-owned session trash transactions

- Date: 2026-10-11
- Status: Accepted
- 中文：[0035](0035-host-owned-session-trash.zh.md)

Moving a session directory alone leaves a live Host Session and the Client's selected conversation resident.
The pinned kernel exposes refresh/archive capabilities, but no removal operation; only the creating
API Session owner holds `AgentHandle.dispose()`. A list filter, restart, or private registry mutation
would hide the defect without coordinating ownership.

We ship a narrow, checked-in, version-bound lifecycle extension in the **bundled closure**. It retains
handles at their existing owner, reserves idle maintenance, flushes before moving, and tears down only
the exact owned idle handle. Running/queued work, concurrent activation, another writer or owner are
refused. Cold sessions retain the persistence service's cross-process write claim through the operation.
The UI selection owner releases an explicitly removed main-view reference; the desktop plugin does not
write navigation internals. Workspace archive mutations use the Host service, not `workspace.json` edits.

This is an explicit, limited exception to ADR 0005's byte-for-byte upstream closure. The transform is
applied by deploy/build, idempotent, and fails on unknown versions/anchors. There is no dependency upgrade,
second session database, or patching of user-installed kernel overlays. An overlay without the capability
must refuse deletion; returning to the bundled kernel is the safe path. Replace the extension with an
upstream public capability after equivalent ownership, failure and real-sidebar regressions pass.

The main-window Harness sender guard remains the authorization boundary. Main calls a private loopback
Host transport with a random per-app token that is never sent to the renderer or logs; the endpoint is
invalidated on every child boundary. Host serializes these operations and uses the same bundled disk
helpers as main. Resource notifications carry home and identity; clients pull authoritative state and
discard superseded panel reads. A failed sync is retryable and must not be shown as fully complete.

Real Electron/Harness tests use temporary homes and a local mock model, check deletion/restoration/
unarchive against actual title rows and selected details, and prove active work is refused without stopping it.
TR-03 adds a shared cross-process index lock and identity-preserving restores: session conflicts are
refused, never numbered copies. Registry/index failures roll back the moved payload. Recovery metadata
is recorded before deletion; if a new origin prevents rollback, the original remains indexed in trash.
Parents with resident or persisted children are refused; users must handle children first. No tree is
silently deleted, no child is forced to stop, and ordinary files retain numbered conflict recovery.
