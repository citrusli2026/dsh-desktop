import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  renderHookCommand,
  renderHooksJson,
  renderTrashHookPatch,
  trashHookConfigPath,
  trashHookPatchPath,
  writeTrashHookFiles,
} from '../src/main/trash-hook.ts'

function spacesPaths(root: string) {
  return {
    nodePath: join(root, 'Program Files', 'node.exe'),
    hookScriptPath: join(root, 'agent files', "hook's script.mjs"),
    userData: join(root, 'user data'),
  }
}

test('renderHookCommand quotes spaces and apostrophes for POSIX shells', () => {
  const paths = spacesPaths('/tmp/root')
  assert.equal(
    renderHookCommand(paths, 'linux'),
    "'/tmp/root/Program Files/node.exe' '/tmp/root/agent files/hook'\\''s script.mjs'",
  )
})

test('renderHookCommand uses PowerShell quoting and the call operator on Windows', () => {
  const paths = {
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    hookScriptPath: "C:\\Users\\O'Brien\\hook script.mjs",
  }
  assert.equal(
    renderHookCommand(paths, 'win32'),
    "& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\Users\\O''Brien\\hook script.mjs'",
  )
})

test('renderHooksJson embeds the quoted command and the patch points at hooks.json', () => {
  const paths = spacesPaths('/tmp/root')
  const document = JSON.parse(renderHooksJson(paths, 'linux')) as {
    hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
  }
  assert.equal(document.hooks.PreToolUse[0]?.hooks[0]?.command, renderHookCommand(paths, 'linux'))
  assert.match(renderTrashHookPatch(paths), /agent-trash-hooks.hooks.json/)
  assert.equal(trashHookConfigPath(paths), join(paths.userData, 'agent-trash-hooks', 'hooks.json'))
  assert.equal(trashHookPatchPath(paths), join(paths.userData, 'agent-trash-hook.patch.yml'))
})

test('writeTrashHookFiles materializes both files under userData', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-trash-hook-config-'))
  try {
    const paths = spacesPaths(root)
    const patch = writeTrashHookFiles(paths, 'linux')
    assert.equal(patch, trashHookPatchPath(paths))
    assert.match(await readFile(trashHookConfigPath(paths), 'utf8'), /PreToolUse/)
    assert.match(await readFile(patch, 'utf8'), /dsh-desktop-trash-hook/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the generated POSIX command runs a script path with spaces and apostrophes', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh hook spaces '))
  try {
    const script = join(root, "hook's script.mjs")
    const marker = join(root, 'marker.txt')
    await writeFile(script, `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'ok')\n`)
    const command = renderHookCommand({ nodePath: process.execPath, hookScriptPath: script }, 'linux')
    execFileSync('/bin/sh', ['-c', command])
    assert.equal(await readFile(marker, 'utf8'), 'ok')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
