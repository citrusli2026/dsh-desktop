# Optional Windows whale companion (proposal)

This contribution adds a transparent, sandboxed companion window for a manually
installed `dsh-whale-widget` with the matching `/dsh-whale/pet` route. It does
not install the plugin, change the updater, or change application shutdown.

Set `DSH_DESKTOP_WHALE_PET=1` before starting the desktop shell on Windows.
Minimizing the main window shows the companion; restoring, hiding or closing
the main window hides it. The companion minus button restores the main window.
Its transparent regions pass mouse input through to the desktop.

The preload exposes only focus, hide, interactive-region state and an approval
request. IPC is accepted only from the companion's main frame. Approval actions
require the exact `data-approval-key` and an enabled allow-once/reject button
with a recognized Chinese or English label. Otherwise the main window opens for
confirmation; no positional button fallback is used.

The paired widget change passes the pending approval ID to `answerApproval`.
Until the Harness panel key contract is verified against the running release,
expect the manual-confirmation fallback. No direct question-answer UI is added.

Validation: `node --test test/whale-pet-policy.test.ts`; run the project's
typecheck, window lifecycle tests and build. Actual Windows GUI testing remains
required for click-through, monitor changes, high DPI, plugin absence and app
shutdown while the companion is visible.
