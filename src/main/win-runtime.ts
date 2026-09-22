/**
 * Windows runtime-library health (#56 family): sharp's prebuilt native
 * binaries need the Microsoft Visual C++ 2015-2022 redistributable, and a
 * machine without it fails `ERR_DLOPEN_FAILED` ("module not found") even
 * though every shipped file is intact. Detect the redistributable's DLLs in
 * System32 so the health check and a one-time first-run dialog can point the
 * user at the official installer instead of a generic error.
 * @module main/win-runtime
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Official Microsoft direct link (aka.ms alias, x64 redistributable). */
export const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'

/** DLLs shipped by the VC++ 2015-2022 redistributable that sharp's prebuilt
 *  binaries load at dlopen time. */
export const VC_RUNTIME_DLLS = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'] as const

/** Names of the redistributable DLLs missing from System32; empty when the
 *  runtime is present — or always empty off Windows. `platform` is injectable
 *  for tests. */
export function missingVcRuntimeDlls(
  systemRoot = process.env.SystemRoot ?? 'C:\\Windows',
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform !== 'win32') return []
  const system32 = join(systemRoot, 'System32')
  return VC_RUNTIME_DLLS.filter(name => !existsSync(join(system32, name)))
}

/** Prompt gating: only Windows, only when DLLs are missing, and only when the
 *  user has not dismissed the dialog before (a single marker file). */
export function shouldPromptVcRuntime(
  platform: NodeJS.Platform,
  missing: readonly string[],
  dismissed: boolean,
): boolean {
  return platform === 'win32' && missing.length > 0 && !dismissed
}

/** Marker file path recording "the user saw and dismissed the dialog". */
export function vcRuntimeDismissedPath(userData: string): string {
  return join(userData, 'vc-runtime-prompt-dismissed')
}
