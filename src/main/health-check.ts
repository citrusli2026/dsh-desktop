/** Read-only, local-first health checks for the desktop tools surface. */
import { constants } from 'node:fs'
import { access, readFile, stat, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { dshBin, nodeBin } from './paths.ts'
import { readProfileStatus } from './profile.ts'
import { inspectPluginInventory } from './safe-mode.ts'
import type { HarnessState } from './supervisor.ts'
import type { ShellLocale } from './locale.ts'

export type DesktopHealthStatus = 'ok' | 'warning' | 'failed'
export type DesktopHealthCheckId = 'runtime' | 'storage' | 'harness' | 'profile' | 'proxy' | 'registry' | 'updates'

export interface DesktopHealthResult {
  id: DesktopHealthCheckId
  status: DesktopHealthStatus
  label: string
  detail: string
  action?: string
}

export interface DesktopHealthReport {
  checkedAt: string
  networkIncluded: boolean
  results: DesktopHealthResult[]
}

interface HealthFetchResponse {
  ok: boolean
  status: number
  body?: { cancel(): Promise<unknown> } | null
}

export interface DesktopHealthCheckOptions {
  harnessRoot: string
  mobileShellRoot: string
  dshHome: string
  userData: string
  harnessState: HarnessState | undefined
  safeMode: boolean
  kernelVersion?: string
  locale: ShellLocale
  includeNetwork: boolean
  fetch(url: string, init?: { signal?: AbortSignal }): Promise<HealthFetchResponse>
  resolveProxy(url: string): Promise<string>
}

const GIB = 1024 ** 3
const FAIL_DISK_BYTES = 256 * 1024 ** 2
const WARN_DISK_BYTES = GIB
const PROBE_TIMEOUT_MS = 4_000

const COPY = {
  zh: {
    runtime: '内置运行环境', storage: '数据目录与磁盘', harness: 'Harness 与本地连接', profile: 'Profile、插件与版本',
    proxy: '系统代理', registry: '插件与内核源', updates: '桌面更新源',
    runtimeOk: (version: string) => `Node、Harness 与桌面组件完整 · 内核 ${version}`,
    runtimeFailed: '安装包内的关键运行文件缺失或不可读取。',
    runtimeAction: '重新下载安装包；不要手动补写运行文件。',
    storageOk: (free: string) => `两个数据目录可写 · 可用空间 ${free}`,
    storageWarn: (free: string) => `数据目录可写，但可用空间仅 ${free}。`,
    storageFailed: '数据目录不可写、不是目录，或磁盘空间严重不足。',
    storageAction: '检查目录权限并清理磁盘空间，然后重新体检。',
    harnessOk: 'Harness 已启动，loopback 页面可连接。',
    harnessFailed: 'Harness 未就绪，或当前 loopback 地址不可连接。',
    harnessAction: '从恢复区重启 Harness；仍失败时再启用安全模式。',
    profileOk: (plugins: number, market: string, version: string) => `Profile 完整 · ${plugins} 个用户插件 · 插件市场${market}（可选） · 内核 ${version}`,
    profileWarn: (plugins: number, market: string, version: string) => `Profile 需要留意 · ${plugins} 个用户插件 · 插件市场${market}（可选） · 内核 ${version}`,
    profileSafeMode: (plugins: number, market: string, version: string) => `安全模式已开启 · ${plugins} 个用户插件已隔离 · 插件市场${market}（可选） · 内核 ${version}`,
    profileFailed: 'Profile 清单或插件目录不完整。',
    profileAction: '先使用安全模式启动，再到「设置 → 插件」检查异常插件；不会自动修复文件。',
    safeModeAction: '确认异常插件已处理后，再从恢复区退出安全模式。',
    marketInstalled: (version?: string) => version === undefined ? '已安装' : `已安装 ${version}`,
    marketMissing: '未安装', marketDamaged: '记录损坏',
    proxyDirect: '当前连接为直连。', proxySystem: '已检测到系统代理；具体地址不会显示或上传。', proxyFailed: '无法读取系统代理状态。',
    proxyAction: '检查系统网络与代理设置后重试。',
    registryOk: 'npm registry 可连接。', registryFailed: 'npm registry 暂不可连接。',
    registryAction: '检查代理或 registry 配置；本次不会修改配置。',
    updatesOk: 'GitHub Release 更新源可连接。', updatesFailed: 'GitHub Release 更新源暂不可连接。',
    updatesAction: '检查网络或系统代理，稍后重试。',
  },
  en: {
    runtime: 'Bundled runtime', storage: 'Data folders & disk', harness: 'Harness & loopback', profile: 'Profile, plugins & versions',
    proxy: 'System proxy', registry: 'Plugin & kernel registry', updates: 'Desktop update source',
    runtimeOk: (version: string) => `Node, Harness, and desktop components are intact · kernel ${version}`,
    runtimeFailed: 'A required bundled runtime file is missing or unreadable.',
    runtimeAction: 'Download the installer again; do not patch runtime files by hand.',
    storageOk: (free: string) => `Both data folders are writable · ${free} available`,
    storageWarn: (free: string) => `Data folders are writable, but only ${free} is available.`,
    storageFailed: 'A data path is not a writable directory, or disk space is critically low.',
    storageAction: 'Check folder permissions and free disk space, then run the check again.',
    harnessOk: 'Harness is ready and its loopback page is reachable.',
    harnessFailed: 'Harness is not ready or its current loopback address is unreachable.',
    harnessAction: 'Restart Harness from Recovery; use Safe Mode only if it still fails.',
    profileOk: (plugins: number, market: string, version: string) => `Profile is intact · ${plugins} user plugins · market ${market} (optional) · kernel ${version}`,
    profileWarn: (plugins: number, market: string, version: string) => `Profile needs attention · ${plugins} user plugins · market ${market} (optional) · kernel ${version}`,
    profileSafeMode: (plugins: number, market: string, version: string) => `Safe Mode is active · ${plugins} user plugins quarantined · market ${market} (optional) · kernel ${version}`,
    profileFailed: 'The profile manifest or one or more plugin folders are incomplete.',
    profileAction: 'Start in Safe Mode, then inspect Settings → Plugins; no files will be repaired automatically.',
    safeModeAction: 'After handling the suspect plugin, exit Safe Mode from Recovery.',
    marketInstalled: (version?: string) => version === undefined ? 'installed' : `installed ${version}`,
    marketMissing: 'not installed', marketDamaged: 'damaged',
    proxyDirect: 'The current connection is direct.', proxySystem: 'A system proxy is configured; its address is never displayed or uploaded.', proxyFailed: 'The system proxy state could not be read.',
    proxyAction: 'Check the system network and proxy settings, then retry.',
    registryOk: 'The npm registry is reachable.', registryFailed: 'The npm registry is currently unreachable.',
    registryAction: 'Check the proxy or registry setting; this check will not modify it.',
    updatesOk: 'The GitHub Release update source is reachable.', updatesFailed: 'The GitHub Release update source is currently unreachable.',
    updatesAction: 'Check the network or system proxy and retry later.',
  },
} as const

async function isReadableFile(path: string, executable = false): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return false
    await access(path, executable && process.platform !== 'win32' ? constants.R_OK | constants.X_OK : constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function isWritableDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isDirectory()) return false
    await access(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function formatFree(bytes: number | undefined): string {
  if (bytes === undefined) return 'unknown'
  return `${Math.max(0, bytes / GIB).toFixed(bytes < GIB ? 1 : 0)} GB`
}

function loopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.')
  } catch {
    return false
  }
}

