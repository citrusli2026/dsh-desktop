window.__ModuleLoader__.load({
  id: "dsh-desktop-controls",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");
    let react = require("react");

    const css = `
      [data-dsh-desktop-controls] {
        --dsh-controls-accent: #4d6bfe;
        --dsh-controls-panel: var(--dsw-alias-bg-layer-2, #ffffff);
        --dsh-controls-text: var(--dsw-alias-label-primary, #1f232b);
        --dsh-controls-muted: var(--dsw-alias-label-secondary, #6d7380);
        --dsh-controls-border: var(--dsw-alias-border-l2, rgba(31, 35, 43, .12));
        color: var(--dsh-controls-text);
        font-family: inherit;
        pointer-events: none;
        position: fixed;
        /* Below the window title strip plus the seeded sidebar plugins' own
           floating cluster (Windows pans it down by --dsh-title-bar-strip);
           the default must not land in that band or the entry is unreachable
           until dragged. Users move it freely afterwards. */
        top: 88px;
        right: 16px;
        z-index: 1200;
      }
      [data-dsh-desktop-controls] button,
      [data-dsh-desktop-settings] button,
      [data-dsh-desktop-settings] input { font: inherit; }
      [data-dsh-desktop-controls] [data-dsh-controls-trigger] {
        align-items: center;
        background: color-mix(in srgb, var(--dsh-controls-panel) 92%, transparent);
        border: 1px solid var(--dsh-controls-border);
        border-radius: 999px;
        box-shadow: 0 4px 18px rgba(31, 35, 43, .12);
        color: var(--dsh-controls-text);
        cursor: grab;
        display: inline-flex;
        gap: 7px;
        min-height: 34px;
        padding: 0 11px 0 8px;
        pointer-events: auto;
        touch-action: none;
        transition: border-color .16s ease, box-shadow .16s ease;
        user-select: none;
        white-space: nowrap;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-trigger]:hover {
        border-color: color-mix(in srgb, var(--dsh-controls-accent) 48%, var(--dsh-controls-border));
        box-shadow: 0 6px 22px rgba(31, 35, 43, .16);
      }
      [data-dsh-desktop-controls] [data-dsh-controls-trigger][data-dsh-controls-dragging] { cursor: grabbing; }
      [data-dsh-desktop-controls] [data-dsh-controls-trigger]:focus-visible,
      [data-dsh-desktop-controls] [data-dsh-controls-action]:focus-visible,
      [data-dsh-desktop-settings] button:focus-visible,
      [data-dsh-desktop-settings] input:focus-visible {
        outline: 2px solid var(--dsh-controls-accent);
        outline-offset: 2px;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-mark] {
        align-items: center;
        background: var(--dsh-controls-accent);
        border-radius: 999px;
        color: #fff;
        display: inline-flex;
        font-size: 13px;
        font-weight: 700;
        height: 22px;
        justify-content: center;
        width: 22px;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-label] {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: .01em;
        line-height: 1;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-panel] {
        background: var(--dsh-controls-panel);
        border: 1px solid var(--dsh-controls-border);
        border-radius: 16px;
        box-shadow: 0 14px 36px rgba(31, 35, 43, .18);
        margin-top: 8px;
        padding: 14px;
        pointer-events: auto;
        width: min(286px, calc(100vw - 32px));
      }
      [data-dsh-desktop-controls] [data-dsh-controls-heading] {
        font-size: 14px;
        font-weight: 700;
        margin: 0;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-copy],
      [data-dsh-desktop-settings] [data-dsh-desktop-settings-copy] {
        color: var(--dsh-controls-muted);
        font-size: 12px;
        line-height: 1.5;
        margin: 4px 0 12px;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-actions] { display: grid; gap: 4px; }
      [data-dsh-desktop-controls] [data-dsh-controls-action] {
        align-items: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 10px;
        color: var(--dsh-controls-text);
        cursor: pointer;
        display: flex;
        font-size: 13px;
        line-height: 1;
        min-height: 34px;
        overflow: hidden;
        padding: 0 10px;
        text-align: left;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-action]:hover {
        background: color-mix(in srgb, var(--dsh-controls-accent) 9%, transparent);
        border-color: color-mix(in srgb, var(--dsh-controls-accent) 18%, transparent);
      }
      [data-dsh-desktop-controls] [data-dsh-controls-action][disabled] { cursor: wait; opacity: .6; }
      [data-dsh-desktop-controls] [data-dsh-controls-separator] {
        background: var(--dsh-controls-border);
        border: 0;
        height: 1px;
        margin: 6px 0;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-hint] {
        border-top: 1px solid var(--dsh-controls-border);
        color: var(--dsh-controls-muted);
        font-size: 11px;
        line-height: 1.5;
        margin-top: 10px;
        padding-top: 10px;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-shortcut] {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
      }
      /* 设置页「扩展设置」分区：与 Harness 设置页同款排版（标题→说明→条目行）。 */
      [data-dsh-desktop-settings-section] {
        color: var(--dsw-alias-label-primary, #1f232b);
        font-size: 13px;
        line-height: 1.6;
      }
      [data-dsh-desktop-settings] { padding: 0; }
      [data-dsh-desktop-settings] [data-dsh-desktop-settings-heading] {
        font-size: 16px;
        font-weight: 650;
        line-height: 1.4;
        margin: 0 0 6px;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-settings-copy] { margin: 0 0 14px; }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-row] {
        align-items: center;
        border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(31, 35, 43, .12));
        display: flex;
        gap: 12px;
        justify-content: space-between;
        min-height: 44px;
        padding: 8px 0;
        margin: 0;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-row]:last-child { border-bottom: 0; }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-label] {
        color: var(--dsw-alias-label-primary, #1f232b);
        display: block;
        font-size: 13.5px;
        line-height: 1.4;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-detail] {
        color: var(--dsw-alias-label-secondary, #6d7380);
        display: block;
        font-size: 12px;
        line-height: 1.5;
        margin-top: 2px;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-shortcut] {
        background: var(--dsw-alias-fill-l2, rgba(31, 35, 43, .08));
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        padding: 3px 6px;
        white-space: nowrap;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-record],
      [data-dsh-desktop-settings] [data-dsh-desktop-lan-target] {
        background: transparent;
        border: 1px solid var(--dsw-alias-border-l2, rgba(31, 35, 43, .12));
        border-radius: 8px;
        color: var(--dsw-alias-label-primary, #1f232b);
        cursor: pointer;
        font-size: 12.5px;
        padding: 6px 11px;
        white-space: nowrap;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-record]:hover,
      [data-dsh-desktop-settings] [data-dsh-desktop-lan-target]:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(31, 35, 43, .06)); }
      [data-dsh-desktop-settings] [data-dsh-desktop-record][disabled],
      [data-dsh-desktop-settings] [data-dsh-desktop-lan-target][disabled] { cursor: wait; opacity: .65; }
      [data-dsh-desktop-settings] [data-dsh-desktop-lan-actions] {
        align-items: center;
        display: inline-flex;
        gap: 8px;
        flex-shrink: 0;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-checkbox] { height: 16px; width: 16px; }
      [data-dsh-desktop-settings] [data-dsh-desktop-status] {
        color: var(--dsw-alias-state-error-primary, #c33);
        font-size: 12px;
        line-height: 1.4;
        margin: 10px 0 0;
      }
      /* 安全模式常驻横幅：位于视口底部，第三方插件隔离期间提醒。 */
      [data-dsh-safe-mode-banner] {
        align-items: center;
        background: var(--dsh-controls-accent, #4d6bfe);
        border-radius: 999px;
        bottom: 14px;
        box-shadow: 0 6px 22px rgba(31, 35, 43, .22);
        color: #fff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 600;
        gap: 12px;
        left: 50%;
        padding: 7px 8px 7px 14px;
        pointer-events: auto;
        position: fixed;
        transform: translateX(-50%);
        white-space: nowrap;
        z-index: 1300;
      }
      [data-dsh-safe-mode-banner] button {
        background: rgba(255, 255, 255, .16);
        border: 1px solid rgba(255, 255, 255, .35);
        border-radius: 999px;
        color: #fff;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 10px;
      }
      [data-dsh-safe-mode-banner] button:hover { background: rgba(255, 255, 255, .26); }
      [data-dsh-safe-mode-banner] button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      @media (max-width: 680px) {
        [data-dsh-desktop-controls] { top: 12px; right: 12px; }
        [data-dsh-desktop-controls] [data-dsh-controls-label] { display: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-dsh-desktop-controls] [data-dsh-controls-trigger] { transition: none; }
      }
    `;
    if (typeof document !== "undefined" && document.querySelector("style[data-dsh-desktop-controls-css]") === null) {
      const style = document.createElement("style");
      style.dataset.dshDesktopControlsCss = "";
      style.textContent = css;
      document.head.append(style);
    }

    const COPY = {
      zh: {
        trigger: "扩展入口", title: "扩展入口",
        about: "关于",
        restartHarness: "重启 Harness",
        unavailable: "请右键窗口或点击系统托盘图标使用扩展入口。",
        settingsTitle: "扩展设置", settingsCopy: "连接移动设备、快捷键、开机启动和通知只保存在本机；扩展功能也可从系统托盘或右键窗口进入。",
        lanSettings: "连接移动设备", lanSettingsDetail: "手机与电脑连接同一局域网，扫码即可进入 Harness Web 界面。",
        lanStart: "开始配对", lanShowQr: "显示二维码", lanStop: "停止共享",
        shortcut: "唤起快捷键", record: "重新设置", recording: "请按下快捷键…",
        shortcutHelp: "至少包含一个修饰键，例如 Ctrl + Alt + K。",
        launchAtLogin: "开机启动",
        launchHidden: "启动后隐藏到托盘",
        notifications: "桌面通知",
        screenCapture: "屏幕捕获", screenCaptureDetail: "开启后 Agent 可截屏并作为会话附件（需要视觉模型）；切换后自动重启内核。",
        screenCapturePermission: "尚未授权屏幕录制：请在 系统设置 → 隐私与安全性 → 屏幕录制 中允许 dsh-desktop，然后重试。",
        safeMode: "安全模式", safeModeDetail: "隔离第三方插件，仅运行官方与内置扩展。",
        safeModeStart: "以安全模式启动", safeModeExit: "退出安全模式",
        market: "插件市场", marketDetail: "在 Harness 设置里浏览并一键安装社区插件与主题。",
        marketInstall: "安装插件市场", marketInstalledHint: "已安装 · 打开 设置 → 插件市场", marketFailed: "安装未完成，请检查网络后重试。",
        balance: "余额", recharge: "充值",
        kernel: "内核版本", kernelBundled: "内置", kernelOverlay: "已切换",
        kernelCheck: "检查新版", kernelInstall: "安装最新", kernelRestore: "恢复内置",
        kernelUpToDate: "已是最新版本。",
        kernelInstalling: "正在安装并切换，可能需要几分钟…", kernelFailed: "操作未完成，请重试。",
        safeModeBanner: "安全模式：第三方插件已隔离",
        safeModeSuspect: "疑似插件：{id}（{name}），可在官方「设置 → 插件」中卸载。",
        presetsTitle: "Agent 预设", presetsDetail: "导出或导入 .dshpreset 便携预设包，备份或分享 Agent 预设。",
        presetsExport: "导出预设", presetsImport: "导入预设",
        presetExported: "已导出 {name}。", presetImported: "已导入 {name}。",
        presetSkipped: "已跳过 {name}。", presetInvalid: "文件无效或操作失败。",
        presetEmpty: "没有可导出的用户预设。",
        unsupported: "当前平台不支持此项。", saved: "已保存",
        invalid: "快捷键格式不正确。", conflict: "快捷键已被其它应用占用，请换一个。",
      },
      en: {
        trigger: "Extensions", title: "Extensions",
        about: "About",
        restartHarness: "Restart Harness",
        unavailable: "Right-click the window or use the system tray for extensions.",
        settingsTitle: "Extensions", settingsCopy: "Mobile pairing, shortcuts, startup, and notifications stay on this device; extensions are also reachable from the tray or a right-click.",
        lanSettings: "Connect a mobile device", lanSettingsDetail: "Same LAN as the computer; scan the QR code to enter the Harness Web UI.",
        lanStart: "Start pairing", lanShowQr: "Show QR code", lanStop: "Stop sharing",
        shortcut: "Summon shortcut", record: "Change shortcut", recording: "Press a shortcut…",
        shortcutHelp: "Include at least one modifier, such as Ctrl + Alt + K.",
        launchAtLogin: "Launch at login",
        launchHidden: "Start hidden in the tray",
        notifications: "Desktop notifications",
        screenCapture: "Screen capture", screenCaptureDetail: "Lets the agent capture the screen as conversation attachments (vision model required); the kernel restarts on toggle.",
        screenCapturePermission: "Screen recording is not authorized; allow dsh-desktop in System Settings → Privacy → Screen Recording, then retry.",
        safeMode: "Safe Mode", safeModeDetail: "Quarantine third-party plugins; official and built-in extensions only.",
        safeModeStart: "Start in Safe Mode", safeModeExit: "Exit Safe Mode",
        market: "Plugin market", marketDetail: "Browse and one-click-install community plugins and themes from Harness settings.",
        marketInstall: "Install the market", marketInstalledHint: "Installed · open Settings → Plugin Market", marketFailed: "Install did not finish; check your network and retry.",
        balance: "Balance", recharge: "Recharge",
        kernel: "Kernel version", kernelBundled: "bundled", kernelOverlay: "switched",
        kernelCheck: "Check for newer", kernelInstall: "Install latest", kernelRestore: "Restore bundled",
        kernelUpToDate: "You're on the latest version.",
        kernelInstalling: "Installing and switching — this can take a few minutes…", kernelFailed: "The operation did not finish; please retry.",
        safeModeBanner: "Safe Mode: third-party plugins are quarantined",
        safeModeSuspect: "Suspected plugin: {id} ({name}). Uninstall it from Settings → Plugins.",
        presetsTitle: "Agent presets", presetsDetail: "Export or import .dshpreset portable packages to back up or share agent presets.",
        presetsExport: "Export preset", presetsImport: "Import preset",
        presetExported: "Exported {name}.", presetImported: "Imported {name}.",
        presetSkipped: "Skipped {name}.", presetInvalid: "The file is invalid or the operation failed.",
        presetEmpty: "There is no user preset to export.",
        unsupported: "This option is not available on the current platform.", saved: "Saved",
        invalid: "That shortcut format is not supported.", conflict: "That shortcut is already in use. Choose another one.",
      },
    };

    function useChinese() {
      const [value, setValue] = react.useState(() => document.documentElement.lang.toLowerCase().startsWith("zh"));
      react.useEffect(() => {
        const html = document.documentElement;
        const observer = new MutationObserver(() => setValue(html.lang.toLowerCase().startsWith("zh")));
        observer.observe(html, { attributes: true, attributeFilter: ["lang"] });
        return () => observer.disconnect();
      }, []);
      return value;
    }

    function publicStatusOf(state) {
      if (state === undefined) return undefined;
      const byId = state.byId ?? {};
      const jobsBySession = state.jobsBySession ?? {};
      const ids = new Set([...Object.keys(byId), ...Object.keys(jobsBySession)]);
      const sessions = [...ids].map((id) => {
        const item = byId[id] ?? {};
        const jobs = Array.isArray(jobsBySession[id]) ? jobsBySession[id].map((job) => ({
          id: String(job.id ?? ""), label: String(job.label ?? job.kind ?? job.id ?? "background task"),
          status: job.status, ...(typeof job.detail === "string" ? { detail: job.detail } : {}),
        })).filter((job) => job.id !== "") : [];
        return {
          id, title: String(item.displayTitle ?? item.title ?? id), running: item.running === true,
          ...(typeof item.pendingInteraction === "string" ? { pendingInteraction: item.pendingInteraction } : {}), jobs,
        };
      });
      return { sessions };
    }

    function keyFromEvent(event) {
      const modifiers = [];
      if (event.metaKey || event.ctrlKey) modifiers.push("CommandOrControl");
      if (event.altKey) modifiers.push("Alt");
      if (event.shiftKey) modifiers.push("Shift");
      const keys = {
        " ": "Space", Escape: "Escape", Esc: "Escape", Enter: "Enter", Tab: "Tab",
        Backspace: "Backspace", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End",
        PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up", ArrowDown: "Down",
        ArrowLeft: "Left", ArrowRight: "Right",
      };
      let key = keys[event.key] ?? event.key;
      if (/^[a-z]$/.test(key)) key = key.toUpperCase();
      if (!/^[A-Z0-9]$/.test(key) && !/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) && ![
        "Space", "Escape", "Enter", "Tab", "Backspace", "Delete", "Insert", "Home", "End",
        "PageUp", "PageDown", "Up", "Down", "Left", "Right",
      ].includes(key)) return undefined;
      if (modifiers.length === 0 || ["Meta", "Control", "Alt", "Shift"].includes(event.key)) return undefined;
      return [...modifiers, key].join("+");
    }

    const POSITION_KEY = "dsh-desktop-controls.entryPosition";

    function loadEntryPosition() {
      try {
        const raw = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null");
        if (typeof raw?.left === "number" && typeof raw?.top === "number") return raw;
      } catch {}
      return null;
    }

    function saveEntryPosition(position) {
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch {}
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    /* 扩展设置分区：单独入口，排版与 Harness 设置页一致。 */
    function DesktopSettingsSection() {
      const zh = useChinese();
      const copy = zh ? COPY.zh : COPY.en;
      const bridge = typeof window !== "undefined" ? window.dshDesktop : undefined;
      return react_jsx_runtime.jsxs("div", {
        "data-dsh-desktop-settings-section": true,
        children: [
          react_jsx_runtime.jsx(DesktopSettings, { copy: copy, bridge: bridge }),
        ],
      });
    }

    function DesktopSettings({ copy, bridge }) {
      const [preferences, setPreferences] = react.useState(null);
      const [recording, setRecording] = react.useState(false);
      const [message, setMessage] = react.useState("");

      react.useEffect(() => {
        if (typeof bridge?.getDesktopPreferences !== "function") return;
        void bridge.getDesktopPreferences().then((value) => setPreferences(value));
      }, [bridge]);

      const update = async (patch) => {
        if (typeof bridge?.updateDesktopPreferences !== "function") return;
        const result = await bridge.updateDesktopPreferences(patch);
        if (result === null) return;
        if (result.ok) {
          setPreferences(result.preferences);
          setMessage(copy.saved);
        } else {
          setMessage(result.reason === "conflict" ? copy.conflict
            : result.reason === "invalid" ? copy.invalid
            : result.reason === "screen-permission" ? copy.screenCapturePermission
            : copy.unsupported);
        }
      };

      const [lanState, setLanState] = react.useState(null);
      const [lanBusy, setLanBusy] = react.useState(false);
      const [safeBusy, setSafeBusy] = react.useState(false);
      const [marketInstalled, setMarketInstalled] = react.useState(null);
      const [marketBusy, setMarketBusy] = react.useState(false);

      react.useEffect(() => {
        if (typeof bridge?.getBundledPlugins !== "function") return;
        void bridge.getBundledPlugins().then((value) => {
          if (value !== null) setMarketInstalled(value.dshMarketInstalled === true);
        });
      }, [bridge]);

      const marketAction = async () => {
        if (typeof bridge?.desktopAction !== "function") return;
        setMarketBusy(true);
        try {
          const ok = await bridge.desktopAction("installDshMarket");
          if (ok === true) setMarketInstalled(true);
          setMessage(ok === true ? copy.marketInstalledHint : copy.marketFailed);
        } finally {
          setMarketBusy(false);
        }
      };

      const [balanceText, setBalanceText] = react.useState(null);
      const [kernel, setKernel] = react.useState(null);
      const [kernelBusy, setKernelBusy] = react.useState("");

      react.useEffect(() => {
        if (typeof bridge?.getBalance === "function") void bridge.getBalance().then((value) => { if (value !== null) setBalanceText(value.balance); });
        if (typeof bridge?.getKernelState !== "function") return;
        void bridge.getKernelState().then((value) => { if (value !== null) setKernel(value); });
      }, [bridge]);

      const kernelRefresh = () => {
        if (typeof bridge?.getKernelState !== "function") return Promise.resolve(null);
        return bridge.getKernelState().then((value) => { if (value !== null) setKernel(value); return value; });
      };

      const kernelAction = async (kind) => {
        if (typeof bridge?.desktopAction !== "function") return;
        setKernelBusy(kind);
        try {
          if (kind === "check") {
            const ok = await bridge.desktopAction("kernelCheckUpdates") === true;
            const state = await kernelRefresh();
            // A successful check must always say something: the registry
            // matching the running kernel is a result, not a silence.
            if (!ok || state?.latestVersion === undefined) setMessage(copy.kernelFailed);
            else if (state.latestVersion === (state.overlayVersion ?? state.bundledVersion)) setMessage(copy.kernelUpToDate);
          } else if (kind === "install") {
            setMessage(copy.kernelInstalling);
            if (await bridge.desktopAction("kernelInstall") !== true) setMessage(copy.kernelFailed);
            kernelRefresh();
          } else if (kind === "restore") {
            if (await bridge.desktopAction("kernelRestore") !== true) setMessage(copy.kernelFailed);
            kernelRefresh();
          }
        } finally {
          setKernelBusy("");
        }
      };

      const refreshLanState = async () => {
        if (typeof bridge?.getLanState !== "function") return;
        const value = await bridge.getLanState();
        if (value !== null) setLanState(value);
      };

      react.useEffect(() => {
        void refreshLanState();
      }, [bridge]);

      const lanAction = async (action) => {
        if (typeof bridge?.desktopAction !== "function") return;
        setLanBusy(true);
        try {
          await bridge.desktopAction(action);
        } finally {
          setLanBusy(false);
          void refreshLanState();
        }
      };

      react.useEffect(() => {
        if (!recording) return undefined;
        const onKeyDown = (event) => {
          event.preventDefault();
          if (event.key === "Escape") {
            setRecording(false);
            return;
          }
          const shortcut = keyFromEvent(event);
          if (shortcut === undefined) return;
          setRecording(false);
          void update({ shortcut });
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
      }, [recording, bridge]);

      const safeAction = async () => {
        if (typeof bridge?.desktopAction !== "function") return;
        setSafeBusy(true);
        try {
          await bridge.desktopAction(preferences?.safeMode === true ? "exitSafeMode" : "enterSafeMode");
        } finally {
          setSafeBusy(false);
        }
      };

      const [presets, setPresets] = react.useState([]);
      const [presetId, setPresetId] = react.useState("");
      const [presetBusy, setPresetBusy] = react.useState(false);

      const refreshPresets = async () => {
        if (typeof bridge?.listPresets !== "function") return;
        const list = await bridge.listPresets();
        if (list === null) return;
        setPresets(list);
        setPresetId((current) => list.some((preset) => preset.id === current) ? current : (list[0]?.id ?? ""));
      };

      react.useEffect(() => { void refreshPresets(); }, [bridge]);

      const presetAction = async (kind) => {
        if (typeof bridge?.listPresets !== "function") return;
        setPresetBusy(true);
        try {
          if (kind === "export") {
            if (presetId === "") {
              setMessage(copy.presetEmpty);
              return;
            }
            const result = await bridge.exportPreset(presetId);
            if (result?.saved === true) setMessage(copy.presetExported.replace("{name}", result.name ?? presetId));
            else if (result?.canceled !== true) setMessage(copy.presetInvalid);
          } else {
            const result = await bridge.importPreset();
            if (result === null) return;
            if (result.imported === true) setMessage(copy.presetImported.replace("{name}", result.name ?? ""));
            else if (result.skipped === true) setMessage(copy.presetSkipped.replace("{name}", result.name ?? ""));
            else if (result.invalid === true) setMessage(copy.presetInvalid);
            else if (result.canceled !== true) setMessage(copy.presetInvalid);
            void refreshPresets();
          }
        } finally {
          setPresetBusy(false);
        }
      };

      if (typeof bridge?.getDesktopPreferences !== "function" || preferences === null) return null;
      const canLaunch = preferences.launchAtLoginAvailable === true;
      return react_jsx_runtime.jsxs("div", {
        "data-dsh-desktop-settings": true,
        children: [
          react_jsx_runtime.jsx("h3", { "data-dsh-desktop-settings-heading": true, children: copy.settingsTitle }),
          react_jsx_runtime.jsx("p", { "data-dsh-desktop-settings-copy": true, children: copy.settingsCopy }),
          typeof bridge?.desktopAction === "function" ? react_jsx_runtime.jsxs("div", { "data-dsh-desktop-lan-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.lanSettings, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.lanSettingsDetail })] }),
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-lan-actions": true, children: [
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: lanBusy, onClick: () => void lanAction("startLanPairing"), children: lanState?.running === true ? copy.lanShowQr : copy.lanStart }),
              lanState?.running === true ? react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-stop": true, "data-dsh-desktop-lan-target": true, disabled: lanBusy, onClick: () => void lanAction("stopLanPairing"), children: copy.lanStop }) : null,
            ] }),
          ] }) : null,
          react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.shortcut, recording ? react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.shortcutHelp }) : null] }),
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-shortcut": true, children: recording ? copy.recording : preferences.shortcutLabel }),
            react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-record": true, disabled: recording, onClick: () => { setMessage(""); setRecording(true); }, children: recording ? "…" : copy.record }),
          ] }),
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.launchAtLogin, !canLaunch ? react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.unsupported }) : null] }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.launchAtLogin === true, disabled: !canLaunch, onChange: (event) => void update({ launchAtLogin: event.target.checked }) }),
          ] }),
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-label": true, children: copy.launchHidden }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.launchHidden === true, disabled: !canLaunch || preferences.launchAtLogin !== true, onChange: (event) => void update({ launchHidden: event.target.checked }) }),
          ] }),
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-label": true, children: copy.notifications }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.notificationsEnabled === true, disabled: preferences.notificationsAvailable !== true, onChange: (event) => void update({ notificationsEnabled: event.target.checked }) }),
          ] }),
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.screenCapture, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.screenCaptureDetail })] }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.screenCapture === true, onChange: (event) => void update({ screenCapture: event.target.checked }) }),
          ] }),
          react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.safeMode, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.safeModeDetail })] }),
            react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: safeBusy, onClick: () => void safeAction(), children: preferences?.safeMode === true ? copy.safeModeExit : copy.safeModeStart }),
          ] }),
          typeof bridge?.getBundledPlugins === "function" ? react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.market, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.marketDetail })] }),
            marketInstalled === true
              ? react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-detail": true, children: copy.marketInstalledHint })
              : react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: marketBusy, onClick: () => void marketAction(), children: marketBusy ? "…" : copy.marketInstall }),
          ] }) : null,
          balanceText !== null ? react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-label": true, children: copy.balance }),
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-lan-actions": true, children: [
              react_jsx_runtime.jsx("span", { "data-dsh-desktop-shortcut": true, children: balanceText }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, onClick: () => void bridge.desktopAction("openRecharge"), children: copy.recharge }),
            ] }),
          ] }) : null,
          kernel !== null ? react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.kernel, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: `${kernel.overlayVersion ?? kernel.bundledVersion ?? "?"}（${kernel.overlayVersion ? copy.kernelOverlay : copy.kernelBundled}）` })] }),
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-lan-actions": true, children: [
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: kernelBusy !== "", onClick: () => void kernelAction("check"), children: kernelBusy === "check" ? "…" : copy.kernelCheck }),
              kernel.latestVersion && kernel.latestVersion !== (kernel.overlayVersion ?? kernel.bundledVersion) ? react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: kernelBusy !== "", onClick: () => void kernelAction("install"), children: kernelBusy === "install" ? "…" : copy.kernelInstall }) : null,
              kernel.overlayVersion ? react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: kernelBusy !== "", onClick: () => void kernelAction("restore"), children: copy.kernelRestore }) : null,
            ] }),
          ] }) : null,
          typeof bridge?.listPresets === "function" ? react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.presetsTitle, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.presetsDetail })] }),
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-lan-actions": true, children: [
              react_jsx_runtime.jsx("select", { "data-dsh-preset-select": true, value: presetId, disabled: presetBusy || presets.length === 0, onChange: (event) => setPresetId(event.target.value), children: presets.map((preset) => react_jsx_runtime.jsx("option", { value: preset.id, children: preset.name }, preset.id)) }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: presetBusy, onClick: () => void presetAction("export"), children: copy.presetsExport }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-lan-target": true, disabled: presetBusy, onClick: () => void presetAction("import"), children: copy.presetsImport }),
            ] }),
          ] }) : null,
          message === "" ? null : react_jsx_runtime.jsx("p", { "data-dsh-desktop-status": true, role: "status", children: message }),
        ],
      });
    }

    function SafeModeBanner({ copy, bridge }) {
      const [active, setActive] = react.useState(false);
      const [suspects, setSuspects] = react.useState([]);
      const [busy, setBusy] = react.useState(false);
      react.useEffect(() => {
        if (typeof bridge?.getDesktopPreferences !== "function") return undefined;
        let mounted = true;
        // Safe Mode restarts the harness, so this component remounts on every
        // toggle; one read at mount is enough to keep the banner in sync.
        void bridge.getDesktopPreferences().then((value) => {
          if (value !== null && mounted) setActive(value.safeMode === true);
        });
        if (typeof bridge?.getRecoverySuspects === "function") {
          void bridge.getRecoverySuspects().then((value) => {
            if (mounted && Array.isArray(value)) setSuspects(value);
          });
        }
        return () => { mounted = false; };
      }, [bridge]);
      if (!active) return null;
      const suspect = suspects[0];
      return react_jsx_runtime.jsxs("div", {
        "data-dsh-safe-mode-banner": true, role: "status",
        children: [
          react_jsx_runtime.jsx("span", { children: copy.safeModeBanner }),
          suspect === undefined ? null : react_jsx_runtime.jsx("span", { "data-dsh-safe-mode-suspect": true, children: copy.safeModeSuspect.replace("{id}", suspect.id).replace("{name}", suspect.name ?? "") }),
          react_jsx_runtime.jsx("button", { type: "button", disabled: busy, onClick: () => {
            setBusy(true);
            void bridge?.desktopAction?.("exitSafeMode").finally(() => setBusy(false));
          }, children: copy.safeModeExit }),
        ],
      });
    }

    function DesktopControls({ useSessions }) {
      const zh = useChinese();
      const copy = zh ? COPY.zh : COPY.en;
      const bridge = typeof window !== "undefined" ? window.dshDesktop : undefined;
      const [open, setOpen] = react.useState(false);
      const [busy, setBusy] = react.useState("");
      const [preferences, setPreferences] = react.useState(null);
      const [lanState, setLanState] = react.useState(null);
      const [entryPosition, setEntryPosition] = react.useState(loadEntryPosition);
      const [dragging, setDragging] = react.useState(false);
      const dragRef = react.useRef(null);
      const suppressClickRef = react.useRef(false);
      const sessionState = useSessions((state) => state);
      const status = react.useMemo(() => publicStatusOf(sessionState), [sessionState]);

      react.useEffect(() => {
        if (typeof bridge?.reportSessionStatus !== "function" || status === undefined) return;
        void bridge.reportSessionStatus(status);
      }, [bridge, status]);

      react.useEffect(() => {
        if (!open || typeof bridge?.getDesktopPreferences !== "function") return undefined;
        void bridge.getDesktopPreferences().then((value) => { if (value !== null) setPreferences(value); });
        return undefined;
      }, [open, bridge]);

      react.useEffect(() => {
        // Mirror the native extension surfaces: the pairing entry reflects the
        // live LAN state (start / show QR + stop) each time the panel opens.
        if (!open || typeof bridge?.getLanState !== "function") return undefined;
        void bridge.getLanState().then((value) => { if (value !== null) setLanState(value); });
        return undefined;
      }, [open, bridge]);

      react.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [open]);

      const invoke = async (action) => {
        if (typeof bridge?.desktopAction !== "function") return;
        setBusy(action);
        try {
          // A false result (e.g. a failed preferences write for Safe Mode)
          // keeps the panel open; closing it would pretend success.
          if (await bridge.desktopAction(action) === true) setOpen(false);
        } finally {
          setBusy("");
        }
      };

      const onEntryPointerDown = (event) => {
        if (open || event.button !== 0) return;
        const container = event.currentTarget.parentElement;
        if (container === null) return;
        const bounds = container.getBoundingClientRect();
        // Attach synchronously: effect-mounted listeners can miss the first
        // moves of a fast drag, and a real pointer can leave the trigger.
        const move = (moveEvent) => {
          const drag = dragRef.current;
          if (drag === null) return;
          const dx = moveEvent.clientX - drag.startX;
          const dy = moveEvent.clientY - drag.startY;
          if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
          drag.moved = true;
          const margin = 8;
          const left = clamp(drag.left + dx, margin, window.innerWidth - drag.width - margin);
          const top = clamp(drag.top + dy, margin, window.innerHeight - drag.height - margin);
          drag.left = left;
          drag.top = top;
          drag.startX = moveEvent.clientX;
          drag.startY = moveEvent.clientY;
          setEntryPosition({ left: left, top: top });
        };
        const end = () => {
          const drag = dragRef.current;
          dragRef.current = null;
          setDragging(false);
          document.removeEventListener("pointermove", move, true);
          document.removeEventListener("pointerup", end, true);
          document.removeEventListener("pointercancel", end, true);
          // A drag also concludes with a click event; absorb only that one.
          suppressClickRef.current = drag === null ? false : drag.moved;
          if (drag?.moved === true) saveEntryPosition({ left: drag.left, top: drag.top });
        };
        dragRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          moved: false,
        };
        document.addEventListener("pointermove", move, true);
        document.addEventListener("pointerup", end, true);
        document.addEventListener("pointercancel", end, true);
        setDragging(true);
        event.preventDefault();
      };

      const onEntryClick = () => {
        if (suppressClickRef.current === true) {
          suppressClickRef.current = false;
          return;
        }
        setOpen((current) => !current);
      };

      const entryStyle = entryPosition === null
        ? undefined
        : { left: String(entryPosition.left) + "px", top: String(entryPosition.top) + "px", right: "auto" };

      return react_jsx_runtime.jsxs(react.Fragment, {
        children: [
          react_jsx_runtime.jsx(SafeModeBanner, { copy: copy, bridge: bridge }),
          react_jsx_runtime.jsxs("div", {
        "data-dsh-desktop-controls": true,
        style: entryStyle,
        children: [
          react_jsx_runtime.jsxs("button", {
            type: "button", "data-dsh-controls-trigger": true, "aria-expanded": open,
            "aria-controls": "dsh-desktop-controls-panel", "aria-label": copy.trigger,
            "data-dsh-controls-dragging": dragging || null,
            onPointerDown: onEntryPointerDown,
            onClick: onEntryClick,
            children: [
              react_jsx_runtime.jsx("span", { "data-dsh-controls-mark": true, "aria-hidden": "true", children: "⋮" }),
              react_jsx_runtime.jsx("span", { "data-dsh-controls-label": true, children: copy.trigger }),
            ],
          }),
          open ? react_jsx_runtime.jsxs("section", { id: "dsh-desktop-controls-panel", "data-dsh-controls-panel": true, role: "dialog", "aria-label": copy.title, children: [
            react_jsx_runtime.jsx("h2", { "data-dsh-controls-heading": true, children: copy.title }),
            typeof bridge?.desktopAction === "function" ? react_jsx_runtime.jsxs("div", { "data-dsh-controls-actions": true, children: [
              lanState?.running === true ? react_jsx_runtime.jsxs(react.Fragment, { children: [
                react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("showLanPairing"), children: copy.lanShowQr }),
                react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("stopLanPairing"), children: copy.lanStop }),
              ] }) : react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("startLanPairing"), children: copy.lanStart }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke(preferences?.safeMode === true ? "exitSafeMode" : "enterSafeMode"), children: preferences?.safeMode === true ? copy.safeModeExit : copy.safeModeStart }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("restartHarness"), children: copy.restartHarness }),
              react_jsx_runtime.jsx("hr", { "data-dsh-controls-separator": true, "aria-hidden": "true" }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("showAbout"), children: copy.about }),
            ] }) : react_jsx_runtime.jsx("p", { "data-dsh-controls-hint": true, children: copy.unavailable }),
          ] }) : null,
        ],
      }),
        ],
      });
    }

    const inject = ["slots", "sessions"];
    function apply(ctx) {
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay", id: "dsh-desktop-controls", order: 100, label: "Desktop controls",
      }, DesktopControls));
      // 独立设置分区（与通用/模型/插件并列），排版随 Harness 设置页。
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section", id: "dsh-desktop-controls", order: 20,
        label: () => document.documentElement.lang.toLowerCase().startsWith("zh") ? "扩展设置" : "Extensions",
      }, DesktopSettingsSection));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
