/** LAN bridge for the prebuilt dsh-mobile-shell token proxy. */
import { type ChildProcessByStdio } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import { createInterface } from 'node:readline'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Readable } from 'node:stream'
import { readMobileShellArtifact } from './mobile-shell.ts'
import { InFlight, ManagedChild } from './process-lifecycle.ts'

export interface LanPairing {
  readonly baseUrl: string
  readonly pairingUrl: string
  /** Every reachable entry (one per listened address), primary first (#65). */
  readonly pairingUrls: readonly string[]
  readonly code: string
  readonly expiresInSeconds: number
  readonly expiresAt: number
  readonly lanAddress: string
  readonly listenPort: number
}

export interface LanRuntimeState {
  readonly running: boolean
  readonly busy: boolean
  readonly lanAddress?: string
  readonly listenPort?: number
  readonly targetOrigin?: string
  readonly pairingExpiresAt?: number
}

export interface LanServiceOptions {
  readonly mobileShellRoot: string | (() => string)
  readonly nodeExecutable?: () => string
  readonly getTargetUrl: () => string | undefined
  /** Stable host-only signing key so paired device sessions survive proxy restarts. */
  readonly masterToken?: () => string | Promise<string>
  /** Writable device registry; packaged resources may be read-only. */
  readonly stateFile?: () => string
  readonly onLog?: (line: string) => void
  readonly onStateChanged?: () => void
  /** Test hook: inject a fixed LAN address to skip private-LAN discovery. */
  readonly lanAddress?: () => string
  /** User-selected listen addresses from the settings checkboxes (#65);
   *  empty/undefined falls back to auto discovery. */
  readonly listenSelection?: () => readonly string[] | undefined
}

const DEFAULT_LISTEN_PORT = 3081
const MAX_PORT_SEARCH = 100
const START_TIMEOUT_MS = 10_000
const MASTER_TOKEN_PATTERN = /^[a-f0-9]{64}$/

/** Read or atomically create the LAN session signing key with owner-only permissions. */
export async function loadOrCreateLanMasterToken(path: string): Promise<string> {
  const readExisting = async (): Promise<string> => {
    const token = (await readFile(path, 'utf8')).trim()
    if (!MASTER_TOKEN_PATTERN.test(token)) throw new Error(`LAN master token is invalid: ${path}`)
    await chmod(path, 0o600)
    return token
  }
  try {
    return await readExisting()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  await mkdir(dirname(path), { recursive: true })
  const token = randomBytes(32).toString('hex')
  try {
    await writeFile(path, `${token}\n`, { flag: 'wx', mode: 0o600 })
    return token
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return readExisting()
  }
}

export function isPrivateLanIPv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first, second] = octets
  return first === 10
    || (first === 172 && second !== undefined && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    // CGNAT 100.64.0.0/10 (RFC 6598): Tailscale/ZeroTier-style virtual nets
    // (#63) — a phone on the same virtual net reaches these like any LAN.
    || (first === 100 && second !== undefined && second >= 64 && second <= 127)
}

export function isLanPairingExpired(pairing: Pick<LanPairing, 'expiresAt'>, now = Date.now()): boolean {
  return pairing.expiresAt <= now
}

function interfaceRank(name: string): number {
  if (/^(en|eth|wl|wlan)/i.test(name) || /wi-?fi|ethernet/i.test(name)) return 0
  // Known VPN virtual adapters outrank unrecognized names (#63): with no
  // physical NIC on the phone's network they are the reachable entry.
  if (/^(utun|tun|tap|tailscale|zerotier)/i.test(name)) return 1
  if (/^(docker|bridge|veth)/i.test(name)) return 2
  return 2
}

/** Return stable private IPv4 candidates, excluding loopback and public IPs. */
export function listPrivateLanIPv4(interfaces = networkInterfaces()): string[] {
  const candidates = Object.entries(interfaces)
    .flatMap(([name, entries]) => (entries ?? [])
      .filter(entry => entry.family === 'IPv4'
        && !entry.internal && isPrivateLanIPv4(entry.address))
      .map(entry => ({ name, address: entry.address })))
    .sort((left, right) => interfaceRank(left.name) - interfaceRank(right.name)
      || left.name.localeCompare(right.name) || left.address.localeCompare(right.address))
  return [...new Set(candidates.map(candidate => candidate.address))]
}

