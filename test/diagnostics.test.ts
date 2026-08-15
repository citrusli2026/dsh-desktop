import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatDiagnosticReport, readLogTail, redactDiagnosticsLog, rotateLogFiles } from '../src/main/diagnostics.ts'

test('redactDiagnosticsLog masks credentials and the home path', () => {
  const redacted = redactDiagnosticsLog('/Users/test/project\nAuthorization: Bearer abc.def\napi_key=secret', '/Users/test')
  assert.equal(redacted, '~/project\nAuthorization: Bearer [REDACTED]\napi_key=[REDACTED]')
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
