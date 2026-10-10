import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile('plugins/dsh-desktop-controls/lib/client.js', 'utf8')

function fixture(bridge: Record<string, unknown>, refresh: () => Promise<void>) {
  const state: unknown[] = []
  const refs: Array<{ current: unknown }> = []
  let slot = 0
  let refSlot = 0
  let plugin: { apply(ctx: unknown): void } | undefined
  let section: (() => unknown) | undefined
  const react = {
    Fragment: Symbol('fragment'), useEffect() {},
    useState(initial: unknown) {
      const index = slot++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], (value: unknown) => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useRef(initial: unknown) { return refs[refSlot++] ?? (refs[refSlot - 1] = { current: initial }) },
  }
  const jsx = (type: unknown, props: unknown) => ({ type, props })
  runInNewContext(source, {
    window: { dshDesktop: bridge, __ModuleLoader__: { load: (entry: { factory(loader: unknown): typeof plugin }) => { plugin = entry.factory((name: string) => name === 'react' ? react : { jsx, jsxs: jsx }) } } },
    document: { documentElement: { lang: 'zh' }, querySelector: () => ({}) },
  })
  plugin!.apply({ effect: (callback: () => unknown) => callback(), sessions: { refresh }, slots: {
    inject: (_: unknown, callback: () => unknown) => callback(),
    register: (meta: { id: string }, component: () => unknown) => { if (meta.id === 'dsh-desktop-trash') section = component },
  } })
  function nodes(value: unknown): Array<{ type?: string; props?: { children?: unknown; onClick?: () => void } }> {
    if (Array.isArray(value)) return value.flatMap(nodes)
    if (!value || typeof value !== 'object') return []
    const node = value as { props?: { children?: unknown } }
    return [node, ...nodes(node.props?.children)]
  }
  function click(label: string) {
    slot = 0; refSlot = 0
    const button = nodes(section!()).find(node => node.type === 'button' && node.props?.children === label)
    assert.ok(button, `actual component renders ${label}`)
    button.props!.onClick!()
  }
  // Initial render sets up hooks; then simulate the loaded session tab.
  section!()
  state[1] = 'sessions'; state[2] = []
  state[3] = [{ sessionId: 'session-real', projectKey: 'project', modifiedAt: 1, archived: false }]
  return { state, click }
}

async function settled(predicate: () => boolean) {
  for (let attempt = 0; !predicate() && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 2))
  assert.equal(predicate(), true, 'UI callback settles')
}

test('sync failure is retryable without repeating the successful disk mutation', async () => {
  let mutations = 0
  let refreshes = 0
  const ui = fixture({
    listTrash: async () => [], listTrashSessions: async () => [],
    deleteTrashSession: async () => { mutations++; return true },
  }, async () => { if (++refreshes === 1) throw new Error('connection lost') })
  ui.click('删除（入桶）')
  await settled(() => ui.state[4] === false)
  assert.equal(ui.state[5], '磁盘操作已完成，但列表同步失败；请点击刷新重试。')
  ui.click('刷新')
  await settled(() => ui.state[5] === '已完成')
  assert.equal(mutations, 1)
  assert.equal(refreshes, 2)
  assert.equal((ui.state[3] as unknown[]).length, 0)
})

test('superseded panel reads cannot overwrite a newer authoritative refresh', async () => {
  let reads = 0
  let old!: (rows: unknown[]) => void
  const ui = fixture({
    listTrash: async () => [],
    listTrashSessions: async () => ++reads === 1 ? new Promise(resolve => { old = resolve }) : [{ sessionId: 'session-new', projectKey: 'project', modifiedAt: 2 }],
  }, async () => {})
  ui.click('刷新')
  await settled(() => reads === 1)
  ui.click('刷新')
  await settled(() => (ui.state[3] as Array<{ sessionId: string }>)[0]?.sessionId === 'session-new')
  old([{ sessionId: 'session-stale', projectKey: 'project', modifiedAt: 1 }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((ui.state[3] as Array<{ sessionId: string }>)[0]?.sessionId, 'session-new')
})
