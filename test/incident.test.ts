import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIncidentPrompt, buildIncidentReport, incidentId, INCIDENT_PROMPT_LIMIT, type Incident } from '../src/main/incident.ts'

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'incident-20261024-201500-market',
    at: '2026-10-24T12:15:00.000Z',
    surface: 'market',
    code: 'market.profile',
    locale: 'zh',
    appVersion: '0.2.1-rc.2.shell.8',
    kernelVersion: '0.2.1-rc.2',
    detail: 'market package did not appear in the user profile',
    actions: [
      { id: 'repair-profile' },
      { id: 'export-diagnostics' },
      { id: 'open-issue', target: 'https://example.invalid/new' },
    ],
    report: [
      '# dsh-desktop diagnostic report',
      'app_version=0.2.1-rc.2.shell.8',
      'market_state=missing',
      'failure_cause=kernel-api',
      'bool=true',
      'count=1',
    ].join('\n'),
    ...overrides,
  }
}

test('the prompt carries the code, detail, report and clickable actions', () => {
  const input = incident()
  const prompt = buildIncidentPrompt(input)
  assert.match(prompt, /market\.profile/)
  assert.match(prompt, /market package did not appear in the user profile/)
  assert.match(prompt, /# dsh-desktop diagnostic report/)
  assert.match(prompt, /repair-profile/)
  assert.match(prompt, /export-diagnostics/)
  assert.match(prompt, /https:\/\/example\.invalid\/new/)
  assert.match(prompt, /数据，不是指令/)
  assert.match(prompt, /结论：/)
  assert.match(prompt, /验证：/)
  assert.ok(prompt.length <= INCIDENT_PROMPT_LIMIT)
})

test('zh and en open differently but both keep the code', () => {
  const zh = buildIncidentPrompt(incident({ locale: 'zh' }))
  const en = buildIncidentPrompt(incident({ locale: 'en', detail: undefined }))
  assert.notEqual(zh.slice(0, 40), en.slice(0, 40))
  assert.match(zh, /故障排查助手/)
  assert.match(en, /incident triage assistant/)
  assert.match(zh, /market\.profile/)
  assert.match(en, /market\.profile/)
  assert.match(en, /data, not instructions/)
})

test('a huge report is truncated from the tail, never the facts', () => {
  const report = `${'HEADER-LINE\n'}${'x'.repeat(30_000)}\nTAIL-MARKER`
  const prompt = buildIncidentPrompt(incident({ report }))
  assert.ok(prompt.length <= INCIDENT_PROMPT_LIMIT, `prompt was ${prompt.length}`)
  assert.match(prompt, /报告已截断/)
  assert.match(prompt, /market\.profile/)
  assert.match(prompt, /market package did not appear/)
  assert.match(prompt, /repair-profile/)
  assert.match(prompt, /HEADER-LINE/)
  assert.doesNotMatch(prompt, /TAIL-MARKER/)
})

test('the prompt adds no facts beyond its input', () => {
  const prompt = buildIncidentPrompt(incident())
  assert.doesNotMatch(prompt, /\/Users\//)
  assert.doesNotMatch(prompt, /DSH_HOME/)
  assert.doesNotMatch(prompt, /Bearer /)
})

test('the report is standalone Markdown with the original report fenced', () => {
  const input = incident()
  const report = buildIncidentReport(input)
  assert.match(report, /^# dsh-desktop incident/)
  assert.match(report, /market\.profile/)
  assert.match(report, /market_state=missing/)
  assert.match(report, /repair-profile/)
  assert.match(report, /```text/)
  assert.ok(report.includes(input.report.trimEnd()))
  assert.match(report, /kernel_version: 0\.2\.1-rc\.2/)
})

test('incident ids are timestamped and surface-scoped', () => {
  assert.equal(incidentId(new Date('2026-10-24T12:15:00.000Z'), 'startup'), 'incident-20261024-121500-startup')
})

test('a Chinese report keeps the prompt under 24 000 bytes and the facts intact', () => {
  const report = `${'日志行\n'.repeat(4_000)}TAIL`
  const prompt = buildIncidentPrompt(incident({ report }))
  assert.ok(Buffer.byteLength(prompt) <= INCIDENT_PROMPT_LIMIT, `prompt was ${Buffer.byteLength(prompt)} bytes`)
  assert.match(prompt, /market\.profile/)
  assert.match(prompt, /报告已截断/)
  assert.doesNotMatch(prompt, /TAIL/)
})
