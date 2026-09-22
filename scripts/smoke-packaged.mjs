/** Locate the current platform's unpacked app and run its built-in smoke mode. */
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable, packagedResourcesDir } from './packaged-locator.mjs'
// Shared with the app's built-in smoke mode (src/main/smoke.ts) so the flag,
// exit codes, and injection env vars cannot drift between the two sides.
import { SMOKE_CLOSURE_FLAG, SMOKE_EXIT_FAIL, SMOKE_EXIT_OK, SMOKE_FLAG, SMOKE_SAFE_ENV, SMOKE_UI_FLAG, TEST_TAMPER_CLOSURE_ENV } from '../src/main/smoke-protocol.ts'

const distRoot = process.argv[2] ?? 'dist'
const executable = await locatePackagedExecutable(distRoot)
for (const required of ['agent-trash-hook/agent-trash-hook.mjs', 'agent-trash-hook/rm-parser.mjs']) {
  await access(join(packagedResourcesDir(executable), required))
}

// DSH_SMOKE_UI adds the UI-render variant: the plain smoke fetches the boot
// HTML, the UI variant additionally proves the real Harness bundle rendered.
const smokeUi = process.env.DSH_SMOKE_UI === '1'
// DSH_DESKTOP_SAFE_BREAK runs the two-stage Safe Mode case: a broken plugin
// must fail the ordinary boot, then the same profile in Safe Mode recovers
// and the Safe Mode banner renders (decision 0021).
const safeBreak = process.env.DSH_DESKTOP_SAFE_BREAK === '1'
// DSH_SMOKE_CLOSURE adds the closure-integrity variant (decision 0032): the
// packaged tree must verify against its manifest, and a tampered tree must
// be reported as changed.
const smokeClosure = process.env.DSH_SMOKE_CLOSURE === '1'

const dshHome = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-'))
const userData = join(dshHome, 'electron-user-data')
await mkdir(userData, { recursive: true })

/** Spawn the app in smoke mode; echos child output while capturing it. */
function runSmoke({ flags = [], env = {} } = {}) {
  return new Promise((resolve, reject) => {
    // The unpacked tree has no SUID chrome-sandbox (deb postinst sets it at
    // install time), so headless CI smoke runs with the Chromium sandbox off,
    // same as the e2e fixture.
    const args = [SMOKE_FLAG, `--user-data-dir=${userData}`, ...flags]
    if (process.platform === 'linux') args.push('--no-sandbox')
    const child = spawn(executable, args, {
      env: { ...process.env, DSH_HOME: dshHome, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', chunk => {
        output += chunk
        process.stderr.write(chunk)
      })
    }
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('packaged smoke timed out after 180 seconds'))
    }, 180_000)
    child.once('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', code => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ code: code ?? -1, output })
    })
  })
}

/**
 * Materialise a profile with one throwing user bundle, mirroring what
 * `dsh plugin add` writes (spike 2026-08-28): pnpm deps + `dsh.profile.bundles`.
 */
