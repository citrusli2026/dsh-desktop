/** The release tooling must work on a bare checkout, before `pnpm install`. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPTS = ['version.mjs', 'release-shape.mjs', 'kernel-peers.mjs', 'kernel-patches.mjs']

test('version.mjs runs on a checkout with no installed dependencies', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'dsh-bare-checkout-'))
  t.after(() => rm(checkout, { recursive: true, force: true }))
  await mkdir(join(checkout, 'scripts'))
  await mkdir(join(checkout, 'manifest', 'harness'), { recursive: true })
  for (const script of SCRIPTS) {
    await copyFile(join(root, 'scripts', script), join(checkout, 'scripts', script))
  }
  await writeFile(join(checkout, 'package.json'), JSON.stringify({ version: '0.2.1-rc.2.shell.10' }))
  await writeFile(
    join(checkout, 'manifest', 'harness', 'package.json'),
    JSON.stringify({ dependencies: { '@deepseek-ai/dsh': '0.2.1-rc.2' } }),
  )

  // dsh-watch runs `version.mjs check` before `pnpm install`. A static import of
  // a node_modules dependency (kernel-patches.mjs imports `yaml`) made that step
  // die with ERR_MODULE_NOT_FOUND, which the workflow read as a registry outage
  // and turned into a failed daily run.
  const { stdout } = await run(process.execPath, ['scripts/version.mjs', 'show'], { cwd: checkout })
  assert.match(stdout, /version: package\.json = 0\.2\.1-rc\.2\.shell\.10/)
  assert.match(stdout, /version: consistent/)
})
