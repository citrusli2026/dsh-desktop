/** LAN bridge for the prebuilt dsh-mobile-shell token proxy. */
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Readable } from 'node:stream'
import { readMobileShellArtifact } from './mobile-shell.ts'

export interface LanPairing {
  readonly baseUrl: string
  readonly pairingUrl: string
  readonly code: string
  readonly expiresInSeconds: number
  readonly lanAddress: string
  readonly listenPort: number
}

export interface LanServiceOptions {
  readonly mobileShellRoot: string | (() => string)
  readonly nodeExecutable?: () => string
  readonly getTargetUrl: () => string | undefined
  readonly onLog?: (line: string) => void
  readonly onStateChanged?: () => void
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
  const pairingUrl = pairingUrls[0]
  if (pairingUrl === undefined) throw new Error('proxy returned no LAN pairing URL')
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
  private child: ChildProcessByStdio<null, Readable, Readable> | undefined
  private pairing: LanPairing | undefined
  private targetUrl: string | undefined
  private stopping = false
  private startInFlight: Promise<LanPairing> | undefined
  private stopInFlight: Promise<void> | undefined
  private startAbortController: AbortController | undefined

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
    return this.child !== undefined && this.child.exitCode === null
  }

  get isBusy(): boolean {
    return this.startInFlight !== undefined || this.stopInFlight !== undefined
  }

  get currentPairing(): LanPairing | undefined {
    return this.pairing
  }

  get currentTargetUrl(): string | undefined {
    return this.targetUrl
  }

  start(): Promise<LanPairing> {
    if (this.startInFlight !== undefined) return this.startInFlight
    if (this.isRunning && this.pairing !== undefined) return Promise.resolve(this.pairing)
    if (this.stopInFlight !== undefined) {
      const task = this.stopInFlight.then(() => {
        this.stopping = false
        return this.startInternal()
      })
      return this.trackStart(task)
    }
    return this.beginStart()
  }

  private beginStart(): Promise<LanPairing> {
    this.stopping = false
    return this.trackStart(this.startInternal())
  }

  private trackStart(task: Promise<LanPairing>): Promise<LanPairing> {
    this.startInFlight = task
    void task.then(
      () => this.finishStart(task),
      () => this.finishStart(task),
    )
    this.options.onStateChanged?.()
    return task
  }

  private finishStart(task: Promise<LanPairing>): void {
    if (this.startInFlight === task) this.startInFlight = undefined
    this.options.onStateChanged?.()
  }

  private async startInternal(): Promise<LanPairing> {
    const controller = new AbortController()
    this.startAbortController = controller
    try {
      const targetUrl = this.options.getTargetUrl()
      if (targetUrl === undefined) throw new Error('Harness is not ready yet')
      const requestedAddress = process.env.DSH_LAN_IP
      if (requestedAddress !== undefined && !isPrivateLanIPv4(requestedAddress)) {
        throw new Error(`DSH_LAN_IP must be a private LAN IPv4 address, got ${requestedAddress}`)
      }
      const lanAddress = requestedAddress ?? listPrivateLanIPv4()[0]
      if (lanAddress === undefined) throw new Error('No private LAN IPv4 address found; connect to Wi-Fi or Ethernet first')
      const target = parseTargetUrl(targetUrl)
      const listenPort = await chooseListenPort(lanAddress)
      if (controller.signal.aborted) throw new Error('LAN proxy start cancelled')
      const token = randomBytes(32).toString('hex')
      const baseUrl = `http://${lanAddress}:${listenPort}/`
      const mobileShell = readMobileShellArtifact(this.mobileShellPath)
      const proxyPath = mobileShell.proxyPath
      const launcherPath = mobileShell.launcherPath
      const child = spawn(this.options.nodeExecutable?.() ?? process.execPath, [proxyPath], {
        cwd: mobileShell.root,
        env: proxyEnvironment({
          DSH_REMOTE_TOKEN: token,
          DSH_LISTEN_HOST: lanAddress,
          DSH_LISTEN_PORT: String(listenPort),
          DSH_TARGET_HOST: target.host,
          DSH_TARGET_PORT: String(target.port),
          DSH_LAUNCHER: launcherPath,
          DSH_PAIR_QR: 'off',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.child = child as ChildProcessByStdio<null, Readable, Readable>
      this.targetUrl = targetUrl
      const onLine = (line: string): void => this.options.onLog?.(`mobile-shell: ${line}`)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => onLine(String(chunk).trim()))
      child.stderr.on('data', chunk => onLine(String(chunk).trim()))
      child.once('exit', () => {
        if (!this.stopping) this.options.onLog?.('mobile-shell: LAN proxy stopped unexpectedly')
        this.child = undefined
        this.pairing = undefined
        this.targetUrl = undefined
        this.options.onStateChanged?.()
      })
      child.once('error', error => this.options.onLog?.(`mobile-shell: ${error.message}`))

      await waitForHealth(baseUrl, START_TIMEOUT_MS, controller.signal)
      const result = await requestPairing(baseUrl, token, controller.signal)
      this.pairing = {
        baseUrl,
        pairingUrl: result.pairingUrl,
        code: result.code,
        expiresInSeconds: result.expiresInSeconds,
        lanAddress,
        listenPort,
      }
      return this.pairing
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      if (this.startAbortController === controller) this.startAbortController = undefined
    }
  }

  async restart(): Promise<LanPairing> {
    const pendingStart = this.startInFlight
    await this.stop()
    await pendingStart?.catch(() => {})
    return this.start()
  }

  stop(): Promise<void> {
    if (this.stopInFlight !== undefined) return this.stopInFlight
    const task = this.stopInternal()
    this.stopInFlight = task
    void task.then(
      () => this.finishStop(task),
      () => this.finishStop(task),
    )
    this.options.onStateChanged?.()
    return task
  }

  private finishStop(task: Promise<void>): void {
    if (this.stopInFlight === task) this.stopInFlight = undefined
    this.options.onStateChanged?.()
  }

  private async stopInternal(): Promise<void> {
    this.stopping = true
    this.startAbortController?.abort()
    const child = this.child
    this.targetUrl = undefined
    this.pairing = undefined
    if (child === undefined) return
    this.child = undefined
    if (child.exitCode !== null) return
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 3_000)
      timer.unref()
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }
}