async function installBrokenPlugin() {
  const pkg = 'dsh-smoke-broken-plugin'
  const profileDir = join(dshHome, 'profiles', 'web')
  const pkgDir = join(profileDir, 'node_modules', pkg)
  await mkdir(pkgDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: { [pkg]: `file:${pkg}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', pkg] } },
  }, null, 2))
  await writeFile(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  await writeFile(join(pkgDir, 'package.json'), JSON.stringify({
    name: pkg, version: '1.0.0', type: 'module', main: 'index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  await writeFile(join(pkgDir, 'cordis.patch.yml'), '- insert:\n    - id: smoke-broken\n      name: dsh-smoke-broken-plugin\n')
  await writeFile(join(pkgDir, 'index.js'), "export default class { constructor() { throw new Error('SMOKE_BROKEN_PLUGIN') } }\n")
  await chmod(profileDir, 0o755)
}

try {
  if (smokeClosure) {
    // Stage 1 (positive): the freshly packaged tree must verify against its
    // own manifest. Stage 2 (negative): a corrupted closure file must be
    // reported as changed — the #39 upgrade-residue simulation. Both stages
    // exit OK when their assertion holds; the app's smoke-closure log line
    // records which integrity status each run observed.
    const clean = await runSmoke({ flags: [SMOKE_CLOSURE_FLAG] })
    if (clean.code !== SMOKE_EXIT_OK) throw new Error(`closure smoke: clean tree failed verification (code ${String(clean.code)})`)
    if (!/status=ok /.test(clean.output)) throw new Error('closure smoke: clean tree did not report status=ok')
    const tampered = await runSmoke({ flags: [SMOKE_CLOSURE_FLAG], env: { [TEST_TAMPER_CLOSURE_ENV]: '1' } })
    if (tampered.code !== SMOKE_EXIT_OK) throw new Error(`closure smoke: tamper-detection run failed (code ${String(tampered.code)})`)
    if (!/status=changed /.test(tampered.output)) throw new Error('closure smoke: tampered tree was not reported as changed')
    console.log(`packaged smoke: closure OK ${executable} (clean verified, tamper detected)`)
  } else if (safeBreak) {
    await installBrokenPlugin()
    // Stage 1 (kernel 0.1.7+ contract): the loader isolates a broken bundle
    // and the boot SUCCEEDS — the failure signature must still land in the
    // harness log, and readiness must be reached. (On older kernels the boot
    // crashed here; that contract died with the allSettled loader.)
    const broken = await runSmoke({ flags: [SMOKE_UI_FLAG] })
    if (broken.code !== SMOKE_EXIT_OK) {
      throw new Error(`safe-mode smoke: ordinary boot with a broken plugin failed (code ${String(broken.code)}); kernel 0.1.7 isolates broken entries instead`)
    }
    // The supervisor writes harness output to userData/logs/harness.log, so
    // the plugin-failure signature lives there rather than on stderr.
    const harnessLog = await readFile(join(userData, 'logs', 'harness.log'), 'utf8').catch(() => '')
    if (!harnessLog.includes('dsh-smoke-broken-plugin') || !harnessLog.includes('SMOKE_BROKEN_PLUGIN')) {
      throw new Error('safe-mode smoke: broken plugin failure signature missing from harness.log')
    }
    console.error('safe-mode smoke: broken plugin isolated by the kernel, boot reached readiness (as expected on 0.1.7+)')
    // Stage 2: Safe Mode quarantines the plugin, renders, and shows the banner.
    await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ safeMode: true, closeToTrayExplained: true }))
    const safe = await runSmoke({ flags: [SMOKE_UI_FLAG], env: { [SMOKE_SAFE_ENV]: '1' } })
    if (safe.code !== SMOKE_EXIT_OK) {
      // The kernel fail-louds on a torn/empty profile manifest; dump its
      // exact on-disk state so a recurrence carries direct evidence.
      const manifestPath = join(dshHome, 'profiles', 'web', 'package.json')
      const raw = await readFile(manifestPath, 'utf8').catch(error => `<read failed: ${error.code ?? error}>`)
      console.error(`safe-mode smoke: profile manifest ${manifestPath} (${typeof raw === 'string' ? `${Buffer.byteLength(raw)}B` : raw}): ${typeof raw === 'string' ? raw.slice(0, 400) : ''}`)
      throw new Error(`safe-mode smoke: safe boot failed with code ${String(safe.code)}`)
    }
    console.error('safe-mode smoke: OK — safe boot renders with the banner')
  } else {
    const flags = smokeUi ? [SMOKE_UI_FLAG] : []
    const result = await runSmoke({ flags })
    if (result.code !== SMOKE_EXIT_OK) throw new Error(`packaged smoke exited with code ${String(result.code)}`)
    console.log(`packaged smoke: OK ${executable}${smokeUi ? ' (smoke-ui)' : ''}`)
  }
} finally {
  await rm(dshHome, { recursive: true, force: true })
}
