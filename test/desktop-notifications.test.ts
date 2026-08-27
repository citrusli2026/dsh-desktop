import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusWindowOnNotificationClick, normalizePublicStatusSnapshot, notificationsForPublicStatus } from '../src/main/desktop-notifications.ts'

test('notification click summons the shell window on every click', () => {
  let listener: (() => void) | undefined
  const notification = { on: (_event: string, next: () => void) => { listener = next } }
  let focused = 0
  focusWindowOnNotificationClick(notification, () => { focused += 1 })
  listener?.()
  listener?.()
  assert.equal(focused, 2)
})

test('normalizes public session and job state and drops malformed entries', () => {
  const snapshot = normalizePublicStatusSnapshot({
    sessions: [
      { id: 's1', title: '  A   task ', running: true, pendingInteraction: 'question', jobs: [
        { id: 'j1', label: 'worker', status: 'running' },
        { id: 'j2', label: 'bad', status: 'unknown' },
      ] },
      null,
      { id: '', title: 'ignored' },
    ],
  })
  assert.deepEqual(snapshot, {
    sessions: [{
      id: 's1', title: 'A task', running: true, pendingInteraction: 'question',
      jobs: [{ id: 'j1', label: 'worker', status: 'running' }],
    }],
  })
  assert.equal(normalizePublicStatusSnapshot({}), undefined)
  assert.equal(normalizePublicStatusSnapshot({ sessions: 'not an array' }), undefined)
})

test('reports only public state transitions after the initial baseline', () => {
  const baseline = normalizePublicStatusSnapshot({ sessions: [{ id: 's1', title: 'Research', running: true, jobs: [
    { id: 'done', label: 'Done job', status: 'running' },
    { id: 'failed', label: 'Failed job', status: 'running' },
    { id: 'killed', label: 'Killed job', status: 'stopping' },
  ] }] })!
  const next = normalizePublicStatusSnapshot({ sessions: [{ id: 's1', title: 'Research', running: false, jobs: [
    { id: 'done', label: 'Done job', status: 'completed' },
    { id: 'failed', label: 'Failed job', status: 'failed', detail: 'network error' },
    { id: 'killed', label: 'Killed job', status: 'killed' },
  ] }] })!
  assert.deepEqual(notificationsForPublicStatus(undefined, baseline, 'en'), [])
  assert.deepEqual(notificationsForPublicStatus(baseline, next, 'en'), [
    { title: 'Task completed', body: 'Research finished.' },
    { title: 'Background task completed', body: 'Done job finished.' },
    { title: 'Background task failed', body: 'Failed job: network error' },
    { title: 'Background task stopped', body: 'Killed job was stopped.' },
  ])
})

test('localizes input-required and failure notices', () => {
  const previous = normalizePublicStatusSnapshot({ sessions: [{ id: 's1', title: '计划', running: true, jobs: [{ id: 'j', label: '检索', status: 'running' }] }] })!
  const next = normalizePublicStatusSnapshot({ sessions: [{ id: 's1', title: '计划', running: false, pendingInteraction: 'approval', jobs: [{ id: 'j', label: '检索', status: 'failed' }] }] })!
  assert.deepEqual(notificationsForPublicStatus(previous, next, 'zh'), [
    { title: '需要你的确认', body: '计划等待你的确认。' },
    { title: '后台任务失败', body: '检索执行失败。' },
  ])
})
