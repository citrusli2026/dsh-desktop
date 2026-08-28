/**
 * Shared smoke-test protocol between the built-in smoke mode (src/main/smoke.ts
 * and its callers) and the packaged-smoke driver (scripts/smoke-packaged.mjs).
 * One definition of the flag, the test-injection environment variables, and
 * the exit codes, so the contract cannot drift between the app and the script.
 * No imports, no I/O — safe to load from a plain Node script.
 * @module main/smoke-protocol
 */

/** Command-line flag that puts the app into headless smoke mode. */
export const SMOKE_FLAG = '--smoke-test'

/** Smoke-mode variant: additionally verify the real Harness UI renders. */
export const SMOKE_UI_FLAG = '--smoke-ui'

/** Exit code when smoke assertions pass. */
export const SMOKE_EXIT_OK = 0

/** Exit code when any smoke assertion fails. */
export const SMOKE_EXIT_FAIL = 1

/** Test injection: force boot to fail as if the harness crashed. */
export const TEST_FAIL_HARNESS_ENV = 'DSH_DESKTOP_TEST_FAIL_HARNESS'

/** Test injection: make the error-page retry fail once (retry recovery path). */
export const TEST_RETRY_FAIL_ENV = 'DSH_DESKTOP_TEST_RETRY_FAIL'

/** Dev-mode override: load an external web URL instead of the bundled harness. */
export const DEV_WEB_URL_ENV = 'DSH_DESKTOP_DEV_WEB_URL'

/** Smoke variant: additionally assert the Safe Mode banner rests in the DOM. */
export const SMOKE_SAFE_ENV = 'DSH_DESKTOP_SMOKE_SAFE'
