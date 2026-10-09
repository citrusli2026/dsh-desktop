/** Local multi-runtime manager for independently isolated dsh environments. */
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { ConfigFile } from './config-file.ts'
import { ManagedChild, type SpawnProcessOptions } from './process-lifecycle.ts'
import { parseReadyUrl } from './restart-policy.ts'
import { installedVersions, overlayBinPath, readActiveOverlay, clearKernelFailed } from './kernel-manager.ts'

const ENVIRONMENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const VERSION = /^[0-9A-Za-z](?:[0-9A-Za-z.-]*[0-9A-Za-z])?$/
const WEB_ARGS = ['--profile', 'web', '--no-open', '--port', '0'] as const
const DEFAULT_READY_TIMEOUT_MS = 90_000

export type RuntimeEnvironmentStatus = 'stopped' | 'starting' | 'running' | 'failed' | 'missing-runtime'

export interface RuntimeEnvironment {
  id: string
  name: string
  runtimeVersion: string
  dshHome: string
  workspace: string
  status: RuntimeEnvironmentStatus
  url?: string
  pid?: number
  error?: string
}

export interface RuntimeManagerState {
  runtimes: string[]
  environments: RuntimeEnvironment[]
}

interface StoredEnvironment {
  id: string
  name: string
  runtimeVersion: string
  createdAt: string
}

interface StoredState {
  environments: StoredEnvironment[]
}

export interface CreateEnvironmentInput {
  name: string
  runtimeVersion: string
  /** Stable ids make imports and tests deterministic; normal UI callers omit it. */
  id?: string
}

export interface RuntimeManagerOptions {
  runtimeRoot: string
  dataRoot: string
  nodeBin: string
  env?: NodeJS.ProcessEnv
  spawnImpl?: typeof spawn
  readyTimeoutMs?: number
}

function normalizeState(raw: unknown): StoredState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { environments: [] }
  const rows = (raw as { environments?: unknown }).environments
  if (!Array.isArray(rows)) return { environments: [] }
  const environments = rows.flatMap((row): StoredEnvironment[] => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return []
    const value = row as Record<string, unknown>
    if (typeof value.id !== 'string' || !ENVIRONMENT_ID.test(value.id)) return []
    if (typeof value.name !== 'string' || value.name.trim() === '') return []
    if (typeof value.runtimeVersion !== 'string' || !VERSION.test(value.runtimeVersion)) return []
    return [{
      id: value.id,
      name: value.name,
      runtimeVersion: value.runtimeVersion,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    }]
  })
  return { environments }
}

function environmentId(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return `${slug || 'environment'}-${randomUUID().slice(0, 8)}`
}

function lineReader(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let pending = ''
  return chunk => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }
}

/**
 * Owns version-selected dsh processes without changing the shell's global
 * active-kernel pointer. Every environment gets a private DSH_HOME and can
 * therefore run beside another environment, even when both use dsh web.
 */
export class RuntimeManager {
  private readonly config: ConfigFile<StoredState>
  private readonly options: RuntimeManagerOptions
  private readonly children = new Map<string, ManagedChild>()
  private readonly status = new Map<string, { status: RuntimeEnvironmentStatus; url?: string; pid?: number; error?: string }>()

  constructor(options: RuntimeManagerOptions) {
    this.options = options
    mkdirSync(options.runtimeRoot, { recursive: true })
    mkdirSync(options.dataRoot, { recursive: true })
    this.config = new ConfigFile(join(options.dataRoot, 'environments.json'), { environments: [] }, normalizeState)
    for (const environment of this.config.readSync().environments) this.status.set(environment.id, { status: 'stopped' })
  }

  state(): RuntimeManagerState {
    const stored = this.config.readSync().environments
    const environments = stored.map(environment => this.snapshot(environment))
    return {
      runtimes: installedVersions(this.options.runtimeRoot).sort(),
      environments,
    }
  }

  async createEnvironment(input: CreateEnvironmentInput): Promise<RuntimeEnvironment> {
    const name = input.name.trim()
    if (name === '' || name.length > 80) throw new Error('invalid-environment-name')
    if (!VERSION.test(input.runtimeVersion) || overlayBinPath(this.options.runtimeRoot, input.runtimeVersion) === undefined) {
      throw new Error('runtime-not-installed')
    }
    const id = input.id ?? environmentId(name)
    if (!ENVIRONMENT_ID.test(id)) throw new Error('invalid-environment-id')
    const current = this.config.readSync()
    if (current.environments.some(environment => environment.id === id)) throw new Error('environment-exists')
    const environment: StoredEnvironment = {
      id,
      name,
      runtimeVersion: input.runtimeVersion,
      createdAt: new Date().toISOString(),
    }
    mkdirSync(this.dshHome(id), { recursive: true })
    mkdirSync(this.workspace(id), { recursive: true })
    this.config.writeSync({ environments: [...current.environments, environment] })
    this.status.set(id, { status: 'stopped' })
    return this.snapshot(environment)
  }

