/** Cross-version installer smoke with one shared, user-owned profile.
 *
 * Usage: node scripts/smoke-upgrade.mjs <macos|nsis|dpkg> <current-dist> <previous-dir>
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'
import { SMOKE_EXIT_OK, SMOKE_FLAG } from '../src/main/smoke-protocol.ts'
import { isCurrentInstaller } from './download-previous-release.mjs'

const execFileP = promisify(execFile)
const method = process.argv[2]
const currentDir = resolve(process.argv[3] ?? 'dist')
const previousDir = resolve(process.argv[4] ?? 'test-results/previous-release')
const currentVersion = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version
const root = await mkdtemp(join(tmpdir(), 'dsh cross-version upgrade 中文-'))
const dshHome = join(root, 'DSH profile 用户数据')
const userData = join(root, 'Electron preferences 桌面数据')

async function findOne(dir, predicate) {
  const files = (await readdir(dir)).filter(predicate)
  if (files.length !== 1) throw new Error(`expected one matching installer under ${dir}, found ${files.length}`)
  return join(dir, files[0])
}

async function smoke(executable) {
  const args = [SMOKE_FLAG, `--user-data-dir=${userData}`]
  if (process.platform === 'linux' && method !== 'dpkg') args.push('--no-sandbox')
  const code = await new Promise((resolveCode, reject) => {
    const child = spawn(executable, args, { env: { ...process.env, DSH_HOME: dshHome }, stdio: 'inherit' })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`upgrade smoke timed out: ${executable}`))
    }, 180_000)
    child.once('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveCode(value)
    })
  })
  if (code !== SMOKE_EXIT_OK) throw new Error(`upgrade smoke exited ${String(code)}: ${executable}`)
}

async function seedUserState() {
  const profile = join(dshHome, 'profiles', 'web')
  const market = join(profile, 'node_modules', 'dshmarket')
  await mkdir(market, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n')
  await writeFile(join(dshHome, 'upgrade-user-marker.txt'), 'preserve-user-owned-data\n')
  await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({
    closeToTrayExplained: true,
    desktopShortcut: 'CommandOrControl+Alt+K',
    notificationsEnabled: false,
    safeMode: true,
  }, null, 2) + '\n')
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web', private: true,
    dependencies: { dshmarket: 'file:dshmarket' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'] } },
  }, null, 2) + '\n')
  await writeFile(join(market, 'package.json'), JSON.stringify({
    name: 'dshmarket', version: '9.9.9-upgrade-fixture', type: 'module', main: 'index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2) + '\n')
  await writeFile(join(market, 'cordis.patch.yml'), '- insert:\n    - id: upgrade-market-fixture\n      name: dshmarket\n')
  // Safe Mode must quarantine this deliberately bad community bundle. A
  // successful post-upgrade smoke proves both the preference and profile are read.
  await writeFile(join(market, 'index.js'), "export default class { constructor() { throw new Error('UPGRADE_FIXTURE_MUST_BE_QUARANTINED') } }\n")
}

const preserved = [
  join(dshHome, 'settings.yaml'),
  join(dshHome, 'upgrade-user-marker.txt'),
  join(userData, 'shell-preferences.json'),
  join(dshHome, 'profiles', 'web', 'package.json'),
  join(dshHome, 'profiles', 'web', 'node_modules', 'dshmarket', 'package.json'),
  join(dshHome, 'profiles', 'web', 'node_modules', 'dshmarket', 'cordis.patch.yml'),
  join(dshHome, 'profiles', 'web', 'node_modules', 'dshmarket', 'index.js'),
]

async function snapshot() {
  return Object.fromEntries(await Promise.all(preserved.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
}

async function assertPreserved(before) {
  const after = await snapshot()
  for (const path of preserved) {
    if (before[path] !== after[path]) throw new Error(`upgrade changed user-owned state: ${path}`)
  }
}

async function installedDpkgExecutable() {
  const { stdout } = await execFileP('dpkg', ['-L', 'dsh-desktop'], { maxBuffer: 32 * 1024 * 1024 })
  for (const candidate of stdout.split('\n').filter(line => line.endsWith('/dsh-desktop'))) {
    const info = await stat(candidate).catch(() => null)
    if (info?.isFile() && (info.mode & 0o111) !== 0) return candidate
  }
  throw new Error('installed dsh-desktop binary not found')
}

async function copyAppFromDmg(dmg, destination) {
  const { stdout } = await execFileP('hdiutil', ['attach', '-nobrowse', '-readonly', dmg], { maxBuffer: 8 * 1024 * 1024 })
  const mount = stdout.split('\n').map(line => line.split('\t').at(-1)?.trim()).find(value => value?.startsWith('/Volumes/'))
  if (mount === undefined) throw new Error(`hdiutil did not report a mount point for ${dmg}`)
  try {
    const app = (await readdir(mount)).find(name => name.endsWith('.app'))
    if (app === undefined) throw new Error(`no .app found in ${dmg}`)
    await rm(destination, { recursive: true, force: true })
    await execFileP('ditto', [join(mount, app), destination], { maxBuffer: 8 * 1024 * 1024 })
  } finally {
    await execFileP('hdiutil', ['detach', mount], { timeout: 60_000 }).catch(() => undefined)
  }
}

await mkdir(dshHome, { recursive: true })
await mkdir(userData, { recursive: true })
try {
  if (method === 'macos') {
    const previous = await findOne(previousDir, name => name.endsWith('.dmg'))
    const current = await findOne(currentDir, name => isCurrentInstaller(name, currentVersion, 'darwin'))
    const installedApp = join(root, 'Applications', 'dsh-desktop.app')
    await mkdir(join(root, 'Applications'), { recursive: true })
    await copyAppFromDmg(previous, installedApp)
    await smoke(join(installedApp, 'Contents', 'MacOS', 'dsh-desktop'))
    await seedUserState()
    const before = await snapshot()
    await copyAppFromDmg(current, installedApp)
    await assertPreserved(before)
    await smoke(join(installedApp, 'Contents', 'MacOS', 'dsh-desktop'))
    await assertPreserved(before)
  } else if (method === 'nsis') {
    const previous = await findOne(previousDir, name => name.endsWith('.exe'))
    const current = await findOne(currentDir, name => isCurrentInstaller(name, currentVersion, 'win32'))
    const installDir = join(root, 'installed app')
    await execFileP(previous, ['/S', `/D=${installDir}`], { timeout: 300_000 })
    const executable = join(installDir, 'dsh-desktop.exe')
    await smoke(executable)
    await seedUserState()
    const before = await snapshot()
    // electron-builder's assisted NSIS installer can wait indefinitely when
    // silently launched over an existing install (also reproduced by the
    // same-version installed smoke). Exercise the supported uninstall/install
    // upgrade path instead; user-owned state lives outside the app directory.
    const uninstaller = join(installDir, 'Uninstall dsh-desktop.exe')
    await execFileP(uninstaller, ['/S'], { timeout: 300_000 })
    await assertPreserved(before)
    await execFileP(current, ['/S', `/D=${installDir}`], { timeout: 300_000 })
    await assertPreserved(before)
    await smoke(executable)
    await assertPreserved(before)
    await execFileP(uninstaller, ['/S'], { timeout: 300_000 }).catch(() => undefined)
  } else if (method === 'dpkg') {
    const previous = await findOne(previousDir, name => name.endsWith('.deb'))
    const current = await findOne(currentDir, name => isCurrentInstaller(name, currentVersion, 'linux'))
    await execFileP('sudo', ['apt-get', 'install', '-y', previous], { timeout: 600_000, maxBuffer: 32 * 1024 * 1024 })
    const executable = await installedDpkgExecutable()
    await smoke(executable)
    await seedUserState()
    const before = await snapshot()
    await execFileP('sudo', ['apt-get', 'install', '-y', current], { timeout: 600_000, maxBuffer: 32 * 1024 * 1024 })
    await assertPreserved(before)
    await smoke(executable)
    await assertPreserved(before)
  } else {
    throw new Error('usage: smoke-upgrade.mjs <macos|nsis|dpkg> <current-dist> <previous-dir>')
  }
  console.log(`cross-version upgrade smoke: OK (${method}) — preserved ${preserved.length} user-owned files`)
} finally {
  await chmod(dshHome, 0o755).catch(() => undefined)
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch(error => {
    console.warn(`cross-version upgrade smoke: temporary cleanup skipped (${error?.code ?? 'unknown error'})`)
  })
}
