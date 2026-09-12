import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const hookScript = resolve('resources/agent-trash-hook/agent-trash-hook.mjs')

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

function runHook(command: string, dshHome: string, projectDir: string) {
  return new Promise<{ code: number; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [hookScript], {
      cwd: projectDir,
      env: { ...process.env, DSH_HOME: dshHome, CLAUDE_PROJECT_DIR: projectDir },
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('close', code => resolvePromise({ code: code ?? -1, stderr }))
    child.stdin.end(JSON.stringify({ tool_input: { command } }))
  })
}

test('the real hook moves a deleted file into the trash and records it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-hook-process-'))
  try {
    const projectDirRaw = join(root, 'project dir')
    const dshHome = join(root, 'dsh home')
    await mkdir(projectDirRaw, { recursive: true })
    const projectDir = await realpath(projectDirRaw)
    const target = join(projectDir, 'delete me.txt')
    await writeFile(target, 'keep')
    const result = await runHook('rm "delete me.txt"', dshHome, projectDir)
    assert.equal(result.code, 0)
    assert.equal(await exists(target), false)
    const index = JSON.parse(await readFile(join(dshHome, 'trash', 'index.json'), 'utf8')) as Array<{ id: string; originPath: string }>
    assert.equal(index.length, 1)
    assert.equal(index[0]?.originPath, target)
    assert.equal(await exists(join(dshHome, 'trash', 'items', index[0]?.id ?? '')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the real hook blocks an exempt deletion and keeps the target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-hook-block-'))
  try {
    const projectDirRaw = join(root, 'project')
    await mkdir(projectDirRaw, { recursive: true })
    const projectDir = await realpath(projectDirRaw)
    const dshHome = join(root, 'home')
    await mkdir(join(projectDir, 'node_modules'), { recursive: true })
    await writeFile(join(projectDir, 'node_modules', 'x.txt'), 'keep')
    const result = await runHook('rm -rf node_modules', dshHome, projectDir)
    assert.equal(result.code, 2)
    assert.match(result.stderr, /desktop trash/)
    assert.equal(await exists(join(projectDir, 'node_modules', 'x.txt')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the real hook rolls the file back when the trash index cannot be written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-hook-rollback-'))
  try {
    const projectDirRaw = join(root, 'project')
    await mkdir(projectDirRaw, { recursive: true })
    const projectDir = await realpath(projectDirRaw)
    const dshHome = join(root, 'home')
    await mkdir(projectDir, { recursive: true })
    const target = join(projectDir, 'keep.txt')
    await writeFile(target, 'keep')
    await mkdir(join(dshHome, 'trash', 'index.json'), { recursive: true })
    const result = await runHook('rm keep.txt', dshHome, projectDir)
    assert.equal(result.code, 2)
    assert.match(result.stderr, /could not move/)
    assert.equal(await exists(target), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
