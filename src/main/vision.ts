/**
 * Vision plugin management: detect modlens status, read version,
 * and provide the pre-installed extension metadata for the About dialog.
 *
 * modlens is pre-bundled in the harness closure (manifest/harness/package.json);
 * no runtime installation step is needed. This module reads the installed
 * version from the closure's node_modules and exposes it to the shell chrome.
 * @module main/vision
 */
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { harnessRoot, nodeBin } from './paths.ts'


const SAMPLE_IMAGE_BASE64 = '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'
export const SAMPLE_IMAGE_DATA_URL = `data:image/png;base64,${SAMPLE_IMAGE_BASE64}`

function modlensCliPath(): string {
  return join(harnessRoot(), 'node_modules', '@liustack', 'modlens', 'dist', 'main.js')
}

function runModlens(
  args: readonly string[],
  timeoutMs: number,
  overrides: { node?: string; cli?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(overrides.node ?? nodeBin(), [overrides.cli ?? modlensCliPath(), ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('ModLens command timed out'))
    }, timeoutMs)
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `ModLens exited with code ${code}`))
    })
  })
}

export type ModLensHintKind = 'quota' | 'agy' | 'api-key' | 'pi-auth' | 'claude-login' | 'generic'

export interface ModLensHint {
  readonly kind: ModLensHintKind
  /** Raw matched detail for display when the kind is generic. */
  readonly message?: string
}

/** Known failure patterns, ordered so aggregate errors yield stable hints. */
const HINT_PATTERNS: ReadonlyArray<readonly [ModLensHintKind, RegExp]> = [
  ['quota', /403|usage limit|quota/i],
  ['agy', /agy\s+not\s+on\s+PATH/i],
  ['api-key', /\bmissing:\s*\S*apiKey\b/],
  ['pi-auth', /pi\s+auth|pi\s+could\s+not/i],
  ['claude-login', /claude-cli\s+provider\s+failed/i],
]

/**
 * Classify a ModLens CLI failure message into actionable hints the settings
 * UI can render with localized guidance (quota exhausted, missing default
 * engine, missing API key, stale pi/claude logins). Unknown failures fall
 * back to a single generic hint carrying the raw message.
 */
export function modlensFailureHints(error: string): readonly ModLensHint[] {
  if (typeof error !== 'string' || error.trim() === '') return []
  const hints = HINT_PATTERNS
    .filter(([, pattern]) => pattern.test(error))
    .map(([kind]) => ({ kind }))
  if (hints.length > 0) return hints
  const detail = error.length > 400 ? `${error.slice(0, 400)}…` : error
  return [{ kind: 'generic', message: detail }]
}

export interface ModLensTestResult {
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: string
  /** Actionable classifications of the failure, for friendly UI hints. */
  readonly hints?: readonly ModLensHint[]
}

export interface ModLensTestOptions {
  /** Per-provider timeout handed to the CLI (`--timeout`); each attempt in
   *  the failover chain gets this budget. */
  providerTimeoutMs?: number
  /** How many chain attempts the whole-process budget must outlast. */
  maxAttempts?: number
  /** Extra headroom on top of `providerTimeoutMs * maxAttempts`. */
  bufferMs?: number
  /** Test-only overrides for the bundled runtime and CLI entry. */
  node?: string
  cli?: string
}

/**
 * Run one real recognition against the bundled sample image. The CLI's
 * `--timeout` bounds a single provider, while the failover chain can try
 * several in sequence (API engines, keyless CLIs, granted reuse harnesses), so
 * the process budget must be the per-provider budget times the chain length —
 * otherwise a slow first engine gets the whole run SIGKILLed mid-chain and the
 * wizard shows a bare "timed out" instead of the real per-engine errors.
 */
