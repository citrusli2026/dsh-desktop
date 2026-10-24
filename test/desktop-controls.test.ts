import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { desktopControlsPatchPath, prepareDesktopControlsMount } from '../src/main/desktop-controls.ts'

const pluginRoot = resolve('plugins/dsh-desktop-controls')

test('desktop controls package exposes a safe additive client plugin contract', async () => {
  const packageJson = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8')) as {
    dsh?: { client?: { platform?: string; inject?: string[] } }
    exports?: Record<string, string>
  }
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.deepEqual(packageJson.dsh?.client?.inject, ['@deepseek-ai/dsh-client-runtime'])
  assert.equal(packageJson.exports?.['./client'], './lib/client.js')
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  assert.match(client, /shell\.overlay/)
  assert.match(client, /startLanPairing/)
  // The overlay mirrors every desktop tool surface (2026-09 iteration:
  // check-for-updates, logs, and diagnostics joined the panel); fullscreen
  // stays a window function, not a tool (decision 0023).
  assert.doesNotMatch(client, /toggleFullscreen/)
  assert.match(client, /checkForUpdates/)
  assert.match(client, /openLogs/)
  assert.match(client, /exportDiagnostics/)
  assert.match(client, /showAbout/)
  // Passive star entry in the INFO group: a link, never a prompt.
  assert.match(client, /openStar/)
  assert.match(client, /Star on GitHub/)
  // Manual market entry: settings row + main-process install.
  assert.match(client, /getBundledPlugins/)
  assert.match(client, /lastInstall/)
  assert.match(client, /getStartupStatus/)
  assert.match(client, /data-dsh-controls-stage/)
  assert.match(client, /installDshMarket/)
  assert.match(client, /marketInstall/)
  assert.match(client, /marketDamaged/)
  assert.match(client, /marketRisk/)
  assert.match(client, /data-dsh-market-risk/)
  assert.match(client, /onMarketInstallProgress/)
  assert.match(client, /marketPreparing/)
  assert.match(client, /marketProxyFailed/)
  assert.match(client, /data-dsh-market-operation/)
  assert.match(client, /data-dsh-market-technical/)
  assert.match(client, /navigator\.clipboard\.writeText/)
  assert.doesNotMatch(client, /marketBusy \? "…"/)
  assert.match(client, /groupRecovery/)
  // The overlay and settings page expose an explicit visual hierarchy.
  assert.match(client, /data-dsh-controls-panel-head/)
  assert.match(client, /data-dsh-controls-action-detail/)
  assert.match(client, /panelConnect/)
  assert.match(client, /panelRecovery/)
  assert.match(client, /panelMaintenance/)
  assert.match(client, /panelInfo/)
  assert.match(client, /groupServices/)
  // Built-in extension toggle (ADR 0044): off by default, restart hint, upstream link.
  assert.match(client, /groupExtensions/)
  assert.match(client, /data-dsh-whale-toggle/)
  assert.match(client, /whaleWidgetEnabled/)
  assert.match(client, /openWhaleAuthor/)
  assert.match(client, /data-dsh-whale-restart/)
  assert.match(client, /id: "dsh-desktop-feishu"/)
  assert.match(client, /FeishuSettingsSection/)
  assert.match(client, /onClick: \(\) => void openConnectManager\(\)/)
  assert.match(client, /max-height: calc\(100vh - 16px\)/)
  assert.match(client, /new ResizeObserver\(place\)/)
  assert.match(client, /data-dsh-desktop-group/)
  assert.match(client, /data-dsh-desktop-lan-row": true, "data-dsh-desktop-setting-row/)
  assert.match(client, /data-dsh-desktop-advanced/)
  assert.match(client, /advancedTitle/)
  // Balance + kernel overlay rows (decisions 0025/0026).
  assert.match(client, /getBalance/)
  assert.match(client, /getKernelState/)
  assert.match(client, /kernelInstall/)
  // Feishu/cc-connect settings stay in the existing settings.section surface.
  assert.match(client, /dsh-desktop-connect/)
  assert.match(client, /getConnectState/)
  assert.match(client, /saveConnectSettings/)
  assert.match(client, /pickConnectWorkspace/)
  assert.match(client, /startConnect/)
  assert.match(client, /stopConnect/)
  assert.match(client, /restartConnect/)
  assert.match(client, /connectAppSecret/)
  assert.match(client, /connectProtected/)
  // Floating Feishu quick control: the selected application, the desktop
  // process and the Feishu channel are separate read-only rows; starting or
  // stopping only ever happens from an explicit button.
  assert.match(client, /connectFeishuQuickView/)
  assert.match(client, /data-dsh-feishu-quick/)
  assert.match(client, /data-dsh-feishu-quick-app/)
  assert.match(client, /data-dsh-feishu-process/)
  assert.match(client, /data-dsh-feishu-channel/)
  assert.match(client, /data-dsh-feishu-dsh/)
  assert.match(client, /data-dsh-feishu-hint/)
  assert.match(client, /data-dsh-feishu-start/)
  assert.match(client, /data-dsh-feishu-stop/)
  assert.match(client, /data-dsh-feishu-restart/)
  assert.match(client, /data-dsh-feishu-manage/)
  assert.match(client, /data-dsh-feishu-loading/)
  assert.match(client, /role: "group", "aria-label": copy\.feishuQuickTitle/)
  for (const key of ['feishuQuickTitle', 'feishuApplication', 'feishuProcess', 'feishuNoApplication', 'feishuLoading', 'feishuConfigureHint', 'feishuSecretReentryHint', 'feishuSafeModeHint', 'feishuDisabledHint', 'feishuStoppedHint', 'feishuReadyHint', 'feishuCrashHint', 'feishuStart', 'feishuStop', 'feishuRestart', 'feishuWorking', 'feishuManage', 'feishuStartFailed', 'feishuStopFailed']) {
    assert.equal((client.match(new RegExp(key + ':', 'g')) ?? []).length, 2, `${key} has Chinese and English translations`)
  }
  for (const key of ['connectDetailTitle', 'connectDetailFull', 'connectDetailCompact', 'connectDetailQuiet', 'connectStreamPreview', 'connectStreamPreviewInterval', 'connectCardModeTitle', 'connectCardModeLegacy', 'connectCardModeRich', 'connectProgressStyleTitle', 'connectProgressStyleLegacy', 'connectProgressStyleCompact', 'connectProgressStyleCard', 'connectQuietHint']) {
    assert.equal((client.match(new RegExp(key + ':', 'g')) ?? []).length, 2, `${key} has Chinese and English translations`)
  }
  assert.match(client, /select:focus-visible/)
  assert.match(client, /select:disabled/)
  assert.match(client, /disabled: !connectForm\.showStreamPreview/)
  // ADR 0041: the settings form falls back to the Card 2.0 rich card and the
  // structured progress card, matching CONNECT_DISPLAY_DEFAULTS.
  assert.match(client, /cardMode: "rich", progressStyle: "card"/)
  assert.match(client, /cardMode: value\.cardMode \?\? "rich", progressStyle: value\.progressStyle \?\? "card"/)
  assert.match(client, /\[1500, 3000, 5000\]/)
  assert.match(client, /connectRevision\.current/)
  assert.match(client, /setConnectForm\(\{[\s\S]*appSecret: ""/)
  // A successful check with no newer kernel must still answer the user.
  assert.match(client, /kernelUpToDate/)
  assert.match(client, /kernelRolledBack/)
  assert.match(client, /kernelCheckFailed/)
  // Multi-version dashboard: exact official installs, isolated environments,
  // concurrent start/stop, and runtime-only uninstall.
  assert.match(client, /getRuntimeState/)
  assert.match(client, /installRuntime/)
  assert.match(client, /createRuntimeEnvironment/)
  assert.match(client, /startRuntimeEnvironment/)
  assert.match(client, /uninstallRuntime/)
  assert.match(client, /runtimeMissing/)
  assert.match(client, /runtimeCatalog/)
  assert.match(client, /openEditionSource/)
  assert.match(client, /dshDesktop/)

  // Host half: opt-in screen capture model tool (decision 0027, route C).
  const host = await readFile(join(pluginRoot, 'lib/index.js'), 'utf8')
  assert.match(host, /DSH_DESKTOP_SCREEN_CAPTURE/)
  assert.match(host, /screen_capture/)
  assert.match(host, /saveImage/)
  assert.match(host, /inputModalities/)
  assert.doesNotMatch(host, /vision route|visionRoute/)
  assert.match(client, /settings\.section/)
  assert.doesNotMatch(client, /settings\.general\.item/)
  assert.match(client, /reportSessionStatus/)
  assert.match(client, /data-dsh-controls-trigger/)
  assert.match(client, /entryPosition/)
  assert.match(client, /addEventListener\("pointermove"/)
  assert.match(client, /getLanState/)
  assert.match(client, /stopLanPairing/)
  assert.match(client, /lanStart/)
  assert.match(client, /lanStop/)
  // The overlay panel mirrors the native surfaces' state-aware pairing entry.
  assert.match(client, /showLanPairing/)
  assert.match(client, /lanShowQr/)
  assert.match(client, /safeModeBanner/)
  assert.match(client, /enterSafeMode/)
  assert.match(client, /exitSafeMode/)
  // Restart joined the extension surfaces (decision 0028).
  assert.match(client, /restartHarness/)
  assert.match(client, /data-dsh-safe-mode-banner/)
  assert.match(client, /listLanInterfaces/)
  assert.match(client, /data-dsh-lan-nic/)
  assert.match(client, /getRecoverySuspects/)
  assert.match(client, /safeModeSuspect/)
  assert.match(client, /data-dsh-safe-mode-suspect/)
  assert.match(client, /quarantineBanner/)
  assert.match(client, /data-dsh-quarantine-update/)
  assert.match(client, /updatePlugin/)
  assert.match(client, /listPresets/)
  assert.match(client, /exportPreset/)
  assert.match(client, /importPreset/)
  assert.match(client, /presetsTitle/)
  // P1 first-success path stays lightweight, dismissible, and explicitly
  // keeps the community market outside the critical path.
  assert.match(client, /data-dsh-first-success-guide/)
  assert.match(client, /firstRunGuideDismissed/)
  assert.match(client, /firstTaskCompleted/)
  assert.match(client, /guideRuntime/)
  assert.match(client, /guideWorkspace/)
  assert.match(client, /guideModel/)
  assert.match(client, /guideTask/)
  assert.match(client, /guideMarketOptional/)
  assert.match(client, /typeof item\.blank === "boolean"/)
  assert.match(client, /typeof session\?\.cwd === "string"/)
  assert.doesNotMatch(client, /updateDesktopPreferences\(\{ firstTaskCompleted:/)
  // Health checks are user-triggered and network checks require an explicit
  // checkbox; the copy states the local, sanitized, no-auto-repair contract.
  assert.match(client, /runHealthCheck/)
  assert.match(client, /includeNetwork: healthNetwork/)
  assert.match(client, /data-dsh-health-network/)
  assert.match(client, /data-dsh-health-result/)
  assert.match(client, /data-dsh-health-repair/)
  assert.match(client, /result\.repairUrl/)
  assert.match(client, /healthRepairGet/)
  assert.match(client, /nothing is uploaded or repaired automatically/)

  const preload = await readFile(resolve('src/preload/index.ts'), 'utf8')
  const main = await readFile(resolve('src/main/index.ts'), 'utf8')
  assert.match(preload, /desktop:health-check/)
  assert.match(preload, /desktop:runtime:state/)
  assert.match(preload, /desktop:runtime:create/)
  assert.match(preload, /desktop:runtime:uninstall/)
  assert.match(preload, /desktop:edition:open-source/)
  assert.match(main, /runDesktopHealthCheck/)
  assert.match(main, /builtinEditionCatalog/)
  assert.match(main, /conversationSucceeded/)
  assert.match(main, /firstRunGuideDismissed/)
  assert.doesNotMatch(main, /typeof candidate\.firstTaskCompleted/)
})

test('desktop controls mount returns undefined until all package files exist', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-'))
  const harness = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-harness-'))
  try {
    assert.equal(prepareDesktopControlsMount(home, harness), undefined)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(harness, { recursive: true, force: true })
  }
})

test('desktop controls mount links the complete package into the profile lookup path', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-'))
  const harness = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-harness-'))
  const packageDir = join(harness, 'node_modules', 'dsh-desktop-controls')
  try {
    await mkdir(join(packageDir, 'lib'), { recursive: true })
    await writeFile(join(packageDir, 'cordis.patch.yml'), '- insert: []\n')
    await writeFile(join(packageDir, 'lib', 'index.js'), 'export function apply() {}\n')
    await writeFile(join(packageDir, 'lib', 'client.js'), '/* client */\n')
    const patch = prepareDesktopControlsMount(home, harness)
    assert.equal(patch, desktopControlsPatchPath(harness))
    // Both anchors are linked: the profile-dir anchor serves the 0.1.6-alpha.2+
    // resolution generation, the profiles-level anchor serves older kernels.
    assert.equal(await lstat(join(home, 'profiles', 'web', 'node_modules', 'dsh-desktop-controls')).then(stat => stat.isSymbolicLink()), true)
    assert.equal(await lstat(join(home, 'profiles', 'node_modules', 'dsh-desktop-controls')).then(stat => stat.isSymbolicLink()), true)
    assert.equal(await readFile(join(home, 'profiles', 'web', 'node_modules', 'dsh-desktop-controls', 'lib', 'client.js'), 'utf8'), '/* client */\n')
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(harness, { recursive: true, force: true })
  }
})

test('desktop controls expose the agent deletion interception preference', async () => {
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  const main = await readFile(resolve('src/main/index.ts'), 'utf8')
  assert.match(client, /deletionInterception/)
  assert.match(client, /agentDeletionInterception/)
  assert.match(main, /candidate\.agentDeletionInterception/)
})

test('Feishu management entry and health text share the settings design system', async () => {
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  const css = client.match(/const css = `([\s\S]*?)`;/)?.[1]
  assert.ok(css)
  assert.match(css, /\[data-dsh-connect-manager\] \{[^}]*border-radius: 999px;/)
  assert.match(css, /\[data-dsh-connect-manager\]\[data-primary\] \{[^}]*background: var\(--dsh-controls-accent\);/)
  assert.match(css, /\[data-dsh-connect-manager\] \{[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/)
  assert.match(css, /\[data-dsh-connect-health\],[^}]*display: block;/)
})

test('Feishu quick control separates application, process and channel state without connecting', async () => {
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  const copyStart = client.indexOf('const COPY = {')
  const copyEnd = client.indexOf('\n    };', copyStart)
  assert.ok(copyStart >= 0 && copyEnd > copyStart)
  const COPY = runInNewContext(`(${client.slice(copyStart + 'const COPY = '.length, copyEnd + 6)})`, {}) as { zh: Record<string, string>; en: Record<string, string> }
  const fnStart = client.indexOf('function connectFeishuQuickView(')
  const fnEnd = client.indexOf('\n    }\n', fnStart)
  assert.ok(fnStart >= 0 && fnEnd > fnStart)
  type QuickView = {
    application: string; applicationName: string | null; processState: string; processLabel: string
    channelState: string; channelLabel: string; dshState: string; dshLabel: string
    configured: boolean; canStart: boolean; canStop: boolean; canRestart: boolean; hint: string
  }
  const connectFeishuQuickView = runInNewContext(`${client.slice(fnStart, fnEnd + 6)}\nconnectFeishuQuickView`, {}) as
    (connect: unknown, safeMode: boolean, copy: Record<string, string>) => QuickView

  const empty = connectFeishuQuickView(null, false, COPY.zh)
  assert.equal(empty.application, COPY.zh.feishuNoApplication)
  assert.equal(empty.processState, 'disabled')
  assert.equal(empty.channelState, 'unknown')
  assert.equal(empty.canStart, false)
  assert.equal(empty.canStop, false)
  assert.equal(empty.canRestart, false)
  assert.equal(empty.hint, COPY.zh.feishuConfigureHint)

  const saved = { enabled: true, secretConfigured: true, phase: 'stopped', applicationName: 'Robot A', appId: 'cli_a', health: { channel: 'offline', dsh: 'unknown' } }
  const stopped = connectFeishuQuickView(saved, false, COPY.zh)
  assert.equal(stopped.application, 'Robot A')
  assert.equal(stopped.processLabel, COPY.zh.connectStopped)
  assert.equal(stopped.channelLabel, COPY.zh.connectOffline)
  assert.equal(stopped.canStart, true)
  assert.equal(stopped.canStop, false)
  assert.equal(stopped.canRestart, true)
  assert.equal(stopped.hint, COPY.zh.feishuStoppedHint)

  const ready = connectFeishuQuickView({ ...saved, phase: 'ready', health: { channel: 'online', dsh: 'available' } }, false, COPY.zh)
  assert.equal(ready.processLabel, COPY.zh.connectServiceReady)
  assert.equal(ready.channelLabel, COPY.zh.connectOnline)
  assert.equal(ready.dshLabel, COPY.zh.connectModelAvailable)
  assert.equal(ready.canStart, false)
  assert.equal(ready.canStop, true)
  assert.equal(ready.hint, COPY.zh.feishuReadyHint)

  // An explicit close persists disabled intent, but the saved Secret still
  // allows a manual start; only "reconnect" is intent-bound.
  const closed = connectFeishuQuickView({ ...saved, enabled: false, phase: 'disabled' }, false, COPY.zh)
  assert.equal(closed.canStart, true)
  assert.equal(closed.canRestart, false)
  assert.equal(closed.hint, COPY.zh.feishuDisabledHint)

  const crashed = connectFeishuQuickView({ ...saved, phase: 'crashed', lastError: 'cc-connect could not start' }, false, COPY.zh)
  assert.equal(crashed.canStart, true)
  assert.equal(crashed.canRestart, true)
  assert.equal(crashed.hint, COPY.zh.feishuCrashHint)

  // The supervisor briefly re-enters 'starting' while retrying after a crash;
  // keep the failure hint and the explicit stop action visible.
  const retrying = connectFeishuQuickView({ ...saved, phase: 'starting', lastError: 'cc-connect exited' }, false, COPY.en)
  assert.equal(retrying.hint, COPY.en.feishuCrashHint)
  assert.equal(retrying.canStop, true)
  assert.equal(retrying.canStart, false)

  const legacy = connectFeishuQuickView({ ...saved, needsSecretReentry: true, secretConfigured: false }, false, COPY.zh)
  assert.equal(legacy.configured, false)
  assert.equal(legacy.canStart, false)
  assert.equal(legacy.canRestart, false)
  assert.equal(legacy.hint, COPY.zh.feishuSecretReentryHint)

  const safe = connectFeishuQuickView({ ...saved, phase: 'ready', health: { channel: 'online' } }, true, COPY.en)
  assert.equal(safe.hint, COPY.en.feishuSafeModeHint)
  assert.equal(safe.canStart, false)
  assert.equal(safe.canRestart, false)
  // A live process can still be stopped explicitly while Safe Mode is on.
  assert.equal(safe.canStop, true)

  assert.equal(connectFeishuQuickView({ ...saved, applicationName: null }, false, COPY.en).application, 'cli_a')
  assert.equal(connectFeishuQuickView({ ...saved, applicationName: null, appId: '' }, false, COPY.en).application, COPY.en.feishuNoApplication)
  assert.doesNotMatch(JSON.stringify(connectFeishuQuickView({ ...saved, appSecret: 'fake-secret-value' }, false, COPY.zh)), /fake-secret-value/)
})

test('trash section uses the settings design system with guarded destructive actions', async () => {
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  const main = await readFile(resolve('src/main/index.ts'), 'utf8')
  // Same group card as every other settings section, not a bare-HTML island.
  assert.match(client, /"data-dsh-desktop-settings-group": true, "data-dsh-trash-section": true/)
  assert.match(client, /data-dsh-desktop-setting-row": true, "data-dsh-trash-row": true/)
  // Real tab semantics and the kind badges / retention countdown.
  assert.match(client, /role: "tablist"/)
  assert.match(client, /data-dsh-trash-badge/)
  assert.match(client, /天后自动清除/)
  assert.match(client, /auto-clears in \$\{n\}d/)
  // Purge is a two-step inline confirm; "clear expired" too.
  assert.match(client, /purgeConfirm/)
  assert.match(client, /confirmExpired/)
  // The sessions tab states its model (delete-to-trash is recoverable) and
  // groups archived vs live sessions instead of one flat list.
  assert.match(client, /sessionsNote/)
  assert.match(client, /archivedGroup/)
  assert.match(client, /sessionDelete/)
  // The kernel producer: restoring the bundled kernel retires the overlay
  // into the trash instead of leaking the version directory on disk.
  assert.match(main, /retireKernelOverlay\(kernelDir\(\), previous, moveToTrash/)
})

test('desktop tools dismiss on outside pointerdown and surface failed actions (#123/#125)', async () => {
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  // Outside click closes the floating panel but never the trigger or the
  // panel itself; the listener is capture-phase so inner clicks still run.
  assert.match(client, /document\.addEventListener\("pointerdown", onPointerDown, true\)/)
  assert.match(client, /floatingRef\.current\?\.contains\(target\) === true/)
  assert.match(client, /triggerRef\.current\?\.contains\(target\) === true/)
  // Every failed/rejected extension action lands in one visible status line.
  assert.match(client, /"data-dsh-controls-error": true, role: "alert"/)
  assert.match(client, /catch \{\s*setActionError\(/)
  assert.match(client, /actionBridgeUnavailable/)
  assert.match(client, /\$\{copy\.actionFailed\}\$\{copy\.actionFailedSeparator\}/)
  // The workspace picker result is discriminated instead of a nullable path.
  assert.match(client, /picked\?\.canceled === true/)
  assert.match(client, /"data-dsh-connect-workspace-error": true, role: "alert"/)
  assert.match(client, /"aria-invalid": connectMessage === copy\.connectInvalidWorkspace/)
})

test('plugin-declared companion windows are listed and toggled from the panel (ADR 0043)', async () => {
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  const companion = await readFile(resolve('src/main/companion.ts'), 'utf8')
  const preload = await readFile(resolve('src/preload/index.ts'), 'utf8')
  const policy = await readFile(resolve('src/main/companion-policy.ts'), 'utf8')
  // Panel group only renders when a plugin declared one; it never connects.
  assert.match(client, /"data-dsh-controls-group": "companions"/)
  assert.match(client, /listCompanions/)
  assert.match(client, /toggleCompanion/)
  assert.match(client, /companionHint/)
  // The bridge is narrow: list + toggle, no DOM or approval channel.
  assert.match(preload, /listCompanions: \(\): Promise<CompanionDescriptor\[\]> => ipcRenderer\.invoke\('companion:list'\)/)
  assert.match(preload, /toggleCompanion: \(id: string\): Promise<boolean> => ipcRenderer\.invoke\('companion:toggle', id\)/)
  assert.match(companion, /ipcMain\.handle\('companion:list'/)
  assert.match(companion, /ipcMain\.handle\('companion:toggle'/)
  assert.doesNotMatch(companion, /executeJavaScript/)
  // Same-origin path + probe + sandbox are part of the contract.
  assert.match(policy, /isCompanionRoute/)
  assert.match(policy, /text\\\/html/)
  assert.match(companion, /sandbox: true/)
  assert.match(companion, /will-navigate/)
  assert.match(companion, /AbortSignal\.timeout/)
})