function parseTargetUrl(target: string): { host: string; port: number } {
  const url = new URL(target)
  if (url.protocol !== 'http:' || !url.hostname || !url.port) {
    throw new Error(`Harness target is not a loopback HTTP URL: ${target}`)
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error(`Harness target is not loopback: ${target}`)
  }
  return { host: url.hostname, port: Number(url.port) }
}

async function portAvailable(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    const finish = (available: boolean): void => {
      server.removeAllListeners()
      server.close(() => resolve(available))
    }
    server.once('error', () => finish(false))
    server.listen(port, host, () => finish(true))
  })
}

async function chooseListenPort(host: string, preferred = DEFAULT_LISTEN_PORT): Promise<number> {
  for (let offset = 0; offset < MAX_PORT_SEARCH; offset += 1) {
    const port = preferred + offset
    if (await portAvailable(host, port)) return port
  }
  throw new Error(`no free LAN port found near ${preferred}`)
}

async function waitForHealth(baseUrl: string, timeoutMs = START_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'proxy did not become ready'
  while (Date.now() < deadline) {
    if (signal?.aborted === true) throw new Error('LAN proxy start cancelled')
    try {
      const requestSignal = signal === undefined
        ? AbortSignal.timeout(750)
        : AbortSignal.any([signal, AbortSignal.timeout(750)])
      const response = await fetch(`${baseUrl}healthz`, { signal: requestSignal, cache: 'no-store' })
      await response.body?.cancel()
      if (response.ok) return
      lastError = `proxy health check returned HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(lastError)
}

async function requestPairing(
  baseUrl: string,
  token: string,
  allowedHosts: readonly string[],
  signal?: AbortSignal,
): Promise<{ code: string; expiresInSeconds: number; pairingUrl: string; pairingUrls: readonly string[] }> {
  const requestSignal = signal === undefined
    ? AbortSignal.timeout(2_000)
    : AbortSignal.any([signal, AbortSignal.timeout(2_000)])
  const response = await fetch(`${baseUrl}pair/new`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    signal: requestSignal,
  })
  const body = await response.json() as { code?: unknown; expiresInSeconds?: unknown; pairingUrls?: unknown }
  if (!response.ok || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    throw new Error(`proxy pairing request failed (HTTP ${response.status})`)
  }
  const pairingUrls = Array.isArray(body.pairingUrls)
    ? body.pairingUrls.filter((url): url is string => typeof url === 'string')
    : []
  const validUrls = filterPairingUrls(baseUrl, pairingUrls, allowedHosts)
  const pairingUrl = validUrls[0]
  if (pairingUrl === undefined) throw new Error('proxy returned no LAN pairing URL on the expected origin')
  return {
    code: body.code,
    expiresInSeconds: typeof body.expiresInSeconds === 'number' ? body.expiresInSeconds : 600,
    pairingUrl,
    pairingUrls: validUrls,
  }
}

export function filterPairingUrls(baseUrl: string, pairingUrls: readonly string[], allowedHosts: readonly string[]): string[] {
  // Pairing URLs are untrusted proxy output: keep only those that address a
  // local interface on the same scheme and port as the proxy we spoke to, so
  // a compromised or buggy proxy cannot redirect the QR code at an arbitrary
  // host. Every listen address is accepted — not only the probe origin —
  // because a wildcard/multi-NIC proxy publishes one entry per interface (#65).
  const expected = new URL(baseUrl)
  const allowed = new Set([expected.hostname, ...allowedHosts])
  return pairingUrls.filter(url => {
    try {
      const candidate = new URL(url)
      return candidate.protocol === expected.protocol
        && candidate.port === expected.port
        && allowed.has(candidate.hostname)
    } catch {
      return false
    }
  })
}

function proxyEnvironment(values: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of [
    'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP', 'TMPDIR',
    'SYSTEMROOT', 'ComSpec', 'LANG', 'LC_ALL',
  ]) {
    const value = process.env[key]
    if (value !== undefined) environment[key] = value
  }
  Object.assign(environment, values)
  return environment
}

/** Render a QR as a self-contained SVG for a BrowserWindow. */
export function qrSvgFromCode(qr: {
  size: number
  getModule(x: number, y: number): boolean
}, border = 4): string {
  const size = qr.size + border * 2
  const modules: string[] = []
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.getModule(x, y)) modules.push(`<rect x="${x + border}" y="${y + border}" width="1" height="1"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="LAN pairing QR code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${modules.join('')}</g></svg>`
}

export async function qrSvgFromText(text: string, mobileShellRoot: string): Promise<string> {
  const artifact = readMobileShellArtifact(mobileShellRoot)
  const pairingModule = await import(pathToFileURL(artifact.pairingPath).href) as {
    renderSvgQr?: (value: string) => unknown
  }
  const svg = pairingModule.renderSvgQr?.(text)
  if (typeof svg !== 'string' || !svg.startsWith('<svg ')) throw new Error('mobile shell SVG QR renderer is unavailable')
  return svg
}

export class LanService {
  private readonly options: LanServiceOptions
  private readonly managed = new ManagedChild()
  private readonly startSlot = new InFlight<LanPairing>()
  private readonly stopSlot = new InFlight<void>()
  private pairing: LanPairing | undefined
  private targetUrl: string | undefined
  private stopping = false
  private startAbortController: AbortController | undefined
  private pairingExpiryTimer: NodeJS.Timeout | undefined

  constructor(options: LanServiceOptions) {
    this.options = options
  }

  private get mobileShellPath(): string {
    const root = typeof this.options.mobileShellRoot === 'function'
      ? this.options.mobileShellRoot()
      : this.options.mobileShellRoot
    return resolve(root)
  }

  get isRunning(): boolean {
    return this.managed.running
  }

  get isBusy(): boolean {
    return this.startSlot.pending || this.stopSlot.pending
  }

  get currentPairing(): LanPairing | undefined {
    if (this.pairing !== undefined && isLanPairingExpired(this.pairing)) this.expirePairing()
    return this.pairing
  }

  get currentTargetUrl(): string | undefined {
    return this.targetUrl
  }

  /** Non-secret connection facts suitable for a user-reviewed diagnostic report. */
  get diagnosticState(): LanRuntimeState {
    let targetOrigin: string | undefined
    try {
      targetOrigin = this.targetUrl === undefined ? undefined : new URL(this.targetUrl).origin
    } catch {
      targetOrigin = undefined
    }
    const pairing = this.currentPairing
    return {
      running: this.isRunning,
      busy: this.isBusy,
      ...(pairing === undefined ? {} : {
        lanAddress: pairing.lanAddress,
        listenPort: pairing.listenPort,
        pairingExpiresAt: pairing.expiresAt,
      }),
      ...(targetOrigin === undefined ? {} : { targetOrigin }),
    }
  }

  start(): Promise<LanPairing> {
    if (this.startSlot.pending) return this.startSlot.current!
    const currentPairing = this.currentPairing
    if (this.isRunning && currentPairing !== undefined) return Promise.resolve(currentPairing)
    if (this.isRunning) {
      const task = this.stop().then(() => {
        this.stopping = false
        return this.startInternal()
      })
      return this.trackStart(task)
    }
    if (this.stopSlot.pending) {
      const task = this.stopSlot.current!.then(() => {
        this.stopping = false
        return this.startInternal()
      })
      return this.trackStart(task)
    }
    this.stopping = false
    return this.trackStart(this.startInternal())
  }

  private trackStart(task: Promise<LanPairing>): Promise<LanPairing> {
    const tracked = this.track(this.startSlot, task)
    this.options.onStateChanged?.()
    return tracked
  }

  /** Share `task` as the in-flight operation for `slot`, notifying listeners
   *  when it settles (the busy flag flips at settle). */
  private track<T>(slot: InFlight<T>, task: Promise<T>): Promise<T> {
    const tracked = slot.track(task)
    void task.then(
      () => this.options.onStateChanged?.(),
      () => this.options.onStateChanged?.(),
    )
    return tracked
  }

  private async startInternal(): Promise<LanPairing> {
    const controller = new AbortController()
    this.startAbortController = controller
    try {
      const targetUrl = this.options.getTargetUrl()
      if (targetUrl === undefined) throw new Error('Harness is not ready yet')
      // Injected address (tests) bypasses discovery and the private-LAN guard;
      // production still walks DSH_LAN_IP and network interfaces.
      const injectedAddress = this.options.lanAddress?.()
      // Multi-NIC listen (#65): the proxy binds one server per address, so a
      // phone on the physical LAN and one on a VPN virtual adapter can both
      // pair at the same time.
      let listenHosts: string[]
      let lanAddress: string
      if (injectedAddress !== undefined) {
        listenHosts = [injectedAddress]
        lanAddress = injectedAddress
      } else {
        listenHosts = resolveLanListenHosts({
          requested: process.env.DSH_LAN_IP,
          selected: this.options.listenSelection?.(),
          candidates: listPrivateLanIPv4(),
        })
        if (listenHosts.length === 0) throw new Error('No private LAN IPv4 address found; connect to Wi-Fi or Ethernet first')
        // Multi-NIC (#65): with more than one candidate the proxy binds the
        // wildcard — every NIC (physical + VPN virtual adapters) is reachable
        // at once, and its pairing URLs enumerate one entry per address. The
        // health/pairing API goes over loopback, which a wildcard listener
        // always answers.
        if (listenHosts.length > 1) lanAddress = '0.0.0.0'
        else lanAddress = listenHosts[0] ?? ''
      }
      // Wildcard bind (multi-NIC #65): the shell-facing API and the health
      // probe go over loopback, which a wildcard listener always answers.
      const upstreamToken = new URL(targetUrl).searchParams.get('token') ?? undefined
      const listenPort = await chooseListenPort(lanAddress)
      if (controller.signal.aborted) throw new Error('LAN proxy start cancelled')
      const token = await this.options.masterToken?.() ?? randomBytes(32).toString('hex')
      if (token.length < 8) throw new Error('LAN master token must contain at least 8 characters')
      // The proxy answers on every listen address (it binds the wildcard in
      // the multi-NIC case), while loopback never appears in its pairing URLs.
      // Anchoring on a concrete address keeps the origin check in
      // requestPairing() able to match what the proxy actually publishes.
      const probeHost = listenHosts.find(host => host !== '0.0.0.0')
        ?? listPrivateLanIPv4()[0]
        ?? '127.0.0.1'
      const apiBase = `http://${probeHost}:${listenPort}/`
      const baseUrl = listenHosts.length > 1 || lanAddress === '0.0.0.0'
        ? apiBase
        : `http://${lanAddress}:${listenPort}/`
      const target = parseTargetUrl(targetUrl)
      const mobileShell = readMobileShellArtifact(this.mobileShellPath)
      const proxyPath = mobileShell.proxyPath
      const launcherPath = mobileShell.launcherPath
      const child = this.managed.spawn({
        command: this.options.nodeExecutable?.() ?? process.execPath,
        args: [proxyPath],
        cwd: mobileShell.root,
        env: proxyEnvironment({
          DSH_REMOTE_TOKEN: token,
          ...(upstreamToken === undefined ? {} : { DSH_UPSTREAM_TOKEN: upstreamToken }),
          DSH_LISTEN_HOST: lanAddress,
          ...(listenHosts.length > 1 ? { DSH_LAN_IPS: listenHosts.join(',') } : {}),
          DSH_LISTEN_PORT: String(listenPort),
          DSH_TARGET_HOST: target.host,
          DSH_TARGET_PORT: String(target.port),
          DSH_LAUNCHER: launcherPath,
          DSH_PAIR_QR: 'off',
          ...(this.options.stateFile === undefined ? {} : { DSH_STATE_FILE: resolve(this.options.stateFile()) }),
        }),
        windowsHide: true,
      }) as ChildProcessByStdio<null, Readable, Readable>
      this.targetUrl = targetUrl
      const onLine = (line: string): void => this.options.onLog?.(`mobile-shell: ${line}`)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      for (const stream of [child.stdout, child.stderr]) {
        createInterface({ input: stream }).on('line', onLine)
      }
      child.once('exit', () => {
        if (!this.stopping) this.options.onLog?.('mobile-shell: LAN proxy stopped unexpectedly')
        clearTimeout(this.pairingExpiryTimer)
        this.pairingExpiryTimer = undefined
        this.pairing = undefined
        this.targetUrl = undefined
        this.options.onStateChanged?.()
      })
      child.once('error', error => this.options.onLog?.(`mobile-shell: ${error.message}`))

      await waitForHealth(baseUrl, START_TIMEOUT_MS, controller.signal)
      const allowedHosts = listenHosts.includes('0.0.0.0') ? listPrivateLanIPv4() : listenHosts
      const result = await requestPairing(baseUrl, token, allowedHosts, controller.signal)
      const expiresInSeconds = Math.max(1, Math.floor(result.expiresInSeconds))
      this.pairing = {
        baseUrl,
        pairingUrl: result.pairingUrl,
        pairingUrls: result.pairingUrls,
        code: result.code,
        expiresInSeconds,
        expiresAt: Date.now() + expiresInSeconds * 1_000,
        lanAddress,
        listenPort,
      }
      clearTimeout(this.pairingExpiryTimer)
      this.pairingExpiryTimer = setTimeout(() => this.expirePairing(), expiresInSeconds * 1_000)
      this.pairingExpiryTimer.unref()
      return this.pairing
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      if (this.startAbortController === controller) this.startAbortController = undefined
    }
  }

  async restart(): Promise<LanPairing> {
    const pendingStart = this.startSlot.current
    await this.stop()
    await pendingStart?.catch(() => {})
    return this.start()
  }

  stop(): Promise<void> {
    if (this.stopSlot.pending) return this.stopSlot.current!
    const tracked = this.track(this.stopSlot, this.stopInternal())
    this.options.onStateChanged?.()
    return tracked
  }

  private async stopInternal(): Promise<void> {
    this.stopping = true
    this.startAbortController?.abort()
    this.targetUrl = undefined
    clearTimeout(this.pairingExpiryTimer)
    this.pairingExpiryTimer = undefined
    this.pairing = undefined
    // SIGTERM → SIGKILL (3s) with a Windows tree sweep; resolves immediately
    // when no proxy child is running or it already exited.
    await this.managed.stop(3_000)
  }

  private expirePairing(): void {
    if (this.pairing === undefined) return
    this.pairing = undefined
    clearTimeout(this.pairingExpiryTimer)
    this.pairingExpiryTimer = undefined
    this.options.onStateChanged?.()
  }
}

/** How a pairing URL can be reached: over the physical LAN or over a VPN
 *  virtual adapter (CGNAT, #63/#65). */
export type PairingUrlKind = 'lan' | 'vpn'

/**
 * Which addresses the LAN proxy listens on (#65 full support):
 * 1. an explicit NIC selection (settings checkboxes) wins;
 * 2. `DSH_LAN_IP` stays compatible — single address, or comma list, or the
 *    `0.0.0.0` wildcard;
 * 3. otherwise all discovered private candidates (physical first, then VPN
 *    virtual adapters) listen at once.
 */
export function resolveLanListenHosts(opts: {
  requested?: string
  selected?: readonly string[]
  candidates: readonly string[]
}): string[] {
  if (opts.selected !== undefined && opts.selected.length > 0) {
    const valid = opts.selected.filter(address => isPrivateLanIPv4(address))
    if (valid.length > 0) return [...new Set(valid)]
  }
  if (opts.requested !== undefined && opts.requested !== '') {
    if (opts.requested === '0.0.0.0' || opts.requested === 'all') return ['0.0.0.0']
    const parts = opts.requested.split(',').map(part => part.trim()).filter(part => part !== '')
    if (parts.every(part => isPrivateLanIPv4(part)) && parts.length > 0) return parts
    if (isPrivateLanIPv4(opts.requested)) return [opts.requested]
  }
  return [...opts.candidates]
}

/** Classify by host: CGNAT 100.64.0.0/10 hosts are VPN virtual adapters. */
export function pairingUrlKind(url: string): PairingUrlKind {
  try {
    const octets = new URL(url).hostname.split('.').map(Number)
    if (octets.length === 4 && octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) return 'vpn'
  } catch {
    // Unparseable falls through to the plain-LAN default.
  }
  return 'lan'
}

/**
 * The same pairing entry reachable over every private candidate IP: the QR
 * window renders one code per address (#65) so a phone on any of them —
 * physical LAN or VPN virtual adapter — can pair. The kernel-provided URL
 * comes first; each candidate swaps the host and keeps port/path/query.
 */
export function lanPairingUrlCandidates(
  pairingUrl: string,
  candidateIps: readonly string[],
): Array<{ url: string; kind: PairingUrlKind }> {
  const base = (() => {
    try {
      return new URL(pairingUrl)
    } catch {
      return null
    }
  })()
  if (base === null) return []
  const out: Array<{ url: string; kind: PairingUrlKind }> = []
  const push = (url: string): void => {
    if (out.some(candidate => candidate.url === url)) return
    out.push({ url, kind: pairingUrlKind(url) })
  }
  push(pairingUrl)
  for (const ip of candidateIps) {
    if (!isPrivateLanIPv4(ip)) continue
    const alt = new URL(pairingUrl)
    alt.hostname = ip
    push(alt.toString())
  }
  return out
}
