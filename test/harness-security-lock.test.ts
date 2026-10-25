import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

test('Harness lock contains only the reviewed patched security resolutions', () => {
  const lock = parse(readFileSync(new URL('../manifest/harness/pnpm-lock.yaml', import.meta.url), 'utf8'))
  for (const [name, version] of [['@modelcontextprotocol/sdk', '1.32.0'], ['compression', '1.8.2'], ['proxy-addr', '2.0.8']] as const) {
    const resolutions = Object.keys(lock.packages).filter(key => key.startsWith(`${name}@`))
    assert.deepEqual(resolutions, [`${name}@${version}`])
    assert.equal(lock.overrides[name], version)
  }
  assert.equal(lock.importers['.'].dependencies['@modelcontextprotocol/sdk'].specifier, '1.32.0', 'preserve the formerly optional SDK functionality')
})
