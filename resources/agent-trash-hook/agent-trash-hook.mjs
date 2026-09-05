#!/usr/bin/env node
/**
 * agent-trash-hook — PreToolUse command hook for the desktop trash.
 *
 * Mounted through dsh-hooks-claude-code with a generated hooks.json, this
 * process receives the Claude-Code-style PreToolUse payload on stdin
 * (`{ tool_name, tool_input: { command } }`) for bash/pwsh calls. Deletion
 * commands (rm / rmdir / unlink / Remove-Item) are parsed by rm-parser.mjs:
 *
 *   no deletion      → exit 0 (tool call proceeds unchanged)
 *   confident parse  → every target is RENAMED into <DSH_HOME>/trash/items/
 *                      and recorded in trash/index.json, then exit 0 — the
 *                      agent's delete happens, recoverably
 *   ambiguous parse  → exit 2 with the reason on stderr: the hook protocol
 *                      blocks the tool call and shows the message to the model
 *
 * Self-contained on purpose: the harness spawns it as its own process, so it
 * cannot import the shell's TypeScript modules.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseDeletionCommand } from './rm-parser.mjs'

const DSH_HOME = process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh-desktop')
const TRASH_ITEMS = join(DSH_HOME, 'trash', 'items')
const TRASH_INDEX = join(DSH_HOME, 'trash', 'index.json')

async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

async function readIndex() {
  try {
    const parsed = JSON.parse(await readFile(TRASH_INDEX, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeIndex(entries) {
  await mkdir(dirname(TRASH_INDEX), { recursive: true })
  const temporary = `${TRASH_INDEX}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await (await import('node:fs/promises')).open(temporary, 'w', 0o600)
    .then(handle => handle.writeFile(`${JSON.stringify(entries, null, 2)}\n`, 'utf8').finally(() => handle.close()))
  await rename(temporary, TRASH_INDEX)
}

async function moveToTrash(originPath, source) {
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  await mkdir(TRASH_ITEMS, { recursive: true })
  await rename(originPath, join(TRASH_ITEMS, id))
  const entries = await readIndex()
  entries.push({
    id,
    kind: 'file',
    name: basename(originPath),
    originPath,
    deletedAt: Date.now(),
    ...(source === undefined ? {} : { source }),
  })
  await writeIndex(entries)
}

const payload = await readStdinJson()
if (payload === undefined) process.exit(0)
// The interception switch lives in the shell preferences file the shell keeps
// in its userData; the generated hooks.json only exists while it is on.
if (!existsSync(new URL('./hooks.json', import.meta.url).pathname)) process.exit(0)

const command = payload?.tool_input?.command
if (typeof command !== 'string' || command === '') process.exit(0)
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const decision = parseDeletionCommand(command, projectDir)
if (decision.action === 'allow') process.exit(0)
if (decision.action === 'block') {
  console.error(`desktop trash: ${decision.reason}`)
  process.exit(2)
}
for (const rawPath of decision.paths) {
  const target = resolve(rawPath)
  if (!existsSync(target)) continue
  try {
    await moveToTrash(target, 'agent file deletion (bash)')
  } catch (error) {
    console.error(`desktop trash: could not move ${target} into the trash: ${error.message}`)
    process.exit(2)
  }
}
process.exit(0)
