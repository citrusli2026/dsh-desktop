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

export function trashHookConfigPath(paths: TrashHookPaths): string {
  return join(paths.userData, 'agent-trash-hooks', 'hooks.json')
}

export function trashHookPatchPath(paths: TrashHookPaths): string {
  return join(paths.userData, 'agent-trash-hook.patch.yml')
}

/** The hooks.json document the Claude-Code bridge parses at boot. */
export function renderHooksJson(paths: TrashHookPaths): string {
  const command = JSON.stringify(`${paths.nodePath} ${paths.hookScriptPath}`)
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
export function writeTrashHookFiles(paths: TrashHookPaths): string {
  mkdirSync(dirname(trashHookConfigPath(paths)), { recursive: true })
  atomicWriteFileSync(trashHookConfigPath(paths), renderHooksJson(paths))
  atomicWriteFileSync(trashHookPatchPath(paths), renderTrashHookPatch(paths))
  return trashHookPatchPath(paths)
}
