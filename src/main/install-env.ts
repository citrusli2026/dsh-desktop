/**
 * Child-process environment for shell-initiated installs: the market bundle
 * (decision 0024) and the kernel overlay (decision 0026). The dsh CLI
 * forwards `plugin add` to whatever `pnpm` is on PATH, and a packaged app
 * launched from Finder/Explorer inherits the OS-minimal PATH — so the shell
 * materializes its own pnpm/node launchers from the bundled closure and
 * fronts them on PATH. GUI launches also carry no proxy env vars, while
 * pnpm only reads proxies from the environment; the system proxy (Chromium
 * resolution) is translated into the env vars npm-family tools honor.
 * @module main/install-env
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Directory holding the pnpm/node launchers, inside the shell userData. */
export function installShimsDir(userData: string): string {
  return join(userData, 'bin-shims')
}

/** The bundled pnpm/node launchers as a child PATH prefix. Idempotent: an
 *  existing shim is overwritten with the current tool paths. */
export function ensureInstallShims(
  userData: string,
  tools: { nodeBin: string; pnpmBin: string },
  platform: NodeJS.Platform = process.platform,
): string {
  const dir = installShimsDir(userData)
  mkdirSync(dir, { recursive: true })
  if (platform === 'win32') {
    writeFileSync(join(dir, 'pnpm.cmd'), `@echo off\r\n"${tools.nodeBin}" "${tools.pnpmBin}" %*\r\n`)
    writeFileSync(join(dir, 'node.cmd'), `@echo off\r\n"${tools.nodeBin}" %*\r\n`)
  } else {
    // Absolute paths, quoted: userData may contain spaces.
    writeFileSync(join(dir, 'pnpm'), `#!/bin/sh\nexec "${tools.nodeBin}" "${tools.pnpmBin}" "$@"\n`)
    writeFileSync(join(dir, 'node'), `#!/bin/sh\nexec "${tools.nodeBin}" "$@"\n`)
    chmodSync(join(dir, 'pnpm'), 0o755)
    chmodSync(join(dir, 'node'), 0o755)
  }
  return dir
}

/** Prepend one directory to the env's PATH (either spelling on Windows). */
export function prependPath(env: NodeJS.ProcessEnv, dir: string, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  const separator = platform === 'win32' ? ';' : ':'
  const current = env[key]
  return { ...env, [key]: current === undefined || current === '' ? dir : `${dir}${separator}${current}` }
}

/**
 * Translate a Chromium `resolveProxy` string ("DIRECT", "PROXY host:port",
 * "SOCKS5 host:port") into the proxy env vars pnpm and the dsh CLI honor.
 * Explicit environment proxies win — a user who set HTTPS_PROXY meant it.
 */
export function proxyEnvFromResolveProxy(resolveProxy: string | undefined, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const explicit = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']
    .some(name => env[name] !== undefined && env[name] !== '')
  if (explicit || resolveProxy === undefined || resolveProxy.trim() === '') return {}
  const entry = resolveProxy
    .split(';')
    .map(part => part.trim())
    .find(part => part !== '' && !/^direct/i.test(part))
  const match = /^(PROXY|HTTPS|SOCKS5?)\s+(\S+)$/i.exec(entry ?? '')
  if (match === null) return {}
  const scheme = match[1]!.toUpperCase()
  const host = match[2]!
  const noProxy = { NO_PROXY: 'localhost,127.0.0.1,::1' }
  if (scheme === 'SOCKS' || scheme === 'SOCKS5') return { ALL_PROXY: `socks5://${host}`, ...noProxy }
  const url = scheme === 'HTTPS' ? `https://${host}` : `http://${host}`
  return { HTTPS_PROXY: url, HTTP_PROXY: url, ...noProxy }
}
