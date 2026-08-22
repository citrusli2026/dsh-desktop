/**
 * Deep config-file primitive: one home for "read a small userData file, fall
 * back on error" and "write it atomically so a crash never truncates it".
 * The shell previously re-implemented these in four places with different
 * atomicity guarantees (dsh-home-style readers, shell-preferences,
 * window-state, locale). Now the JSON readers share {@link ConfigFile} and the
 * text-document writer (locale) shares the atomic-write and lock primitives.
 * @module main/config-file
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { open, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** How a config file turns bytes into values and back. */
export interface FileCodec<T> {
  parse(raw: string): T
  stringify(value: T): string
}

/** JSON with a trailing newline, matching the shell's existing config files. */
export const jsonCodec: FileCodec<unknown> = {
  parse: raw => JSON.parse(raw) as unknown,
  stringify: value => `${JSON.stringify(value)}\n`,
}

/** Write `content` to `path` via a same-directory temp file + rename, so a
 *  crash mid-write leaves either the old or the new content, never a torn
 *  file. `mode` applies only to the freshly created temp file. */
export function atomicWriteFileSync(path: string, content: string, mode = 0o600): void {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporary, content, { mode })
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

/** Async variant of {@link atomicWriteFileSync}. */
export async function atomicWriteFile(path: string, content: string, mode = 0o600): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  await mkdir(dirname(path), { recursive: true })
  const handle = await open(temporary, 'wx', mode)
  try {
    await handle.writeFile(content, 'utf8')
  } finally {
    await handle.close()
  }
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export interface FileLockOptions {
  /** How long to keep retrying before giving up (default 2s). */
  timeoutMs?: number
}

/** Run `operation` while holding an exclusive lock file, retrying with
 *  backoff while the lock is held by someone else. Used where a config file
 *  is shared with another process (the harness settings document). */
export async function withFileLock<T>(lockPath: string, operation: () => Promise<T>, options: FileLockOptions = {}): Promise<T> {
  const deadline = Date.now() + (options.timeoutMs ?? 2_000)
  let delay = 25
  let handle: Awaited<ReturnType<typeof open>> | undefined
  await mkdir(dirname(lockPath), { recursive: true })
  while (handle === undefined) {
    try {
      handle = await open(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) throw error
      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, 250)
    }
  }
  try {
    return await operation()
  } finally {
    await handle.close()
    await rm(lockPath, { force: true })
  }
}

export interface ConfigFileOptions {
  /** File mode for newly written files (default 0o600). */
  mode?: number
  /** Called when a read or write fails; defaults to rethrowing reads and
   *  swallowing nothing. Sync write call sites pass a warn logger. */
  onError?: (error: unknown) => void
}

/**
 * Typed JSON config backed by {@link atomicWriteFile}: reads fall back to
 * `defaults` on missing/malformed files, writes are atomic, and `update`
 * combines read-modify-write for call sites that mutate one key at a time.
 */
export class ConfigFile<T> {
  private readonly path: string
  private readonly defaults: T
  private readonly normalize: (raw: unknown) => T
  private readonly mode: number
  private readonly onError: ((error: unknown) => void) | undefined

  constructor(
    path: string,
    defaults: T,
    normalize: (raw: unknown) => T,
    options: ConfigFileOptions = {},
  ) {
    this.path = path
    this.defaults = defaults
    this.normalize = normalize
    this.mode = options.mode ?? 0o600
    this.onError = options.onError
  }

  /** Parse the current file; `defaults` when missing, malformed, or unwritable. */
  readSync(): T {
    try {
      return this.normalize(jsonCodec.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      this.onError?.(error)
      return this.defaults
    }
  }

  /** Async variant of {@link readSync}. */
  async read(): Promise<T> {
    try {
      return this.normalize(jsonCodec.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      this.onError?.(error)
      return this.defaults
    }
  }

  /** Atomically persist `value`. */
  writeSync(value: T): void {
    try {
      atomicWriteFileSync(this.path, jsonCodec.stringify(value), this.mode)
    } catch (error) {
      this.onError?.(error)
    }
  }

  /** Atomically persist `value`. */
  async write(value: T): Promise<void> {
    try {
      await atomicWriteFile(this.path, jsonCodec.stringify(value), this.mode)
    } catch (error) {
      this.onError?.(error)
    }
  }

  /** Read-modify-write in one synchronous step (e.g. event-handler call sites). */
  update(mutate: (current: T) => T): void {
    this.writeSync(mutate(this.readSync()))
  }
}
