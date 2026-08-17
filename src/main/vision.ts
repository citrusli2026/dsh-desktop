/**
 * Vision plugin management: detect modlens status, read version,
 * and provide the pre-installed extension metadata for the About dialog.
 *
 * modlens is pre-bundled in the harness closure (manifest/harness/package.json);
 * no runtime installation step is needed. This module reads the installed
 * version from the closure's node_modules and exposes it to the shell chrome.
 * @module main/vision
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { harnessRoot } from './paths.ts'

export interface VisionPluginInfo {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly installed: boolean
}

const MODLENS_PACKAGE = '@liustack/modlens'
const MODLENS_DESCRIPTION = '视觉识别插件 — 为纯文本模型提供图片理解能力（OCR、布局分析、语义结构化）'

/**
 * Read the installed modlens version from the bundled harness closure.
 * Returns undefined when the closure is not yet bootstrapped (e.g. first run
 * before `pnpm run bootstrap`).
 */
export function readModlensVersion(harnessDir: string = harnessRoot()): string | undefined {
  const pkgPath = join(harnessDir, 'node_modules', MODLENS_PACKAGE, 'package.json')
  if (!existsSync(pkgPath)) return undefined
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Return metadata about the pre-installed vision plugin for display in the
 * About dialog and settings window.
 */
export function getVisionPluginInfo(): VisionPluginInfo {
  const version = readModlensVersion()
  return {
    name: 'ModLens',
    version: version ?? '未安装',
    description: MODLENS_DESCRIPTION,
    installed: version !== undefined,
  }
}
