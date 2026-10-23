/** Opt-in release gate for the third-party whale plugin (see docs/companion-windows.md). */
import { spawn } from 'node:child_process'

if (!process.env.WHALE_PLUGIN_DIR) {
  console.error('WHALE_PLUGIN_DIR is required: point it at a prepared dsh-whale-widget checkout.')
  process.exit(2)
}
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(command, [
  'exec', 'playwright', 'test', 'e2e/whale-companion.spec.ts', ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: { ...process.env, DSH_E2E_PACKAGED: '1' },
  shell: process.platform === 'win32',
})
child.on('exit', code => process.exit(code ?? 1))
