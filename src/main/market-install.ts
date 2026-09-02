/** Typed lifecycle and failure classification for the manual dshmarket install. */
import type { ProfilePackageStatus } from './profile.ts'

export type MarketInstallProgress = 'preparing' | 'installing' | 'verifying' | 'restarting'

export type MarketInstallFailureReason =
  | 'network'
  | 'proxy'
  | 'timeout'
  | 'profile'
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

export interface MarketInstallDependencies {
  install(): Promise<MarketInstallCommandResult>
  readStatus(): Promise<ProfilePackageStatus>
  restart(): Promise<boolean>
  onProgress?(progress: MarketInstallProgress): void
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
    return {
      status: reason === 'profile' || reason === 'install-script' || reason === 'unknown'
        ? 'install-failed'
        : 'download-failed',
      installed: false,
      stage: 'install',
      reason,
      ...(command.stderr === '' ? {} : { detail: command.stderr }),
    }
  }

  progress('verifying')
  let status: ProfilePackageStatus
  try {
    status = await dependencies.readStatus()
  } catch (error) {
    return {
      status: 'install-failed',
      installed: false,
      stage: 'verify',
      reason: 'profile',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
  if (status.state !== 'installed') {
    return {
      status: 'install-failed',
      installed: false,
      stage: 'verify',
      reason: 'profile',
      detail: 'market package did not appear in the user profile',
    }
  }

  progress('restarting')
  const restarted = await dependencies.restart()
  if (!restarted) {
    return { status: 'restart-failed', installed: true, stage: 'restart', version: status.version }
  }
  return { status: 'installed', installed: true, stage: 'restart', version: status.version }
}
