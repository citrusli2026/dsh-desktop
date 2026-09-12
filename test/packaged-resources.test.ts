import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

test('electron-builder packs the agent trash hook next to the harness', () => {
  const config = parse(readFileSync('electron-builder.yml', 'utf8')) as {
    extraResources?: Array<{ from?: string; to?: string }>
  }
  const entry = (config.extraResources ?? []).find(item => item.from === 'resources/agent-trash-hook')
  assert.equal(entry?.to, 'agent-trash-hook')
  assert.equal(existsSync('resources/agent-trash-hook/agent-trash-hook.mjs'), true)
  assert.equal(existsSync('resources/agent-trash-hook/rm-parser.mjs'), true)
})