async function probe(url: string, fetcher: DesktopHealthCheckOptions['fetch']): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetcher(url, { signal: controller.signal })
    await response.body?.cancel().catch(() => {})
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function marketText(copy: typeof COPY.zh | typeof COPY.en, state: 'installed' | 'missing' | 'damaged', version?: string): string {
  if (state === 'installed') return copy.marketInstalled(version)
  return state === 'damaged' ? copy.marketDamaged : copy.marketMissing
}

/** Run bounded checks. It does not write files, reveal paths, upload results, or repair state. */
export async function runDesktopHealthCheck(options: DesktopHealthCheckOptions): Promise<DesktopHealthReport> {
  const copy = COPY[options.locale]
  const results: DesktopHealthResult[] = []
  const requiredFiles = [
    [nodeBin(options.harnessRoot), true] as const,
    [dshBin(options.harnessRoot), false] as const,
    [join(options.harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), false] as const,
    [join(options.harnessRoot, 'node_modules', 'dsh-desktop-controls', 'lib', 'client.js'), false] as const,
    [join(options.mobileShellRoot, 'app', 'www', 'index.html'), false] as const,
  ]
  const runtimeReady = (await Promise.all(requiredFiles.map(([path, executable]) => isReadableFile(path, executable)))).every(Boolean)
  let harnessVersion = 'unknown'
  if (runtimeReady) {
    try {
      const pkg = JSON.parse(await readFile(join(options.harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')) as { version?: unknown }
      if (typeof pkg.version === 'string' && pkg.version !== '') harnessVersion = pkg.version
    } catch {
      harnessVersion = 'unknown'
    }
  }
  results.push(runtimeReady
    ? { id: 'runtime', status: 'ok', label: copy.runtime, detail: copy.runtimeOk(harnessVersion) }
    : { id: 'runtime', status: 'failed', label: copy.runtime, detail: copy.runtimeFailed, action: copy.runtimeAction })

  const [dshWritable, userDataWritable] = await Promise.all([isWritableDirectory(options.dshHome), isWritableDirectory(options.userData)])
  const freeSpace = async (path: string): Promise<number | undefined> => {
    try {
      const disk = await statfs(path)
      return Number(disk.bavail) * Number(disk.bsize)
    } catch {
      return undefined
    }
  }
  const [dshFree, userDataFree] = await Promise.all([freeSpace(options.dshHome), freeSpace(options.userData)])
  const freeBytes = dshFree === undefined || userDataFree === undefined ? undefined : Math.min(dshFree, userDataFree)
  const storageFailed = !dshWritable || !userDataWritable || (freeBytes !== undefined && freeBytes < FAIL_DISK_BYTES)
  const storageWarning = !storageFailed && (freeBytes === undefined || freeBytes < WARN_DISK_BYTES)
  results.push(storageFailed
    ? { id: 'storage', status: 'failed', label: copy.storage, detail: copy.storageFailed, action: copy.storageAction }
    : storageWarning
      ? { id: 'storage', status: 'warning', label: copy.storage, detail: copy.storageWarn(formatFree(freeBytes)), action: copy.storageAction }
      : { id: 'storage', status: 'ok', label: copy.storage, detail: copy.storageOk(formatFree(freeBytes)) })

  const stateUrl = options.harnessState?.phase === 'ready' ? options.harnessState.url : undefined
  const harnessReady = stateUrl !== undefined && loopbackUrl(stateUrl) && await probe(stateUrl, options.fetch)
  results.push(harnessReady
    ? { id: 'harness', status: 'ok', label: copy.harness, detail: copy.harnessOk }
    : { id: 'harness', status: 'failed', label: copy.harness, detail: copy.harnessFailed, action: copy.harnessAction })

  try {
    const [profile, inventory] = await Promise.all([readProfileStatus(options.dshHome), inspectPluginInventory(options.dshHome)])
    const market = marketText(copy, profile.dshMarket.state, profile.dshMarket.version)
    const version = options.kernelVersion ?? harnessVersion
    const failed = profile.manifest === 'damaged' || inventory.damagedBundles.length > 0
    const warning = !failed && (profile.manifest === 'missing' || profile.dshMarket.state === 'damaged' || options.safeMode)
    results.push(failed
      ? { id: 'profile', status: 'failed', label: copy.profile, detail: copy.profileFailed, action: copy.profileAction }
      : warning
        ? options.safeMode
          ? { id: 'profile', status: 'warning', label: copy.profile, detail: copy.profileSafeMode(inventory.userBundles.length, market, version), action: copy.safeModeAction }
          : { id: 'profile', status: 'warning', label: copy.profile, detail: copy.profileWarn(inventory.userBundles.length, market, version), action: copy.profileAction }
        : { id: 'profile', status: 'ok', label: copy.profile, detail: copy.profileOk(inventory.userBundles.length, market, version) })
  } catch {
    results.push({ id: 'profile', status: 'failed', label: copy.profile, detail: copy.profileFailed, action: copy.profileAction })
  }

  if (options.includeNetwork) {
    let proxy: string | undefined
    try {
      proxy = await options.resolveProxy('https://registry.npmjs.org')
    } catch {
      proxy = undefined
    }
    results.push(proxy === undefined || proxy.trim() === ''
      ? { id: 'proxy', status: 'warning', label: copy.proxy, detail: copy.proxyFailed, action: copy.proxyAction }
      : { id: 'proxy', status: 'ok', label: copy.proxy, detail: proxy.trim().toUpperCase() === 'DIRECT' ? copy.proxyDirect : copy.proxySystem })

    const [registryReady, updatesReady] = await Promise.all([
      probe('https://registry.npmjs.org/@deepseek-ai%2Fdsh/latest', options.fetch),
      probe('https://api.github.com/repos/citrusli2026/dsh-desktop/releases/latest', options.fetch),
    ])
    results.push(registryReady
      ? { id: 'registry', status: 'ok', label: copy.registry, detail: copy.registryOk }
      : { id: 'registry', status: 'warning', label: copy.registry, detail: copy.registryFailed, action: copy.registryAction })
    results.push(updatesReady
      ? { id: 'updates', status: 'ok', label: copy.updates, detail: copy.updatesOk }
      : { id: 'updates', status: 'warning', label: copy.updates, detail: copy.updatesFailed, action: copy.updatesAction })
  }

  return { checkedAt: new Date().toISOString(), networkIncluded: options.includeNetwork, results }
}
