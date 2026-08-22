/** Packaged E2E runner: sets DSH_E2E_PACKAGED and runs the @smoke subset,
 *  cross-platform (pwsh on Windows cannot prefix `VAR=1` before a command).
 *  Requires an unpacked build next to dist/ (dist:dir or the release build job).
 */
import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '--grep', '@smoke'],
  { stdio: 'inherit', shell: true, env: { ...process.env, DSH_E2E_PACKAGED: '1' } },
)
if (result.error) {
  console.error(`e2e-packaged: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
