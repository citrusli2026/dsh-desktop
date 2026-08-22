import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { InFlight, ManagedChild } from '../src/main/process-lifecycle.ts'

/** A child that stays alive until killed. */
function sleeper(): ChildProcess {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
}

function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

test('ManagedChild.spawn tracks running state and clears the slot on exit', async () => {
  const managed = new ManagedChild()
  assert.equal(managed.running, false)
  const child = managed.spawn({ command: process.execPath, args: ['-e', ''] })
  assert.equal(managed.running, true)
  assert.equal(managed.process, child)
  await new Promise<void>(resolve => child.once('exit', () => resolve()))
  assert.equal(managed.running, false)
  assert.equal(managed.process, undefined)
})

test('ManagedChild.stop terminates a running child with SIGTERM', async () => {
  const managed = new ManagedChild()
  const child = managed.spawn({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], windowsHide: false })
  await managed.stop(5_000)
  assert.equal(exited(child), true)
})

test('ManagedChild.stop escalates to SIGKILL when the child ignores SIGTERM', async () => {
  const managed = new ManagedChild()
  // Ignore SIGTERM so only the SIGKILL fallback can stop it. Wait for the
  // handler to register before stopping: a SIGTERM delivered during Node's
  // startup bootstrap is handled by the default handler and exits normally.
  const child = managed.spawn({
    command: process.execPath,
    args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
    windowsHide: false,
  })
  await new Promise<void>(resolve => child.once('spawn', () => setTimeout(resolve, 150)))
  const started = Date.now()
  await managed.stop(120)
  assert.equal(exited(child), true)
  assert.ok(Date.now() - started >= 100, 'must wait the grace budget before killing')
})

test('ManagedChild.stop is safe and deduplicated', async () => {
  const managed = new ManagedChild()
  const child = managed.spawn({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], windowsHide: false })
  const first = managed.stop(1_000)
  const second = managed.stop(1_000)
  assert.equal(first, second, 'concurrent stops share one promise')
  await first
  assert.equal(exited(child), true)
  // Stopping again with no child resolves immediately and never rejects.
  await managed.stop(1_000)
})

test('ManagedChild.stop with no child resolves immediately', async () => {
  const managed = new ManagedChild()
  await managed.stop(1_000)
})

test('InFlight shares one in-flight task and clears when it settles', async () => {
  const slot = new InFlight<string>()
  assert.equal(slot.pending, false)
  const task = new Promise<string>(resolve => setTimeout(() => resolve('done'), 20))
  const tracked = slot.track(task)
  assert.equal(slot.pending, true)
  assert.equal(slot.current, tracked)
  const again = slot.track(task)
  assert.equal(again, tracked, 'tracking the same task is a no-op')
  await task
  // Give the settle microtask a chance to run.
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(slot.pending, false)
  assert.equal(slot.current, undefined)
})

test('InFlight clears after a rejected task too', async () => {
  const slot = new InFlight<number>()
  await assert.rejects(slot.track(Promise.reject(new Error('boom'))), /boom/)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(slot.pending, false)
})
