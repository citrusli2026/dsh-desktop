/**
 * Kernel overlay manager — the second update chain (decision 0026). The app
 * ships a pinned kernel in the vendored closure; a user may install an
 * official `@deepseek-ai/dsh` release into `<userData>/kernels/<version>`
 * (offline-safe pointer file selects it) and the supervisor prefers that bin.
 * An overlay that fails to boot is marked bad and the shell rolls back to the
 * bundled kernel automatically — the bundled closure is always the floor.
 * @module main/kernel-manager
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { dshBin } from './paths.ts'

export const KERNEL_PACKAGE = '@deepseek-ai/dsh'
export const REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai/dsh'
/** Bound the registry lookup: a black-holed network must surface as a failed
 *  check (the UI shows a retry hint), not an eternally spinning button. */
export const REGISTRY_FETCH_TIMEOUT_MS = 15_000
/** Give a switched kernel one supervised boot to reach ready; otherwise roll back. */
export const KERNEL_HEALTH_TIMEOUT_MS = 90_000

export interface OverlayPointer {
  version: string
}

export interface KernelState {
  bundledVersion: string | undefined
  /** Active overlay version when one is selected, installed, and healthy. */
  overlayVersion: string | undefined
  /** Versions that failed their health boot and are excluded until retried. */
  failedVersions: string[]
  /** Installed overlay versions with a loadable bin. */
  installedVersions: string[]
}

/** The kernels overlay root under the shell userData directory. */
export function kernelsDir(userData: string): string {
  return join(userData, 'kernels')
}

function pointerPath(dir: string): string {
  return join(dir, 'active.json')
}

function failedMarkerPath(dir: string, version: string): string {
  return join(dir, `${version}.failed.json`)
}

/** Bin path of an installed overlay kernel; undefined when not loadable. */
export function overlayBinPath(dir: string, version: string): string | undefined {
  const bin = join(dir, version, 'node_modules', ...KERNEL_PACKAGE.split('/'), 'lib', 'bin.js')
  return existsSync(bin) ? bin : undefined
}

export function readActiveOverlay(dir: string): OverlayPointer | undefined {
  try {
    const data = JSON.parse(readFileSync(pointerPath(dir), 'utf8')) as { version?: unknown }
    return typeof data.version === 'string' && data.version.trim() !== ''
      ? { version: data.version }
      : undefined
  } catch {
    return undefined
  }
}

export function writeActiveOverlay(dir: string, version: string | undefined): void {
  mkdirSync(dir, { recursive: true })
  if (version === undefined) {
    rmSync(pointerPath(dir), { force: true })
    return
  }
  writeFileSync(pointerPath(dir), `${JSON.stringify({ version } satisfies OverlayPointer, null, 2)}\n`)
}

export function markKernelFailed(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(failedMarkerPath(dir, version), `${JSON.stringify({ version, failedAt: new Date().toISOString() }, null, 2)}\n`)
}

export function clearKernelFailed(dir: string, version: string): void {
  rmSync(failedMarkerPath(dir, version), { force: true })
}

export function failedVersions(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter(name => name.endsWith('.failed.json'))
      .map(name => name.slice(0, -'.failed.json'.length))
  } catch {
    return []
  }
}

export function installedVersions(dir: string): string[] {
  try {
    return readdirSync(dir).filter(name => overlayBinPath(dir, name) !== undefined)
  } catch {
    return []
  }
}

