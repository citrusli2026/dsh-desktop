import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface MobileShellManifest {
  readonly format: 'dsh-mobile-shell-web'
  readonly formatVersion: 1
  readonly version: string
  readonly runtime?: { readonly node?: string }
  readonly entrypoints: {
    readonly proxy: string
    readonly launcher: string
    readonly pairing: string
  }
}

export interface MobileShellArtifact {
  readonly root: string
  readonly manifest: MobileShellManifest
  readonly proxyPath: string
  readonly launcherPath: string
  readonly pairingPath: string
}

function artifactPath(root: string, value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) {
    throw new Error(`mobile-shell manifest has an invalid ${name} entrypoint`)
  }
  const result = resolve(root, value)
  const rel = relative(root, result)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`mobile-shell ${name} entrypoint escapes the artifact root`)
  }
  if (!existsSync(result)) throw new Error(`mobile-shell ${name} entrypoint is missing: ${value}`)
  return result
}

export function readMobileShellArtifact(rootInput: string): MobileShellArtifact {
  const root = resolve(rootInput)
  const manifestPath = join(root, 'web-artifact.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`mobile-shell Web artifact manifest is missing: ${manifestPath}`)
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`mobile-shell Web artifact manifest is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof manifest !== 'object' || manifest === null) throw new Error('mobile-shell Web artifact manifest is invalid')
  const candidate = manifest as Partial<MobileShellManifest>
  if (candidate.format !== 'dsh-mobile-shell-web' || candidate.formatVersion !== 1) {
    throw new Error(`unsupported mobile-shell Web artifact format in ${manifestPath}`)
  }
  if (typeof candidate.version !== 'string'
    || candidate.version.length === 0
    || typeof candidate.entrypoints !== 'object'
    || candidate.entrypoints === null) {
    throw new Error(`mobile-shell Web artifact manifest is incomplete: ${manifestPath}`)
  }
  const typedManifest = candidate as MobileShellManifest
  return {
    root,
    manifest: typedManifest,
    proxyPath: artifactPath(root, typedManifest.entrypoints.proxy, 'proxy'),
    launcherPath: artifactPath(root, typedManifest.entrypoints.launcher, 'launcher'),
    pairingPath: artifactPath(root, typedManifest.entrypoints.pairing, 'pairing'),
  }
}
