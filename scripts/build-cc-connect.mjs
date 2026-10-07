import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SUBMODULE = join(ROOT, 'third_party', 'cc-connect')
const SIDECAR_ROOT = join(ROOT, 'resources', 'cc-connect')
const PACKAGE_JSON = join(ROOT, 'package.json')

const GOOS_BY_PLATFORM = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
}

const GOARCH_BY_ARCH = {
  arm: 'arm',
  arm64: 'arm64',
  x64: 'amd64',
}

const EXCLUDED_AGENT_TAGS = [
  'no_antigravity',
  'no_claudecode',
  'no_codex',
  'no_copilot',
  'no_cursor',
  'no_devin',
  'no_gemini',
  'no_iflow',
  'no_kimi',
  'no_opencode',
  'no_pi',
  'no_qoder',
  'no_reasonix',
  'no_tmux',
]

const EXCLUDED_PLATFORM_TAGS = [
  'no_cloud_web',
  'no_dingtalk',
  'no_discord',
  'no_googlechat',
  'no_line',
  'no_matrix',
  'no_max',
  'no_qq',
  'no_qqbot',
  'no_slack',
  'no_telegram',
  'no_tuitui',
  'no_webex',
  'no_wecom',
  'no_weibo',
  'no_weixin',
  'no_wps_agentspace',
  'no_wps_xiezuo',
  'no_yuanbao',
]

export const SIDECAR_BUILD_TAGS = ['no_web', ...EXCLUDED_AGENT_TAGS, ...EXCLUDED_PLATFORM_TAGS]

export function targetForPlatform(platform = process.platform, arch = process.arch) {
  const goos = GOOS_BY_PLATFORM[platform]
  const goarch = GOARCH_BY_ARCH[arch]
  if (goos === undefined || goarch === undefined) {
    throw new Error(`unsupported cc-connect target ${platform}/${arch}; supported targets are darwin, linux, and win32 on arm64, arm, or x64`)
  }
  return {
    goos,
    goarch,
    binaryName: goos === 'windows' ? 'cc-connect.exe' : 'cc-connect',
  }
}

export function buildLdflags(version, commit, buildTime) {
  return [
    '-s',
    '-w',
    `-X main.version=${version}`,
    `-X main.commit=${commit}`,
    `-X main.buildTime=${buildTime}`,
  ].join(' ')
}

export function createSidecarManifest({ commit, platform, arch, binary, sha256 }) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`invalid cc-connect commit: ${commit}`)
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`invalid cc-connect SHA-256: ${sha256}`)
  return {
    version: 1,
    commit,
    platform,
    arch,
    binary,
    sha256,
  }
}