  async startEnvironment(id: string): Promise<RuntimeEnvironment> {
    const environment = this.find(id)
    const bin = overlayBinPath(this.options.runtimeRoot, environment.runtimeVersion)
    if (bin === undefined) throw new Error('runtime-not-installed')
    const existing = this.children.get(id)
    if (existing?.running) return this.snapshot(environment)

    const managed = new ManagedChild(this.options.spawnImpl)
    this.children.set(id, managed)
    this.status.set(id, { status: 'starting' })
    const child = managed.spawn(this.spawnOptions(environment, bin))
    return new Promise<RuntimeEnvironment>((resolve, reject) => {
      let settled = false
      const finishStart = (error?: Error, url?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error !== undefined) {
          this.status.set(id, { status: 'failed', error: error.message })
          void managed.stop(1_000)
          reject(error)
          return
        }
        this.status.set(id, { status: 'running', url, pid: child.pid ?? undefined })
        resolve(this.snapshot(environment))
      }
      const onLine = (line: string): void => {
        const url = parseReadyUrl(line)
        if (url !== undefined) finishStart(undefined, url)
      }
      const consume = lineReader(onLine)
      child.stdout?.on('data', consume)
      child.stderr?.on('data', consume)
      child.once('error', error => finishStart(error instanceof Error ? error : new Error('spawn-failed')))
      child.once('exit', (code, signal) => {
        this.children.delete(id)
        const current = this.status.get(id)
        if (!settled) {
          finishStart(new Error(`runtime-exited-before-ready:${code ?? signal ?? 'unknown'}`))
        } else if (current?.status === 'running' || current?.status === 'starting') {
          this.status.set(id, { status: 'stopped', error: code === 0 ? undefined : `runtime-exited:${code ?? signal ?? 'unknown'}` })
        }
      })
      const timer = setTimeout(() => finishStart(new Error('runtime-ready-timeout')), this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS)
      timer.unref()
    })
  }

  async stopEnvironment(id: string): Promise<RuntimeEnvironment> {
    const environment = this.find(id)
    const child = this.children.get(id)
    if (child !== undefined) await child.stop(1_500)
    this.children.delete(id)
    this.status.set(id, { status: 'stopped' })
    return this.snapshot(environment)
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.children.keys()].map(id => this.stopEnvironment(id)))
  }

  hasRunningProcesses(): boolean {
    return [...this.children.values()].some(child => child.running)
  }

  /** Remove only one runtime directory; the environment records and DSH_HOME folders stay. */
  async uninstallRuntime(version: string): Promise<void> {
    if (!VERSION.test(version)) throw new Error('invalid-version')
    if (readActiveOverlay(this.options.runtimeRoot)?.version === version) throw new Error('runtime-active-in-shell')
    for (const environment of this.config.readSync().environments) {
      if (environment.runtimeVersion === version && this.children.get(environment.id)?.running) {
        throw new Error(`runtime-running:${environment.id}`)
      }
    }
    await rm(join(this.options.runtimeRoot, version), { recursive: true, force: true })
    clearKernelFailed(this.options.runtimeRoot, version)
    for (const environment of this.config.readSync().environments) {
      if (environment.runtimeVersion === version) this.status.set(environment.id, { status: 'missing-runtime' })
    }
  }

  private find(id: string): StoredEnvironment {
    if (!ENVIRONMENT_ID.test(id)) throw new Error('invalid-environment-id')
    const environment = this.config.readSync().environments.find(row => row.id === id)
    if (environment === undefined) throw new Error('environment-not-found')
    return environment
  }

  private dshHome(id: string): string {
    return join(this.options.dataRoot, id, 'dsh-home')
  }

  private workspace(id: string): string {
    return join(this.options.dataRoot, id, 'workspace')
  }

  private snapshot(environment: StoredEnvironment): RuntimeEnvironment {
    const dynamic = this.status.get(environment.id) ?? { status: 'stopped' as const }
    const installed = overlayBinPath(this.options.runtimeRoot, environment.runtimeVersion) !== undefined
    const result: RuntimeEnvironment = {
      id: environment.id,
      name: environment.name,
      runtimeVersion: environment.runtimeVersion,
      dshHome: this.dshHome(environment.id),
      workspace: this.workspace(environment.id),
      status: installed ? dynamic.status : 'missing-runtime',
    }
    if (dynamic.url !== undefined) result.url = dynamic.url
    if (dynamic.pid !== undefined) result.pid = dynamic.pid
    if (dynamic.error !== undefined) result.error = dynamic.error
    return result
  }

  private spawnOptions(environment: StoredEnvironment, bin: string): SpawnProcessOptions {
    return {
      command: this.options.nodeBin,
      args: [bin, ...WEB_ARGS],
      cwd: this.workspace(environment.id),
      env: {
        ...(this.options.env ?? process.env),
        DSH_HOME: this.dshHome(environment.id),
        DSH_DESKTOP_ENVIRONMENT_ID: environment.id,
      },
    }
  }
}

export function runtimeEnvironmentsDir(userData: string): string {
  return join(userData, 'runtime-environments')
}
