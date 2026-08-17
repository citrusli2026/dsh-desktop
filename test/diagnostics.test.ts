import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatDiagnosticReport, readLogTail, redactDiagnosticsLog, RollingLogWriter, rotateLogFiles } from '../src/main/diagnostics.ts'

test('redactDiagnosticsLog masks credentials and the home path', () => {
  const redacted = redactDiagnosticsLog('/Users/test/project\nAuthorization: Bearer abc.def\napi_key=secret', '/Users/test')
  assert.equal(redacted, '~/project\nAuthorization: Bearer [REDACTED]\napi_key=[REDACTED]')

  const structured = redactDiagnosticsLog('{"apiKey":"json-secret","DSH_REMOTE_TOKEN":"remote-secret"}\nOPENAI_API_KEY=sk-1234567890abcdef')
  assert.doesNotMatch(structured, /json-secret|remote-secret|sk-1234567890abcdef/)
  assert.match(structured, /apiKey.*\[REDACTED\]/)
})

test('redactDiagnosticsLog masks Bearer tokens with base64 padding and JWT shapes', () => {
  // The Bearer character class must include '=' so base64-padded tokens
  // (e.g. "abc==") and JWTs are fully redacted, not truncated at the padding.
  const cases = [
    'Authorization: Bearer abc==',
    'Authorization: Bearer aaa.bbb.ccc==',
    'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxw==',
    'token=Bearer dQw4w9WgXcQ',
  ]
  for (const raw of cases) {
    const redacted = redactDiagnosticsLog(raw, '/nonexistent')
    assert.doesNotMatch(redacted, /abc==|aaa\.bbb\.ccc==|eyJhbGci|dQw4w9WgXcQ/, `leak in: ${raw}`)
    assert.match(redacted, /\[REDACTED\]/, `no redaction marker in: ${raw}`)
  }
})

test('redactDiagnosticsLog masks OpenAI-style keys spanning word boundaries', () => {
  // sk- keys use [A-Za-z0-9_-]; ensure trailing dashes or underscores do not
  // leave a fragment unmasked.
  const redacted = redactDiagnosticsLog('sk-1234567890abcdef-ABCD', '/nonexistent')
  assert.doesNotMatch(redacted, /1234567890abcdef-ABCD/)
  assert.match(redacted, /\[REDACTED\]/)
})

test('readLogTail bounds the report to the newest complete lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-diagnostics-'))
  const path = join(dir, 'harness.log')
  await writeFile(path, 'first\nsecond\nthird\n')
  assert.match(readLogTail(path, 15), /earlier bytes omitted/)
  assert.match(readLogTail(path, 15), /second\nthird/)
})

test('rotateLogFiles keeps a bounded numbered history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-log-rotation-'))
  const path = join(dir, 'harness.log')
  await writeFile(path, 'current')
  await writeFile(`${path}.1`, 'previous')
  rotateLogFiles(path, 1, 2)
  assert.equal(await readFile(`${path}.1`, 'utf8'), 'current')
  assert.equal(await readFile(`${path}.2`, 'utf8'), 'previous')
})

test('RollingLogWriter rotates during a long-running process', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-rolling-log-'))
  const path = join(dir, 'harness.log')
  const writer = new RollingLogWriter(path, 8, 2)
  writer.write('first')
  writer.write('second')
  await writer.close()
  assert.equal(await readFile(`${path}.1`, 'utf8'), 'first\n')
  assert.equal(await readFile(path, 'utf8'), 'second\n')
})

test('formatDiagnosticReport records versions and crash state without upload', () => {
  const report = formatDiagnosticReport({
    createdAt: '2026-08-15T00:00:00.000Z',
    appVersion: '1.0.0.shell.1', electronVersion: '43.0.0', chromiumVersion: '142', nodeVersion: '22',
    platform: 'darwin', platformRelease: '25.0.0', arch: 'arm64',
    harnessState: { phase: 'crashed', attempts: 6, logTail: 'ignored' }, logTail: 'hello',
  })
  assert.match(report, /app_version=1\.0\.0\.shell\.1/)
  assert.match(report, /harness_state=crashed \(attempts=6\)/)
  assert.match(report, /uploaded_automatically=false/)
})
