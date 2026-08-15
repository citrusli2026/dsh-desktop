/**
 * Resolve the harness data home for the desktop shell.
 *
 * The desktop app is isolated by default (decision 0012): unless the user
 * explicitly sets `DSH_HOME`, the harness runs against `~/.dsh-desktop`
 * instead of the CLI's `~/.dsh`, so desktop and CLI keep separate settings,
 * credentials, sessions, and plugins. Setting `DSH_HOME=~/.dsh` restores
 * sharing with the CLI.
 * @module main/dsh-home
 */
import { join } from 'node:path'

/** Directory name of the shell-private data home, under the user home. */
export const DESKTOP_DSH_HOME_DIR = '.dsh-desktop'

/**
 * @param env environment to inspect (usually `process.env`)
 * @param home user home directory (usually `os.homedir()`)
 * @returns the effective DSH_HOME for the harness child process
 */
export function resolveDshHome(env: NodeJS.ProcessEnv, home: string): string {
  const explicit = env.DSH_HOME
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit
  return join(home, DESKTOP_DSH_HOME_DIR)
}