/** Kernel version of the bundled closure (the floor we always fall back to). */
export function bundledKernelVersion(harnessRoot: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(harnessRoot, 'node_modules', ...KERNEL_PACKAGE.split('/'), 'package.json'), 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * The bin the supervisor should spawn: the active overlay when it is
 * installed and not marked failed, otherwise the bundled kernel.
 */
export function activeKernelBin(harnessRoot: string, dir: string): string {
  const active = readActiveOverlay(dir)
  if (active !== undefined
    && !failedVersions(dir).includes(active.version)
    && overlayBinPath(dir, active.version) !== undefined) {
    return overlayBinPath(dir, active.version)!
  }
  return dshBin(harnessRoot)
}

/**
 * One-shot guard for the launch boot of the overlay selected at start-up
 * (decision 0026). A switch to an overlay mid-session gets its own health
 * window; the launch boot gets the same guarantee: a crash before readiness
 * rolls back to the bundled kernel and marks the overlay failed. Disarmed
 * permanently after the first terminal boot phase.
 */
export class KernelLaunchGuard {
  private armed = true
  private readonly dir: string
  private readonly version: string

  constructor(dir: string, version: string) {
    this.dir = dir
    this.version = version
  }

  /** Observe one boot phase; returns the version to roll back exactly once,
   *  when the guarded overlay's first boot crashes before readiness and the
   *  pointer still selects it. */
  observe(phase: 'starting' | 'ready' | 'crashed'): string | undefined {
    if (!this.armed) return undefined
    if (phase !== 'ready' && phase !== 'crashed') return undefined
    this.armed = false
    if (phase !== 'crashed') return undefined
    return readActiveOverlay(this.dir)?.version === this.version ? this.version : undefined
  }
}

/** Guard for the boot of the overlay selected at start-up; undefined when the
 *  launch boot runs the bundled kernel (no overlay, or a failed/missing one —
 *  exactly the states the rollback warns about). */
export function createKernelLaunchGuard(dir: string): KernelLaunchGuard | undefined {
  const active = readActiveOverlay(dir)
  if (active === undefined
    || failedVersions(dir).includes(active.version)
    || overlayBinPath(dir, active.version) === undefined) return undefined
  return new KernelLaunchGuard(dir, active.version)
}

export function kernelState(harnessRoot: string, dir: string): KernelState {
  const active = readActiveOverlay(dir)
  const failed = failedVersions(dir)
  return {
    bundledVersion: bundledKernelVersion(harnessRoot),
    overlayVersion: active !== undefined
      && overlayBinPath(dir, active.version) !== undefined
      && !failed.includes(active.version)
      ? active.version
      : undefined,
    failedVersions: failed,
    installedVersions: installedVersions(dir),
  }
}

/** Latest published version from the npm registry (dist-tags.latest). */
export async function fetchLatestKernelVersion(
  fetchImpl: typeof fetch,
  url: string = REGISTRY_URL,
  timeoutMs: number = REGISTRY_FETCH_TIMEOUT_MS,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return undefined
    const payload = (await response.json()) as { 'dist-tags'?: { latest?: unknown } }
    const latest = payload['dist-tags']?.latest
    return typeof latest === 'string' ? latest : undefined
  } catch {
    return undefined
  }
}

export interface InstallKernelOptions {
  dir: string
  version: string
  nodeBin: string
  pnpmBin: string
  timeoutMs?: number
  /** Base environment for the pnpm child; defaults to process.env. The shell
   *  injects the bundled-shim PATH and system-proxy vars (install-env). */
  env?: NodeJS.ProcessEnv
  spawnImpl?: typeof spawn
}

export type InstallKernelResult = { ok: true } | { ok: false; reason: string }

/** Install one official kernel release into its own overlay directory with
 *  the bundled pnpm. Network required; the install is offline-safe to retry. */
export async function installKernel(options: InstallKernelOptions): Promise<InstallKernelResult> {
  const { dir, version, nodeBin, pnpmBin, timeoutMs = 600_000, spawnImpl = spawn } = options
  if (!/^[0-9A-Za-z.-]+$/.test(version)) return { ok: false, reason: 'invalid-version' }
  const target = join(dir, version)
  mkdirSync(target, { recursive: true })
  const manifest = join(target, 'package.json')
  if (!existsSync(manifest)) {
    writeFileSync(manifest, `${JSON.stringify({ name: 'dsh-kernel-overlay', private: true, version: '0.0.0' }, null, 2)}\n`)
  }
  return new Promise<InstallKernelResult>((resolve) => {
    // node-linker=hoisted mirrors the vendored closure's flat layout
    // (scripts/deploy-harness.mjs), so plugin resolution behaves identically
    // under an overlay kernel and under the bundled one. Build scripts are
    // approved: the overlay carries official @deepseek-ai packages only, and
    // pnpm v11 otherwise exits non-zero on its ignored-builds gate.
    const child = spawnImpl(nodeBin, [pnpmBin, 'add', `${KERNEL_PACKAGE}@${version}`, '--config.node-linker=hoisted', '--config.dangerouslyAllowAllBuilds=true'], {
      cwd: target,
      stdio: 'ignore',
      env: { ...(options.env ?? process.env), npm_config_save_exact: 'true' },
    })
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, reason: 'timeout' }) }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && overlayBinPath(dir, version) !== undefined) {
        // A fresh install of the same version clears its failed marker
        // (decision 0026): reinstall is the documented way out of exclusion.
        clearKernelFailed(dir, version)
        resolve({ ok: true })
      } else {
        resolve({ ok: false, reason: code === 0 ? 'bin-missing' : `exit-${code ?? 'error'}` })
      }
    })
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, reason: 'spawn-failed' }) })
  })
}
