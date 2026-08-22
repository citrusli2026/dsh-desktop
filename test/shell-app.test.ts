import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isShellOwnedFrame, ShellApp, type ShellAppServices } from '../src/main/shell-app.ts'
import type { HarnessState, HarnessSupervisor } from '../src/main/supervisor.ts'

class FakeSupervisor {
  static instances: FakeSupervisor[] = []
  /** Shared config consumed by the next start(); cleared after one use. */
  static nextStartResult: { url?: string; error?: Error } = {}
  onState!: (state: HarnessState) => void
  stopCalls = 0
  constructor(onState: (state: HarnessState) => void) {
    this.onState = onState
    FakeSupervisor.instances.push(this)
  }
  start(): Promise<string> {
    const result = FakeSupervisor.nextStartResult
    FakeSupervisor.nextStartResult = {}
    this.onState({ phase: 'starting' })
    if (result.error !== undefined) return Promise.reject(result.error)
    const url = result.url ?? 'http://127.0.0.1:1234'
    this.onState({ phase: 'ready', url })
    return Promise.resolve(url)
  }
  stop(): Promise<void> {
    this.stopCalls += 1
    return Promise.resolve()
  }
}

interface Harness {
  app: ShellApp
  applied: HarnessState[]
  busyChanges: number
  lanRestarts: number
  confirmations: number
  confirmResult: boolean
}

function makeHarness(): Harness {
  FakeSupervisor.instances = []
  FakeSupervisor.nextStartResult = {}
  const harness: Harness = {
    applied: [],
    busyChanges: 0,
    lanRestarts: 0,
    confirmations: 0,
    confirmResult: true,
    app: undefined as unknown as ShellApp,
  }
  const services: ShellAppServices = {
    createSupervisor: onState => new FakeSupervisor(onState) as unknown as HarnessSupervisor,
    onStateApplied: state => { harness.applied.push(state) },
    onRestartBusyChanged: () => { harness.busyChanges += 1 },
    restartLanProxy: async () => { harness.lanRestarts += 1 },
    confirmRestart: async () => { harness.confirmations += 1; return harness.confirmResult },
  }
  harness.app = new ShellApp(services)
  return harness
}

test('applyState records state and notifies the surfaces', () => {
  const harness = makeHarness()
  harness.app.applyState({ phase: 'ready', url: 'http://127.0.0.1:1' })
  assert.deepEqual(harness.applied, [{ phase: 'ready', url: 'http://127.0.0.1:1' }])
  assert.deepEqual(harness.app.state, { phase: 'ready', url: 'http://127.0.0.1:1' })
})

test('applyState restarts the LAN proxy when the ready URL changes', async () => {
  const harness = makeHarness()
  harness.app.applyState({ phase: 'ready', url: 'http://127.0.0.1:1' })
  assert.equal(harness.lanRestarts, 0)
  harness.app.applyState({ phase: 'ready', url: 'http://127.0.0.1:2' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.lanRestarts, 1)
  harness.app.applyState({ phase: 'ready', url: 'http://127.0.0.1:2' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.lanRestarts, 1, 'same URL must not restart the proxy')
})

test('restartEnabled gates on state and in-flight restart', () => {
  const harness = makeHarness()
  assert.equal(harness.app.restartEnabled(), false, 'no state yet')
  harness.app.applyState({ phase: 'starting' })
  assert.equal(harness.app.restartEnabled(), false, 'starting phase')
  harness.app.applyState({ phase: 'ready', url: 'http://127.0.0.1:1' })
  assert.equal(harness.app.restartEnabled(), true)
})

test('runHarnessRestart is single-flight and replaces the supervisor', async () => {
  const harness = makeHarness()
  await harness.app.startHarness()
  harness.app.applyState({ phase: 'ready', url: 'http://127.0.0.1:1' })
  const first = harness.app.runHarnessRestart()
  const second = harness.app.runHarnessRestart()
  assert.equal(first, second, 'concurrent restarts share one promise')
  assert.equal(harness.app.restartInFlight, true)
  assert.equal(await first, true)
  assert.equal(harness.app.restartInFlight, false)
  assert.equal(FakeSupervisor.instances.length, 2)
  assert.equal(FakeSupervisor.instances[0]!.stopCalls, 1, 'old supervisor stopped')
})

test('runHarnessRestart reports crashed state and false on start failure', async () => {
  const harness = makeHarness()
  await harness.app.startHarness()
  FakeSupervisor.nextStartResult = { error: new Error('boom') }
  assert.equal(await harness.app.runHarnessRestart(), false)
  assert.deepEqual(harness.applied.at(-1), { phase: 'crashed', attempts: 0, logTail: 'boom' })
})

test('requestRestart from a crashed state restarts without a dialog', async () => {
  const harness = makeHarness()
  harness.app.applyState({ phase: 'crashed', attempts: 1, logTail: 'x' })
  await harness.app.requestRestart()
  assert.equal(harness.confirmations, 0)
  assert.equal(FakeSupervisor.instances.length, 1, 'restart ran without confirmation')
})

test('requestRestart cancels when the user declines the dialog', async () => {
  const harness = makeHarness()
  await harness.app.startHarness()
  harness.confirmResult = false
  await harness.app.requestRestart()
  assert.equal(harness.confirmations, 1)
  assert.equal(FakeSupervisor.instances.length, 1, 'no restart after declining')
})

test('requestRestart confirms and restarts when the user accepts', async () => {
  const harness = makeHarness()
  await harness.app.startHarness()
  await harness.app.requestRestart()
  assert.equal(harness.confirmations, 1)
  assert.equal(FakeSupervisor.instances.length, 2, 'restart ran after confirmation')
})

test('startHarness returns the ready URL and applies the crashed state on failure', async () => {
  const harness = makeHarness()
  const url = await harness.app.startHarness()
  assert.equal(url, 'http://127.0.0.1:1234')
  FakeSupervisor.nextStartResult = { error: new Error('no harness') }
  await assert.rejects(harness.app.startHarness(), /no harness/)
  assert.deepEqual(harness.applied.at(-1), { phase: 'crashed', attempts: 0, logTail: 'no harness' })
})

test('stopHarness stops the live supervisor and is safe to repeat', async () => {
  const harness = makeHarness()
  await harness.app.startHarness()
  await harness.app.stopHarness()
  assert.equal(FakeSupervisor.instances[0]!.stopCalls, 1)
  // A second stop is safe (never rejects) even though the supervisor is idle.
  await harness.app.stopHarness()
  await harness.app.stopHarness()
})

test('isShellOwnedFrame accepts only data: URLs', () => {
  assert.equal(isShellOwnedFrame('data:text/html,hello'), true)
  assert.equal(isShellOwnedFrame('http://127.0.0.1:1234/'), false)
  assert.equal(isShellOwnedFrame(undefined), false)
})