export async function runModlensTest(options: ModLensTestOptions = {}): Promise<ModLensTestResult> {
  const providerTimeoutMs = options.providerTimeoutMs ?? 60_000
  const maxAttempts = options.maxAttempts ?? 6
  const budgetMs = providerTimeoutMs * maxAttempts + (options.bufferMs ?? 15_000)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-modlens-test-'))
  const imagePath = join(dir, 'sample.png')
  try {
    await writeFile(imagePath, Buffer.from(SAMPLE_IMAGE_BASE64, 'base64'))
    const args = ['-i', imagePath, '--timeout', String(providerTimeoutMs)]
    const output = await runModlens(args, budgetMs, { node: options.node, cli: options.cli })
    return { ok: true, result: JSON.parse(output) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message, hints: modlensFailureHints(message) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export interface ModLensDoctorResult {
  readonly ok: boolean
  readonly report?: string
  readonly error?: string
}

/**
 * Run the local-only modlens diagnostic (no network calls, no provider quota)
 * and return its text report. The report explains, per engine, why it is or
 * is not usable — the raw material for the settings wizard's failure
 * diagnosis. Doctor exits 0 even when every provider is broken.
 */
export async function runModlensDoctor(timeoutMs = 30_000): Promise<ModLensDoctorResult> {
  try {
    const report = await runModlens(['doctor'], timeoutMs)
    return { ok: true, report }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export interface VisionPluginInfo {
  readonly name: string
  readonly version: string
  readonly installed: boolean
}

const MODLENS_PACKAGE = '@liustack/modlens'

/**
 * Read the installed modlens version from the bundled harness closure.
 * Returns undefined when the closure is not yet bootstrapped (e.g. first run
 * before `pnpm run bootstrap`).
 */
export function readModlensVersion(harnessDir: string = harnessRoot()): string | undefined {
  const pkgPath = join(harnessDir, 'node_modules', MODLENS_PACKAGE, 'package.json')
  if (!existsSync(pkgPath)) return undefined
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Return metadata about the pre-installed vision plugin for display in the
 * About dialog and settings window.
 */
export function getVisionPluginInfo(): VisionPluginInfo {
  const version = readModlensVersion()
  return {
    name: 'ModLens',
    version: version ?? '未安装',
    installed: version !== undefined,
  }
}

/**
 * Absolute path of the dsh patch overlay that mounts the modlens plugin into
 * the harness's plugin tree. The plugin package ships it as its own
 * `cordis.patch.yml`; the shell passes it to `dsh --patch` so the plugin is
 * loaded on every boot without touching the user's profile files.
 */
export function modlensPatchPath(harnessDir: string = harnessRoot()): string {
  return join(harnessDir, 'node_modules', ...MODLENS_PACKAGE.split('/'), 'cordis.patch.yml')
}

/**
 * Link the bundled modlens package into `$DSH_HOME/profiles/node_modules` so
 * the dsh plugin loader — which resolves loader entries relative to the
 * profile directory — can import it. This mirrors dsh's own module-fallback
 * healing, which only covers the dsh dependency closure, not shell-added
 * packages. A real directory already present (a profile-managed
 * `dsh plugin add` install) is left untouched and takes precedence.
 */
function ensureModlensModuleLink(dshHome: string, harnessDir: string): void {
  const target = join(harnessDir, 'node_modules', ...MODLENS_PACKAGE.split('/'))
  const link = join(dshHome, 'profiles', 'node_modules', ...MODLENS_PACKAGE.split('/'))
  mkdirSync(dirname(link), { recursive: true })
  try {
    if (lstatSync(link).isSymbolicLink()) {
      let current: string | undefined
      try {
        current = readlinkSync(link)
      } catch {
        current = undefined
      }
      if (current === target) return
      rmSync(link)
    } else {
      // A real directory is a user-managed install; never clobber it.
      return
    }
  } catch {
    // ENOENT: no entry yet, create the link below.
  }
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Prepare the harness to mount the pre-installed modlens plugin: verify the
 * bundle and make it resolvable from the dsh profile. Returns the `--patch`
 * overlay path when the plugin can be mounted, or undefined when it cannot
 * (unbootstrapped closure, blocked symlink) — the harness must still boot
 * then, just without the vision extension, so a broken mount never takes
 * the whole app down.
 */
export function prepareModlensMount(dshHome: string, harnessDir: string = harnessRoot()): string | undefined {
  const patch = modlensPatchPath(harnessDir)
  const pluginEntry = join(harnessDir, 'node_modules', ...MODLENS_PACKAGE.split('/'), 'dsh', 'index.js')
  if (!existsSync(patch) || !existsSync(pluginEntry)) return undefined
  try {
    ensureModlensModuleLink(dshHome, harnessDir)
  } catch {
    // Fall through to the resolvability check: a profile-local install may
    // still satisfy the loader even when the fallback link failed.
  }
  const resolved = (...segments: readonly string[]): boolean =>
    existsSync(join(dshHome, 'profiles', ...segments, ...MODLENS_PACKAGE.split('/'), 'dsh', 'index.js'))
  return resolved('node_modules') || resolved('web', 'node_modules') ? patch : undefined
}
