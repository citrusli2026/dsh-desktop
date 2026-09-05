/** LAN bridge for the prebuilt dsh-mobile-shell token proxy. */
import { type ChildProcessByStdio } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Readable } from 'node:stream'
import { readMobileShellArtifact } from './mobile-shell.ts'
import { InFlight, ManagedChild } from './process-lifecycle.ts'

export interface LanPairing {
  readonly baseUrl: string
  readonly pairingUrl: string
  readonly code: string
  readonly expiresInSeconds: number
  readonly expiresAt: number
  readonly lanAddress: string
  readonly listenPort: number
}

export interface LanServiceOptions {
  readonly mobileShellRoot: string | (() => string)
  readonly nodeExecutable?: () => string
  readonly getTargetUrl: () => string | undefined
  readonly onLog?: (line: string) => void
  readonly onStateChanged?: () => void
  /** Test hook: inject a fixed LAN address to skip private-LAN discovery. */
  readonly lanAddress?: () => string
}

const DEFAULT_LISTEN_PORT = 3081
const MAX_PORT_SEARCH = 100
const START_TIMEOUT_MS = 10_000

export function isPrivateLanIPv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first, second] = octets
  return first === 10
    || (first === 172 && second !== undefined && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

export function isLanPairingExpired(pairing: Pick<LanPairing, 'expiresAt'>, now = Date.now()): boolean {
  return pairing.expiresAt <= now
}

function interfaceRank(name: string): number {
  if (/^(en|eth|wl|wlan)/i.test(name) || /wi-?fi|ethernet/i.test(name)) return 0
  if (/^(utun|tun|tap|tailscale|docker|bridge|veth)/i.test(name)) return 2
  return 1
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
  signal?: AbortSignal,
): Promise<{ code: string; expiresInSeconds: number; pairingUrl: string }> {
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
  // Pairing URLs are untrusted proxy output: keep only those whose origin
  // matches the proxy we just spoke to. A compromised or buggy proxy must
  // not redirect the QR code at an arbitrary host.
  const expectedOrigin = new URL(baseUrl).origin
  const pairingUrl = pairingUrls.find(url => {
    try {
      return new URL(url).origin === expectedOrigin
    } catch {
      return false
    }
  })
  if (pairingUrl === undefined) throw new Error('proxy returned no LAN pairing URL on the expected origin')
  return {
    code: body.code,
    expiresInSeconds: typeof body.expiresInSeconds === 'number' ? body.expiresInSeconds : 600,
    pairingUrl,
  }
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
      let lanAddress: string
      if (injectedAddress !== undefined) {
        lanAddress = injectedAddress
      } else {
        const requestedAddress = process.env.DSH_LAN_IP
        if (requestedAddress !== undefined && !isPrivateLanIPv4(requestedAddress)) {
          throw new Error(`DSH_LAN_IP must be a private LAN IPv4 address, got ${requestedAddress}`)
        }
        const discovered = requestedAddress ?? listPrivateLanIPv4()[0]
        if (discovered === undefined) throw new Error('No private LAN IPv4 address found; connect to Wi-Fi or Ethernet first')
        lanAddress = discovered
      }
      const target = parseTargetUrl(targetUrl)
      // Kernels ≥ 0.1.2-alpha.2 print the ready URL with a browser trust
      // token; handing it to the proxy lets it hold an upstream session
      // cookie so paired devices can load the UI (see dsh-remote.mjs).
      // applyState restarts the proxy whenever the ready URL changes, so the
      // token tracks kernel restarts.
      const upstreamToken = new URL(targetUrl).searchParams.get('token') ?? undefined
      const listenPort = await chooseListenPort(lanAddress)
      if (controller.signal.aborted) throw new Error('LAN proxy start cancelled')
      const token = randomBytes(32).toString('hex')
      const baseUrl = `http://${lanAddress}:${listenPort}/`
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
          DSH_LISTEN_PORT: String(listenPort),
          DSH_TARGET_HOST: target.host,
          DSH_TARGET_PORT: String(target.port),
          DSH_LAUNCHER: launcherPath,
          DSH_PAIR_QR: 'off',
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
      const result = await requestPairing(baseUrl, token, controller.signal)
      const expiresInSeconds = Math.max(1, Math.floor(result.expiresInSeconds))
      this.pairing = {
        baseUrl,
        pairingUrl: result.pairingUrl,
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
