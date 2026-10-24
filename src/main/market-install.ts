/** Typed lifecycle and failure classification for the manual dshmarket install. */
import type { ProfilePackageStatus } from './profile.ts'

export type MarketInstallProgress = 'preparing' | 'installing' | 'verifying' | 'restarting'

export type MarketInstallFailureReason =
  | 'network'
  | 'proxy'
  | 'timeout'
  | 'profile'
  | 'incompatible'
  | 'install-script'
  | 'spawn'
  | 'unknown'

export interface MarketInstallResult {
  status: 'installed' | 'download-failed' | 'install-failed' | 'restart-failed' | 'unavailable'
  installed: boolean
  stage: 'prepare' | 'install' | 'verify' | 'restart'
  reason?: MarketInstallFailureReason
  version?: string
  detail?: string
}

export interface MarketInstallCommandResult {
  code: number
  stderr: string
  timedOut?: boolean
  spawnFailed?: boolean
}

/** Outcome of asking the profile to boot an already-installed dependency. */
export interface MarketEnableResult {
  enabled: boolean
  failure?: 'missing' | 'damaged' | 'unwritable'
  version?: string
  detail?: string
}

export interface MarketInstallDependencies {
  install(): Promise<MarketInstallCommandResult>
  readStatus(): Promise<ProfilePackageStatus>
  /** Add the installed package to the profile's boot list; `dsh plugin add`
   *  never re-enables a dependency the profile already carried. */
  enable(): Promise<MarketEnableResult>
  restart(): Promise<boolean>
  onProgress?(progress: MarketInstallProgress): void
}

/** The CLI's own compatibility gate refused (or will keep skipping) the named
 *  package. Reading the gate's verdict keeps the shell in step with what the
 *  next Harness boot does instead of re-implementing its rules here. */
export function marketIncompatibility(output: string, packageName = 'dshmarket'): string | undefined {
  const needle = `Plugin ${packageName}@`
  const line = output
    .split('\n')
    .map(candidate => candidate.trim())
    .find(candidate => candidate.includes(needle) && candidate.includes('incompatible with dsh'))
  return line === undefined
    ? undefined
    : line.replace(/^dsh:\s*(?:warning:\s*|installation rejected:\s*)?/i, '').slice(0, 400)
}

/** Reduce pnpm/dsh stderr into stable user-facing categories. The sanitized
 * detail remains available separately; UI copy never depends on exact CLI text. */
export function classifyMarketInstallFailure(
  stderr: string,
  options: { timedOut?: boolean; spawnFailed?: boolean } = {},
): MarketInstallFailureReason {
  if (options.timedOut === true) return 'timeout'
  if (options.spawnFailed === true) return 'spawn'
  const text = stderr.toLowerCase()
  if (/proxy|tunnel|407\b|econnrefused[^\n]*(?:7890|proxy)/.test(text)) return 'proxy'
  if (/is incompatible with dsh|incompatible-version/.test(text)) return 'incompatible'
  if (/eacces|eperm|read[- ]only|unexpected_store|permission denied|cannot write|not writable/.test(text)) return 'profile'
  if (/elifecycle|lifecycle|postinstall|preinstall|install script|build script/.test(text)) return 'install-script'
  if (/enotfound|eai_again|econnrefused|econnreset|etimedout|err_pnpm_(?:meta_)?fetch|fetch failed|getaddrinfo|registry unavailable|network/.test(text)) return 'network'
  return 'unknown'
}

/** Complete the install as one recoverable transaction while reporting the
 * meaningful phases to the existing settings surface. */
export async function completeMarketInstall(dependencies: MarketInstallDependencies): Promise<MarketInstallResult> {
  const progress = (value: MarketInstallProgress): void => dependencies.onProgress?.(value)
  progress('preparing')
  let command: MarketInstallCommandResult
  try {
    progress('installing')
    command = await dependencies.install()
  } catch (error) {
    return {
      status: 'unavailable',
      installed: false,
      stage: 'prepare',
      reason: 'spawn',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
  if (command.code !== 0) {
    const reason = classifyMarketInstallFailure(command.stderr, command)
    // Only transport-layer failures are retryable as downloads; everything
    // else (permissions, scripts, the compatibility gate) is a local verdict.
    const status: MarketInstallResult['status'] =
      reason === 'network' || reason === 'proxy' || reason === 'timeout' ? 'download-failed' : 'install-failed'
    return {
      status,
      installed: false,
      stage: 'install',
      reason,
      ...(command.stderr === '' ? {} : { detail: command.stderr }),
    }
  }

  progress('verifying')
  const profileFailure = (detail: string): MarketInstallResult =>
    ({ status: 'install-failed', installed: false, stage: 'verify', reason: 'profile', detail })
  const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

  let status: ProfilePackageStatus
  try {
    status = await dependencies.readStatus()
  } catch (error) {
    return profileFailure(message(error))
  }

  if (status.state !== 'installed') {
    // `dsh plugin add` can exit 0 while the Harness compatibility gate keeps
    // the package out of the boot list: a retained dependency is never
    // re-enabled, and a rejected version only prints its verdict. Surface the
    // gate's own reason instead of blaming the data directory.
    const incompatible = marketIncompatibility(command.stderr)
    if (incompatible !== undefined) {
      return { status: 'install-failed', installed: false, stage: 'verify', reason: 'incompatible', detail: incompatible }
    }
    let enabled: MarketEnableResult
    try {
      enabled = await dependencies.enable()
    } catch (error) {
      return profileFailure(message(error))
    }
    if (!enabled.enabled) {
      const installedButDisabled = status.present === true
        ? `market package ${status.version ?? '(unknown version)'} is installed but not enabled in the user profile`
        : 'market package did not appear in the user profile'
      return profileFailure(enabled.detail ?? installedButDisabled)
    }
    try {
      status = await dependencies.readStatus()
    } catch (error) {
      return profileFailure(message(error))
    }
  }
  if (status.state !== 'installed') {
    return profileFailure('market package did not appear in the user profile')
  }

  progress('restarting')
  const restarted = await dependencies.restart()
  if (!restarted) {
    return { status: 'restart-failed', installed: true, stage: 'restart', version: status.version }
  }
  return { status: 'installed', installed: true, stage: 'restart', version: status.version }
}
