#!/usr/bin/env node
/**
 * Rebuild ABI-bound harness addons with the bundled Node runtime, then prove
 * they load and perform their critical operation. The developer/CI Node may
 * be newer than the Node 22 runtime shipped inside the app.
 *
 * fs-ext is the only prebuild-less, ABI-locked addon in the closure, so it is
 * rebuilt only when the kernel's dependency tree actually ships it: kernel
 * 0.1.5-alpha.1 replaced it with the prebuilt Node-API
 * @deepseek-ai/node-addon-system. The manifest lockfile is the source of
 * truth for whether fs-ext should be present.
 * @module scripts/rebuild-harness-native
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, posix, resolve, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'

export function harnessRuntimePaths(root, platform = process.platform) {
  const windows = platform === 'win32'
  const path = windows ? win32 : posix
  const harness = path.join(root, 'resources', 'harness')
  const nodeRoot = path.join(harness, 'node')
  return {
    harness,
    node: path.join(nodeRoot, 'bin', windows ? 'node.exe' : 'node'),
    nodeGyp: path.join(
      nodeRoot,
      ...(windows ? [] : ['lib']),
      'node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js',
    ),
    fsExt: path.join(harness, 'node_modules', 'fs-ext'),
  }
}

export function prependRuntimePath(env, node, platform = process.platform) {
  const path = platform === 'win32' ? win32 : posix
  const key = platform === 'win32' && env.Path !== undefined ? 'Path' : 'PATH'
  return { ...env, [key]: [path.dirname(node), env[key]].filter(Boolean).join(path.delimiter) }
}

/** Lockfile reference to fs-ext without catching fs-extra & friends: package
 *  entries are `fs-ext@<version>:` and importer deps are a bare `fs-ext:` key. */
const FS_EXT_LOCK_PATTERN = /fs-ext@\d|^\s*fs-ext:\s*$/m

export function lockfileRequiresFsExt(lockfileText) {
  return FS_EXT_LOCK_PATTERN.test(lockfileText)
}

/** Decide the fs-ext step from closure reality vs the lockfile: present →
 *  rebuild; absent while still pinned → the closure was pruned wrongly;
 *  absent and unpinned → the kernel dropped it, nothing to rebuild. */
export function planFsExtStep(fsExtPath, root) {
  if (existsSync(fsExtPath)) return { action: 'rebuild' }
  const lockfilePath = join(root, 'manifest', 'harness', 'pnpm-lock.yaml')
  if (!existsSync(lockfilePath)) {
    return { error: `lockfile missing at ${lockfilePath}; cannot verify the fs-ext requirement` }
  }
  if (lockfileRequiresFsExt(readFileSync(lockfilePath, 'utf8'))) {
    return { error: `fsExt missing at ${fsExtPath} while ${lockfilePath} still pins it` }
  }
  return { action: 'skip' }
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`'${command} ${args.join(' ')}' exited ${String(result.status)}`)
}

export function rebuildHarnessNative(root = process.cwd(), platform = process.platform) {
  const paths = harnessRuntimePaths(root, platform)
  for (const [label, path] of Object.entries(paths)) {
    if (label === 'fsExt') continue
    if (!existsSync(path)) throw new Error(`${label} missing at ${path}`)
  }

  const env = prependRuntimePath(process.env, paths.node, platform)
  const plan = planFsExtStep(paths.fsExt, root)
  if (plan.error !== undefined) throw new Error(plan.error)
  if (plan.action === 'skip') {
    console.log('harness-native: fs-ext is not in this kernel tree (prebuilt Node-API addons); nothing to rebuild')
    return
  }

  run(paths.node, [paths.nodeGyp, 'rebuild'], { cwd: paths.fsExt, env })

  const probe = [
    "const fs = require('node:fs')",
    "const os = require('node:os')",
    "const path = require('node:path')",
    "const fsExt = require('fs-ext')",
    "const file = path.join(os.tmpdir(), `dsh-fs-ext-${process.pid}.lock`)",
    "const fd = fs.openSync(file, 'w')",
    "try { fsExt.flockSync(fd, 'ex'); fsExt.flockSync(fd, 'un') } finally { fs.closeSync(fd); fs.rmSync(file, { force: true }) }",
    "console.log(`harness-native: fs-ext lock roundtrip passed (Node ${process.version}, ABI ${process.versions.modules})`)",
  ].join(';')
  run(paths.node, ['-e', probe], { cwd: paths.harness, env })
}

const entry = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (entry === import.meta.url) {
  try {
    rebuildHarnessNative()
  } catch (error) {
    console.error('harness-native:', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