function commandText(command, args) {
  return [command, ...args].map(part => JSON.stringify(part)).join(' ')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (result.error !== undefined) {
    throw new Error(`${commandText(command, args)} failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(`${commandText(command, args)} exited ${String(result.status)}${detail === '' ? '' : `: ${detail}`}`)
  }
  return String(result.stdout ?? '').trim()
}

function git(args) {
  return run('git', ['-C', SUBMODULE, ...args])
}

function fail(message, repairCommand) {
  throw new Error(`${message}\nFix: ${repairCommand}`)
}

function ensureSubmodule() {
  if (!existsSync(join(SUBMODULE, 'cmd', 'cc-connect'))) {
    fail(
      'cc-connect submodule is missing or incomplete at third_party/cc-connect',
      'git submodule update --init --recursive third_party/cc-connect',
    )
  }
  try {
    if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error('not a work tree')
  } catch (error) {
    fail(
      `cc-connect submodule is not a usable Git checkout: ${error instanceof Error ? error.message : String(error)}`,
      'git submodule update --init --recursive third_party/cc-connect',
    )
  }
  let status
  try {
    status = git(['status', '--porcelain', '--untracked-files=all'])
  } catch (error) {
    fail(
      `could not inspect cc-connect submodule status: ${error instanceof Error ? error.message : String(error)}`,
      'git submodule update --init --recursive third_party/cc-connect',
    )
  }
  if (status !== '') {
    fail(
      'cc-connect submodule worktree is dirty; refusing to build an unpinned binary',
      'git -C third_party/cc-connect status --short && git -C third_party/cc-connect stash push --include-untracked',
    )
  }
  let commit
  try {
    commit = git(['rev-parse', 'HEAD'])
  } catch (error) {
    fail(
      `could not read cc-connect submodule commit: ${error instanceof Error ? error.message : String(error)}`,
      'git -C third_party/cc-connect rev-parse HEAD',
    )
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    fail('cc-connect submodule HEAD is not a full commit SHA', 'git -C third_party/cc-connect rev-parse HEAD')
  }
  return commit
}

function ensureGo() {
  try {
    return run('go', ['version'])
  } catch (error) {
    fail(
      `Go is required to build cc-connect: ${error instanceof Error ? error.message : String(error)}`,
      'install Go from https://go.dev/dl/ and verify it with: go version',
    )
  }
}

async function sha256File(path) {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

async function ensureExecutable(path, platform) {
  let fileStat
  try {
    fileStat = await stat(path)
  } catch (error) {
    fail(
      `cc-connect build did not produce ${path}: ${error instanceof Error ? error.message : String(error)}`,
      'run pnpm run cc-connect:build after checking the Go toolchain',
    )
  }
  if (!fileStat.isFile() || (platform !== 'win32' && (fileStat.mode & 0o111) === 0)) {
    fail(
      `cc-connect output is not executable: ${path}`,
      'chmod +x resources/cc-connect/bin/cc-connect && rerun pnpm run cc-connect:build',
    )
  }
}

function assertVersion(path) {
  const result = spawnSync(path, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })
  if (result.error !== undefined || result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    fail(
      `cc-connect --version failed${detail === '' ? '' : `: ${detail}`}`,
      'rerun pnpm run cc-connect:build and inspect the Go build output',
    )
  }
}

async function writeManifest(path, manifest) {
  const temporary = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function buildSidecar({ platform = process.platform, arch = process.arch } = {}) {
  const target = targetForPlatform(platform, arch)
  const commit = ensureSubmodule()
  const goVersion = ensureGo()
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  const temporaryBinary = join(SIDECAR_ROOT, 'bin', `.${target.binaryName}.${process.pid}.tmp`)
  const binaryPath = join(SIDECAR_ROOT, 'bin', target.binaryName)
  const manifestPath = join(SIDECAR_ROOT, 'manifest.json')
  const buildTime = new Date().toISOString()

  await mkdir(join(SIDECAR_ROOT, 'bin'), { recursive: true })
  await rm(temporaryBinary, { force: true })
  try {
    try {
      run('go', [
        'build',
        '-trimpath',
        '-tags',
        SIDECAR_BUILD_TAGS.join(' '),
        '-ldflags',
        buildLdflags(String(packageJson.version), commit, buildTime),
        '-o',
        temporaryBinary,
        './cmd/cc-connect',
      ], {
        cwd: SUBMODULE,
        env: {
          ...process.env,
          CGO_ENABLED: '0',
          GOARCH: target.goarch,
          GOOS: target.goos,
        },
      })
    } catch (error) {
      fail(
        `Go failed to build cc-connect: ${error instanceof Error ? error.message : String(error)}`,
        'pnpm run cc-connect:build after fixing the Go dependency or toolchain error',
      )
    }
    await ensureExecutable(temporaryBinary, platform)
    assertVersion(temporaryBinary)
    const sha256 = await sha256File(temporaryBinary)
    await rm(binaryPath, { force: true })
    await rename(temporaryBinary, binaryPath)
    const manifest = createSidecarManifest({
      commit,
      platform,
      arch,
      binary: `bin/${target.binaryName}`,
      sha256,
    })
    await writeManifest(manifestPath, manifest)
    console.log(`cc-connect: built ${target.goos}/${target.goarch} at ${commit} (${goVersion})`)
    console.log(`cc-connect: ${binaryPath}`)
    console.log(`cc-connect: sha256 ${sha256}`)
    return manifest
  } finally {
    await rm(temporaryBinary, { force: true })
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildSidecar().catch(error => {
    console.error(`cc-connect build: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
