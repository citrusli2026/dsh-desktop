/**
 * Agent deletion interception: when enabled, the shell mounts the kernel's
 * Claude-Code hook bridge with a generated hooks.json whose PreToolUse
 * command hook moves bash/pwsh deletion targets into the desktop trash
 * (resources/agent-trash-hook/). Two files are materialized under userData:
 * `agent-trash-hooks/hooks.json` (the hook config the bridge reads) and
 * `agent-trash-hook.patch.yml` (the patch row that mounts the bridge with
 * that configPath). Both are regenerated on every supervisor start so path
 * moves cannot leave them stale.
 * @module main/trash-hook
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { atomicWriteFileSync } from './config-file.ts'

export interface TrashHookPaths {
  /** The hook entry script shipped next to the harness under resources/. */
  hookScriptPath: string
  /** Node binary that runs the hook script. */
  nodePath: string
  /** userData directory receiving the generated files. */
  userData: string
}

/** Quote one command path for the shell that runs hook commands. */
export function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  const q = String.fromCharCode(39)
  if (platform === "win32") return q + value.replaceAll(q, q + q) + q
  return q + value.replaceAll(q, q + String.fromCharCode(92) + q + q) + q
}

/** Build the shell command that runs the bundled hook script. */
export function renderHookCommand(paths: Pick<TrashHookPaths, "nodePath" | "hookScriptPath">, platform: NodeJS.Platform = process.platform): string {
  const prefix = platform === "win32" ? "& " : ""
  return prefix + shellQuote(paths.nodePath, platform) + " " + shellQuote(paths.hookScriptPath, platform)
}

export function trashHookConfigPath(paths: TrashHookPaths): string {
  return join(paths.userData, 'agent-trash-hooks', 'hooks.json')
}

export function trashHookPatchPath(paths: TrashHookPaths): string {
  return join(paths.userData, 'agent-trash-hook.patch.yml')
}

/** The hooks.json document the Claude-Code bridge parses at boot. */
export function renderHooksJson(paths: TrashHookPaths, platform: NodeJS.Platform = process.platform): string {
  const command = JSON.stringify(renderHookCommand(paths, platform))
  return `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "bash|pwsh",
        "hooks": [
          { "type": "command", "command": ${command} }
        ]
      }
    ]
  }
}
`
}

/** The patch row that mounts the kernel hook bridge with our configPath. */
export function renderTrashHookPatch(paths: TrashHookPaths): string {
  const configPath = JSON.stringify(trashHookConfigPath(paths))
  return `# Mount the agent deletion interception hook (desktop trash).
- insert:
    - id: dsh-desktop-trash-hook
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: ${configPath}
`
}

/** Materialize both files; returns the patch path for `--patch`. */
export function writeTrashHookFiles(paths: TrashHookPaths, platform: NodeJS.Platform = process.platform): string {
  mkdirSync(dirname(trashHookConfigPath(paths)), { recursive: true })
  atomicWriteFileSync(trashHookConfigPath(paths), renderHooksJson(paths, platform))
  atomicWriteFileSync(trashHookPatchPath(paths), renderTrashHookPatch(paths))
  return trashHookPatchPath(paths)
}
