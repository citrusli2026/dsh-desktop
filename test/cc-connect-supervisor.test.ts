import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConnectSupervisor, type ConnectState } from '../src/main/cc-connect-supervisor.ts'

const SECRET = 'fake-sidecar-secret'

async function fixture(script: string, extra: Record<string, unknown> = {}): Promise<{
  supervisor: ConnectSupervisor
  states: ConnectState[]
  logDir: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'cc-connect-supervisor-'))
  const states: ConnectState[] = []
  const supervisor = new ConnectSupervisor(
    { onState: state => states.push(state) },
    {
      command: process.execPath,
      args: ['-e', script],
      logDir: join(root, 'logs'),
      env: { DSH_CC_CONNECT_FEISHU_SECRET: SECRET, ...extra },
      readyTimeoutMs: 500,
      restartBaseDelayMs: 15,
      restartMaxDelayMs: 30,
      restartWindowMs: 2_000,
      maxRestarts: 2,
    },
  )
  return { supervisor, states, logDir: join(root, 'logs') }
}

test('disabled sidecar does not spawn and reports disabled', async () => {
  const { supervisor, states } = await fixture('throw new Error("must not spawn")', { CONNECT_ENABLED: '0' })
  supervisor.setEnabled(false)
  assert.equal(await supervisor.start(), false)
  assert.deepEqual(states, [{ phase: 'disabled' }])
  await supervisor.stop()
})

test('sidecar resolves readiness from stderr and records redacted output', async () => {
  const { supervisor, states, logDir } = await fixture("console.error('boot secret='+process.env.DSH_CC_CONNECT_FEISHU_SECRET); console.error('time=now level=INFO msg=\\\"cc-connect ready\\\" projects=1'); setInterval(()=>{},1000)")
  try {
    assert.equal(await supervisor.start(), true)
    const ready = states.at(-1)
    assert.equal(ready?.phase, 'ready')
    if (ready?.phase === 'ready') assert.equal(ready.restartAttempts, 0)
  } finally {
    await supervisor.stop()
  }
  const log = await readFile(join(logDir, 'cc-connect.log'), 'utf8')
  assert.doesNotMatch(log, new RegExp(SECRET))
  assert.match(log, /cc-connect ready/)
  await rm(logDir, { recursive: true, force: true })
})

test('sidecar retries a crash with bounded backoff and eventually becomes ready', async () => {
  const marker = join(await mkdtemp(join(tmpdir(), 'cc-connect-retry-')), 'started')
  const script = "const fs=require('node:fs'); if (!fs.existsSync(process.env.CONNECT_MARKER)) { fs.writeFileSync(process.env.CONNECT_MARKER, '1'); process.exit(2) } console.error('cc-connect ready projects=1'); setInterval(()=>{},1000)"
  const { supervisor, states } = await fixture(script, { CONNECT_MARKER: marker })
  try {
    assert.equal(await supervisor.start(), true)
    assert.ok(states.some(state => state.phase === 'starting' && state.stage === 'retrying'))
    assert.equal(states.at(-1)?.phase, 'ready')
  } finally {
    await supervisor.stop()
    await rm(marker, { force: true })
    await rm(join(marker, '..'), { recursive: true, force: true })
  }
})

test('sidecar reports crashed after the restart budget is exhausted', async () => {
  const { supervisor, states } = await fixture('process.exit(3)')
  await assert.rejects(supervisor.start(), /cc-connect restart budget exhausted/)
  const crashed = states.at(-1)
  assert.equal(crashed?.phase, 'crashed')
  if (crashed?.phase === 'crashed') assert.equal(crashed.restartAttempts, 3)
  await supervisor.stop()
})

test('stop is idempotent and concurrent start/stop share one operation', async () => {
  const { supervisor } = await fixture('setInterval(()=>{},1000)')
  const first = supervisor.start()
  const second = supervisor.start()
  assert.strictEqual(first, second)
  const stopping = supervisor.stop()
  await assert.rejects(first, /cc-connect stopped before ready/)
  await Promise.all([stopping, supervisor.stop()])
  assert.equal(await supervisor.stop(), undefined)
})
