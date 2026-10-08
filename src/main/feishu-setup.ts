import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type FeishuSetupStage = 'starting' | 'waiting-for-scan' | 'completed' | 'cancelled'

export interface FeishuSetupPaths {
  directory: string
  configPath: string
  qrImagePath: string
}

export interface FeishuSetupResult {
  appId: string
  appSecret: string
  status: 'completed'
}

export interface FeishuSetupRunOptions {
  command: string
  workspace: string
  projectName?: string
  tempDirectory?: string
  timeoutMs?: number
  args?: (paths: FeishuSetupPaths, timeoutSeconds: number, projectName: string) => readonly string[]
  onQr?: (image: Buffer) => void
  onStage?: (stage: FeishuSetupStage) => void
}

export function feishuSetupSpawnCommand(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): { command: string; args: readonly string[] } {
  if (platform === 'win32' && /\.(?:c|m)?js$/i.test(command)) {
    return { command: process.execPath, args: [command, ...args] }
  }
  return { command, args }
}

export function extractFeishuCredentials(config: string): { appId: string; appSecret: string } {
  const appId = readTomlString(config, 'app_id')
  const appSecret = readTomlString(config, 'app_secret')
  if (appId === undefined || appSecret === undefined || appId === '' || appSecret === '') {
    throw new Error('cc-connect completed without Feishu credentials')
  }
  return { appId, appSecret }
}

function readTomlString(config: string, key: string): string | undefined {
  const match = config.match(new RegExp(`^${key}\\s*=\\s*("(?:\\\\.|[^"])*")\\s*$`, 'm'))
  if (match?.[1] === undefined) return undefined
  try {
    return JSON.parse(match[1]) as string
  } catch {
    return undefined
  }
}

export class FeishuSetupRun {
  private readonly options: FeishuSetupRunOptions
  private readonly timeoutMs: number
  private child: ChildProcess | undefined
  private temporaryDirectory: string | undefined
  private started = false
  private cancelled = false
  private finishReject: ((error: Error) => void) | undefined

  constructor(options: FeishuSetupRunOptions) {
    this.options = options
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1_000
  }

  async start(): Promise<FeishuSetupResult> {
    if (this.started) throw new Error('Feishu setup already started')
    this.started = true
    if (this.cancelled) throw new Error('Feishu setup cancelled')
    this.emit('starting')
    const directory = await mkdtemp(join(this.options.tempDirectory ?? tmpdir(), 'dsh-feishu-setup-'))
    this.temporaryDirectory = directory
    const paths: FeishuSetupPaths = {
      directory,
      configPath: join(directory, 'config.toml'),
      qrImagePath: join(directory, 'feishu-qr.png'),
    }
    const projectName = this.options.projectName ?? 'dsh-desktop'
    const timeoutSeconds = Math.max(1, Math.ceil(this.timeoutMs / 1_000))
    const args = this.options.args?.(paths, timeoutSeconds, projectName) ?? [
      'feishu', 'new', '--config', paths.configPath, '--project', projectName,
      '--qr-image', paths.qrImagePath, '--timeout', String(timeoutSeconds),
    ]

    try {
      const result = await this.waitForProcess(paths, args)
      this.emit('completed')
      return { ...result, status: 'completed' }
    } finally {
      await this.cleanup()
    }
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.emit('cancelled')
    this.child?.kill('SIGTERM')
    this.finishReject?.(new Error('Feishu setup cancelled'))
  }

  private emit(stage: FeishuSetupStage): void {
    this.options.onStage?.(stage)
  }

  private async waitForProcess(paths: FeishuSetupPaths, args: readonly string[]): Promise<{ appId: string; appSecret: string }> {
    return await new Promise<{ appId: string; appSecret: string }>((resolve, reject) => {
      let settled = false
      let qrSeen = false
      let qrTimer: NodeJS.Timeout | undefined
      let qrPollInFlight: Promise<void> | undefined
      const timeout = setTimeout(() => finishReject(new Error('Feishu QR setup timed out')), this.timeoutMs)
      timeout.unref()
      const finishResolve = (value: { appId: string; appSecret: string }): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (qrTimer !== undefined) clearInterval(qrTimer)
        resolve(value)
      }
      const finishReject = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (qrTimer !== undefined) clearInterval(qrTimer)
        reject(error)
      }
      this.finishReject = finishReject
      const pollQr = (): Promise<void> => {
        if (settled || qrSeen) return Promise.resolve()
        if (qrPollInFlight !== undefined) return qrPollInFlight
        qrPollInFlight = (async () => {
          try {
            await access(paths.qrImagePath)
            const image = await readFile(paths.qrImagePath)
            if (image.length > 0) {
              qrSeen = true
              this.emit('waiting-for-scan')
              this.options.onQr?.(image)
            }
          } catch {
            // The sidecar writes the QR asynchronously; keep polling until it exits.
          } finally {
            qrPollInFlight = undefined
          }
        })()
        return qrPollInFlight
      }
      qrTimer = setInterval(() => { void pollQr() }, 80)
      void pollQr()
      try {
        const spawnCommand = feishuSetupSpawnCommand(this.options.command, args)
        this.child = spawn(spawnCommand.command, spawnCommand.args, {
          cwd: this.options.workspace,
          env: { ...process.env, HOME: this.temporaryDirectory, USERPROFILE: this.temporaryDirectory },
          stdio: 'ignore',
          windowsHide: true,
        })
      } catch (error) {
        finishReject(new Error(`could not start cc-connect: ${error instanceof Error ? error.message : String(error)}`))
        return
      }
      this.child.once('error', error => finishReject(new Error(`cc-connect setup failed to start: ${error.message}`)))
      this.child.once('close', async code => {
        if (settled) return
        if (this.cancelled) {
          finishReject(new Error('Feishu setup cancelled'))
          return
        }
        if (code !== 0) {
          finishReject(new Error(`cc-connect setup exited with code ${String(code ?? 'unknown')}`))
          return
        }
        try {
          // A test or very fast local sidecar may write the QR and exit before
          // the polling interval fires. Capture it once more before resolving
          // so the success page can retain the QR as an audit aid.
          await pollQr()
          const config = await readFile(paths.configPath, 'utf8')
          finishResolve(extractFeishuCredentials(config))
        } catch (error) {
          finishReject(error instanceof Error ? error : new Error('cc-connect setup did not produce a valid config'))
        }
      })
    })
  }

  private async cleanup(): Promise<void> {
    this.finishReject = undefined
    this.child = undefined
    if (this.temporaryDirectory !== undefined) {
      await rm(this.temporaryDirectory, { recursive: true, force: true })
      this.temporaryDirectory = undefined
    }
  }
}
