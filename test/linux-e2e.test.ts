import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

test('Linux E2E uses an owned, readiness-checked window manager and retains minimize assertions', async () => {
  const helper = await readFile('scripts/run-e2e-linux.sh', 'utf8')
  assert.match(helper, /_NET_SUPPORTING_WM_CHECK/)
  assert.match(helper, /openbox/)
  assert.match(helper, /kill "\$dsh_e2e_wm_pid"/)
  assert.doesNotMatch(helper, /pkill|killall/)
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    const workflow = parse(await readFile(file, 'utf8'))
    const steps = Object.values(workflow.jobs).flatMap((job: any) => job.steps ?? []) as any[]
    assert.ok(steps.some(step => step.run?.includes('install -y openbox x11-utils')))
    assert.ok(steps.some(step => step.run?.includes('xvfb-run -a sh scripts/run-e2e-linux.sh')))
  }
  const e2e = await readFile('e2e/electron-shell.spec.ts', 'utf8')
  // The main window is addressed by URL now (the whale companion can become
  // window[0]); the minimize assertion is retained.
  assert.match(e2e, /mainState\(\)\)\?\.minimized\)\.toBe\(true\)/)
  assert.match(e2e, /a real second instance[\s\S]*?\.hide\(\)[\s\S]*?expect\(exited\).not.toBeNull\(\)/)
  const release = parse(await readFile('.github/workflows/release.yml', 'utf8'))
  assert.equal(release.jobs['report-failure'].if, "${{ failure() && github.ref_type == 'tag' }}")
})
