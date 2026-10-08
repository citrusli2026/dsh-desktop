import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve('test')
const contract = resolve('test/dsh-acp-contract.test.ts')

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectTests(path))
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(path)
  }
  return files.sort()
}

function runNode(args) {
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' })
    child.once('error', () => resolveResult(1))
    child.once('exit', (code, signal) => resolveResult(code ?? (signal === null ? 1 : 1)))
  })
}

const tests = await collectTests(root)
const coverageTests = tests.filter(path => path !== contract)
const coverageExit = await runNode([
  '--test',
  '--test-concurrency=1',
  '--experimental-test-coverage',
  '--test-coverage-lines=80',
  '--test-coverage-branches=75',
  '--test-coverage-functions=70',
  ...coverageTests,
])
if (coverageExit !== 0) process.exit(coverageExit)

process.exit(await runNode(['--test', contract]))
