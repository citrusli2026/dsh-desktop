import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createInterface } from 'node:readline'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const NODE_BIN = resolve('resources/harness/node/bin/node')
const DSH_BIN = resolve('resources/harness/node_modules/@deepseek-ai/dsh/lib/bin.js')
const FAKE_API_KEY = 'fake-qa02-key'

function bootstrapProfile(home, workspace) {
  const stdout = execFileSync(NODE_BIN, [DSH_BIN, '--profile', 'acp', '--dump-config'], {
    cwd: workspace,
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
    timeout: 20_000,
  })
  assert.match(stdout, /@deepseek-ai\/dsh-acp-app/)
}

async function readStream(stream) {
  let output = ''
  for await (const chunk of stream) output += String(chunk)
  return output
}

function sseFrame(event, type) {
  return `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`
}

async function startMockMessagesServer() {
  const requests = []
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/messages') {
      response.writeHead(404).end()
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      requests.push(JSON.parse(body))
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      response.write(sseFrame({
        type: 'message_start',
        message: { id: 'mock-message', type: 'message', role: 'assistant', content: [], usage: { input_tokens: 1, output_tokens: 0 } },
      }, 'message_start'))
      response.write(sseFrame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, 'content_block_start'))
      response.write(sseFrame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'QA02-MOCK-OK' } }, 'content_block_delta'))
      response.write(sseFrame({ type: 'content_block_stop', index: 0 }, 'content_block_stop'))
      response.write(sseFrame({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }, 'message_delta'))
      response.end(sseFrame({ type: 'message_stop' }, 'message_stop'))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  return { server, port: address.port, requests }
}

async function runContract(home, workspace, port) {
  const patchPath = join(home, 'profiles', 'acp', 'cordis.patch.yml')
  await writeFile(patchPath, [
    '- id: llm-deepseek',
    '  config:',
    `    baseURL: http://127.0.0.1:${String(port)}`,
    '    apiKeyEnv: QA02_FAKE_API_KEY',
    '',
  ].join('\n'))

  const child = spawn(NODE_BIN, [DSH_BIN, '--profile', 'acp'], {
    cwd: workspace,
    env: { ...process.env, DSH_HOME: home, QA02_FAKE_API_KEY: FAKE_API_KEY },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const lines = createInterface({ input: child.stdout })
  const stderr = readStream(child.stderr)
  const pending = new Map()
  const notifications = []
  let nextId = 0
  lines.on('line', line => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id === undefined) {
      notifications.push(message)
      return
    }
    const waiter = pending.get(message.id)
    if (waiter === undefined) return
    clearTimeout(waiter.timer)
    pending.delete(message.id)
    if (message.error !== undefined) waiter.reject(new Error(`${message.error.code ?? 'rpc'}: ${message.error.message ?? 'unknown error'}`))
    else waiter.resolve(message.result)
  })

  const call = (method, params) => {
    const id = ++nextId
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`ACP ${method} timed out`))
      }, 20_000)
      pending.set(id, { resolve: resolvePromise, reject, timer })
    })
  }

  const respondToServerRequest = message => {
    if (message.id === undefined || message.method === undefined) return
    const result = message.method === 'session/request_permission'
      ? { outcome: { outcome: 'selected', optionId: 'reject-once' } }
      : {}
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
  }
  lines.on('line', line => {
    try {
      const message = JSON.parse(line)
      if (message.method !== undefined && message.id !== undefined) respondToServerRequest(message)
    } catch {
      // Protocol noise is diagnosed through the captured stderr only.
    }
  })

  const cleanup = async () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('ACP process stopped'))
    }
    pending.clear()
    let closed = false
    const childClosed = once(child, 'close').then(() => { closed = true })
    child.stdin.end()
    await Promise.race([childClosed, new Promise(resolvePromise => setTimeout(resolvePromise, 5_000))])
    if (!closed) {
      child.kill('SIGTERM')
      await Promise.race([childClosed, new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))])
    }
    if (!closed) {
      child.kill('SIGKILL')
      await Promise.race([childClosed, new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))])
    }
    lines.close()
    const errorText = await stderr
    assert.doesNotMatch(errorText, new RegExp(FAKE_API_KEY))
  }

  try {
    const initialized = await call('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'dsh-desktop-qa02', version: 'test' },
    })
    assert.equal(initialized.protocolVersion, 1)
    assert.deepEqual(Object.keys(initialized.agentCapabilities.sessionCapabilities).sort(), ['close', 'list', 'resume'])

    const created = await call('session/new', { cwd: workspace, mcpServers: [] })
    assert.equal(typeof created.sessionId, 'string')
    const sessionId = created.sessionId
    const promptResult = await call('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: 'Return the deterministic QA02 mock response.' }],
    })
    assert.equal(promptResult.stopReason, 'end_turn')
    assert.equal(notifications.some(message => message.method === 'session/update'
      && message.params?.update?.sessionUpdate === 'agent_message_chunk'), true)
    assert.equal(notifications.some(message => JSON.stringify(message).includes('QA02-MOCK-OK')), true)

    await call('session/close', { sessionId })
    const listed = await call('session/list', { cwd: workspace })
    assert.ok(listed.sessions.some(entry => entry.sessionId === sessionId))
    const resumed = await call('session/resume', { sessionId, cwd: workspace, mcpServers: [] })
    // DSH may omit sessionId in a successful resume response; the request id
    // remains the authoritative session identity (CC-02 compatibility).
    assert.ok(resumed.sessionId === undefined || resumed.sessionId === sessionId)
    await call('session/close', { sessionId })
  } finally {
    await cleanup()
  }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-qa02-'))
  const home = join(root, 'dsh-home')
  const workspace = join(root, 'workspace')
  await mkdir(home, { recursive: true })
  await mkdir(workspace, { recursive: true })
  const { server, port, requests } = await startMockMessagesServer()
  try {
    await bootstrapProfile(home, workspace)
    await runContract(home, workspace, port)
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.ok(request !== undefined)
    assert.equal(request.messages?.at(-1)?.content?.[0]?.text, 'Return the deterministic QA02 mock response.')
  } finally {
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
    await new Promise(resolvePromise => server.close(() => resolvePromise()))
    await rm(root, { recursive: true, force: true })
  }
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
