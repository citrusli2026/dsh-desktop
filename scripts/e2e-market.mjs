/** Cross-platform launcher for the packaged market-install E2E variants. */
import { spawn } from 'node:child_process'

const mode = process.argv[2]
if (mode !== 'offline' && mode !== 'real') {
  throw new Error('usage: node scripts/e2e-market.mjs <offline|real>')
}
const tag = mode === 'offline' ? '@market-offline' : '@market-real'
const child = spawn(
  process.execPath,
  ['scripts/run-e2e-guarded.mjs', 'e2e/market-install.spec.ts', '--grep', tag],
  { stdio: 'inherit', env: { ...process.env, DSH_E2E_MARKET_MODE: mode } },
)
child.once('error', error => {
  console.error(`e2e-market: ${error.message}`)
  process.exit(1)
})
child.once('exit', code => process.exit(code ?? 1))
