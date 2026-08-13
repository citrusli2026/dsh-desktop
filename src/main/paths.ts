/**
 * Packaged and dev resource locations for the bundled harness runtime.
 * @module main/paths
 */
import { app } from 'electron'
import { join } from 'node:path'

/**
 * Root of the bundled harness closure: the Node runtime plus the
 * materialized @deepseek-ai/dsh node_modules. Packaged builds read it from
 * electron-builder's extraResources; dev builds from the repository checkout.
 * @returns the absolute harness root directory.
 */
export function harnessRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'harness')
    : join(app.getAppPath(), 'resources', 'harness')
}

/**
 * Absolute path of the bundled Node executable inside the closure.
 * @param root - harness root, defaulting to {@link harnessRoot}.
 * @returns the platform Node binary path.
 */
export function nodeBin(root: string = harnessRoot()): string {
  return join(root, 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
}

/**
 * Absolute path of the @deepseek-ai/dsh CLI entry inside the closure.
 * @param root - harness root, defaulting to {@link harnessRoot}.
 * @returns the dsh bin.js path.
 */
export function dshBin(root: string = harnessRoot()): string {
  return join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}
