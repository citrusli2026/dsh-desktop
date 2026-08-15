import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HarnessSupervisor, type HarnessState } from '../src/main/supervisor.ts'

async function fixture(args: readonly string[], readyTimeoutMs = 2_000): Promise<{
  supervisor: HarnessSupervisor
  states: HarnessState[]
  logDir: string
}> {
  const logDir = await mkdtemp(join(tmpdir(), 'dsh-supervisor-'))
  const states: HarnessState[] = []
  const supervisor = new HarnessSupervisor(
    { onState: state => states.push(state) },
    { command: process.execPath, args, logDir, env: {}, readyTimeoutMs },
  )
  return { supervisor, states, logDir }
}

test('supervisor resolves the ready URL and records output', async () => {
  const { supervisor, states, logDir } = await fixture([
    '-e',
    "console.log('booting');console.log('dsh web: http://127.0.0.1:43123');setInterval(()=>{},1000)",
  ])
  try {
    assert.equal(await supervisor.start(), 'http://127.0.0.1:43123')
    assert.deepEqual(states.map(state => state.phase), ['starting', 'ready'])
  } finally {
    await supervisor.stop()
  }
  const log = await readFile(join(logDir, 'harness.log'), 'utf8')
  assert.match(log, /booting/)
  assert.match(log, /dsh web: http:\/\/127\.0\.0\.1:43123/)
})

test('supervisor rejects a process that exits before readiness', async () => {
  const { supervisor } = await fixture(['-e', "console.error('fixture failed');process.exit(7)"])
  await assert.rejects(supervisor.start(), /harness exited before ready \(code 7/)
  await supervisor.stop()
})

test('supervisor rejects when readiness exceeds the injected timeout', async () => {
  const { supervisor } = await fixture(['-e', 'setInterval(()=>{},1000)'], 40)
  await assert.rejects(supervisor.start(), /harness not ready within 40 ms/)
  await supervisor.stop()
})

test('stop is safe before a child is started', async () => {
  const { supervisor } = await fixture(['-e', 'process.exit(0)'])
  await Promise.all([supervisor.stop(), supervisor.stop()])
})
