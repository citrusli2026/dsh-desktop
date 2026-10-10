/** Diagnostic only: current TrashSection updates itself but not the public session service.
 * Uses the actual client bundle and disk helpers, but fake hooks/service and a simple
 * directory, NOT a complete Electron/Host session. Expected exit code before fix: 1.
 */
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { deleteSessionToTrash, listSessions } from '../../../src/main/trash-sessions.ts'
import { listTrash, restoreFromTrash } from '../../../src/main/trash.ts'

const root = await mkdtemp(join(tmpdir(), 'dsh-review-refresh-'))
try {
  const sessionDir = join(root, 'sessions', 'fixture-project', 'session-review-fixture')
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'data'), 'isolated fixture; not a kernel session')
  const state = []
  const refs = [{ current: 0 }, { current: true }]
  let refSlot = 0
  let slot = 0
  let plugin
  let section
  let refreshCalls = 0
  const bridge = {
    listTrash: () => listTrash(root),
    listTrashSessions: () => listSessions(root),
    deleteTrashSession: async (key, id) => { await deleteSessionToTrash(root, key, id, []); return true },
    restoreTrash: id => restoreFromTrash(root, id),
    restoreTrashSession: id => restoreFromTrash(root, id),
  }
  const react = {
    Fragment: Symbol('fragment'),
    useState(initial) {
      const index = slot++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useEffect() {},
    useRef() { return refs[refSlot++] },
  }
  const jsx = (type, props) => ({ type, props })
  const source = new URL('../../../plugins/dsh-desktop-controls/lib/client.js', import.meta.url)
  runInNewContext(await readFile(source, 'utf8'), {
    window: {
      dshDesktop: bridge,
      __ModuleLoader__: { load: entry => { plugin = entry.factory(name => name === 'react' ? react : { jsx, jsxs: jsx }) } },
    },
    document: { documentElement: { lang: 'zh' }, querySelector: () => ({}) },
  })
  plugin.apply({
    effect: callback => callback(),
    sessions: { refresh: async () => { refreshCalls++ } },
    slots: {
      inject: (_, callback) => callback(),
      register: (meta, component) => { if (meta.id === 'dsh-desktop-trash') section = component },
    },
  })
  const render = () => { slot = 0; refSlot = 0; return section() }
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes)
    if (!value || typeof value !== 'object') return []
    return [value, ...nodes(value.props?.children)]
  }
  async function click(text) {
    const button = nodes(render()).find(item => item.type === 'button' && item.props.children === text)
    assert.ok(button, `actual TrashSection renders ${text}`)
    button.props.onClick()
    for (let attempt = 0; state[4] && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(state[4], false, 'mutation plus panel refresh completes')
    assert.equal(state[5], '已完成')
  }
  render()
  state[2] = await listTrash(root)
  state[3] = await listSessions(root)
  state[1] = 'sessions'
  await click('删除（入桶）')
  assert.equal(await access(sessionDir).then(() => true, () => false), false)
  assert.equal(state[3].length, 0)
  const afterDelete = { diskSessionPresent: false, trashPanelSessions: state[3].length, publicSessionRefreshCalls: refreshCalls }
  state[1] = 'items'
  await click('还原')
  assert.equal(await access(sessionDir).then(() => true, () => false), true)
  assert.equal(state[3].length, 1)
  console.log(JSON.stringify({
    isolatedActualComponentDiagnostic: true,
    kernelSessionFixture: false,
    afterDelete,
    afterRestore: { diskSessionPresent: true, trashPanelSessions: state[3].length, publicSessionRefreshCalls: refreshCalls },
  }))
  assert.equal(refreshCalls, 2, 'delete and restore must each refresh the Host-authoritative session list')
} finally {
  await rm(root, { recursive: true, force: true })
}
