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
        top: 48px;
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
        cursor: pointer;
        display: inline-flex;
        gap: 7px;
        min-height: 34px;
        padding: 0 11px 0 8px;
        pointer-events: auto;
        transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-trigger]:hover {
        border-color: color-mix(in srgb, var(--dsh-controls-accent) 48%, var(--dsh-controls-border));
        box-shadow: 0 6px 22px rgba(31, 35, 43, .16);
        transform: translateY(-1px);
      }
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
      [data-dsh-desktop-controls] [data-dsh-controls-actions] { display: grid; gap: 6px; }
      [data-dsh-desktop-controls] [data-dsh-controls-action] {
        align-items: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 10px;
        color: var(--dsh-controls-text);
        cursor: pointer;
        display: flex;
        font-size: 13px;
        justify-content: space-between;
        padding: 9px 10px;
        text-align: left;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-action]:hover {
        background: color-mix(in srgb, var(--dsh-controls-accent) 9%, transparent);
        border-color: color-mix(in srgb, var(--dsh-controls-accent) 18%, transparent);
      }
      [data-dsh-desktop-controls] [data-dsh-controls-action][disabled] { cursor: wait; opacity: .6; }
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
      [data-dsh-desktop-settings] {
        border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(31, 35, 43, .12));
        color: var(--dsw-alias-label-primary, #1f232b);
        padding: 16px 0;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-settings-heading] { font-size: 14px; font-weight: 600; margin: 0; }
      [data-dsh-desktop-settings] [data-dsh-desktop-settings-copy] { margin: 4px 0 14px; }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-row] {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: space-between;
        min-height: 36px;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-row] + [data-dsh-desktop-setting-row] { margin-top: 6px; }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-label] { font-size: 13px; line-height: 1.4; }
      [data-dsh-desktop-settings] [data-dsh-desktop-setting-detail] {
        color: var(--dsh-controls-muted);
        display: block;
        font-size: 11px;
        line-height: 1.4;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-shortcut] {
        background: var(--dsw-alias-fill-l2, rgba(31, 35, 43, .08));
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        padding: 3px 6px;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-record] {
        background: transparent;
        border: 1px solid var(--dsw-alias-border-l2, rgba(31, 35, 43, .12));
        border-radius: 8px;
        color: var(--dsw-alias-label-primary, #1f232b);
        cursor: pointer;
        padding: 6px 9px;
      }
      [data-dsh-desktop-settings] [data-dsh-desktop-record]:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(31, 35, 43, .06)); }
      [data-dsh-desktop-settings] [data-dsh-desktop-record][disabled] { cursor: wait; opacity: .65; }
      [data-dsh-desktop-settings] [data-dsh-desktop-checkbox] { height: 16px; width: 16px; }
      [data-dsh-desktop-settings] [data-dsh-desktop-status] {
        color: var(--dsw-alias-state-error-primary, #c33);
        font-size: 12px;
        line-height: 1.4;
        margin: 10px 0 0;
      }
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
        trigger: "桌面入口", title: "桌面入口",
        copy: "Windows 顶部菜单隐藏时，可从这里或系统托盘继续操作。",
        lan: "连接移动设备", fullscreen: "切换全屏", about: "关于 dsh-desktop",
        logs: "打开日志文件夹", diagnostics: "导出诊断报告",
        shortcutLabel: "唤起窗口快捷键",
        hint: "也可以右键窗口任意位置，或点击系统托盘图标。",
        unavailable: "请右键窗口或点击系统托盘图标使用桌面入口。",
        settingsTitle: "桌面偏好", settingsCopy: "快捷键、开机启动和通知只保存在本机。",
        shortcut: "唤起快捷键", record: "重新设置", recording: "请按下快捷键…",
        shortcutHelp: "至少包含一个修饰键，例如 Ctrl + Alt + K。",
        launchAtLogin: "开机启动", launchAtLoginDetail: "登录系统后自动运行 dsh-desktop。",
        launchHidden: "启动后隐藏到托盘", launchHiddenDetail: "需要时用快捷键或托盘唤起。",
        notifications: "桌面通知", notificationsDetail: "应用未聚焦时提示完成、失败或需要确认。",
        unsupported: "当前平台不支持此项。", saved: "已保存",
        invalid: "快捷键格式不正确。", conflict: "快捷键已被其它应用占用，请换一个。",
      },
      en: {
        trigger: "Desktop controls", title: "Desktop controls",
        copy: "When the Windows menu is hidden, use this panel or the system tray.",
        lan: "Connect a mobile device", fullscreen: "Toggle full screen", about: "About dsh-desktop",
        logs: "Open logs folder", diagnostics: "Export diagnostics",
        shortcutLabel: "Summon shortcut",
        hint: "You can also right-click anywhere in the window or use the tray icon.",
        unavailable: "Right-click the window or use the system tray for desktop controls.",
        settingsTitle: "Desktop preferences", settingsCopy: "Shortcuts, startup, and notifications stay on this device.",
        shortcut: "Summon shortcut", record: "Change shortcut", recording: "Press a shortcut…",
        shortcutHelp: "Include at least one modifier, such as Ctrl + Alt + K.",
        launchAtLogin: "Launch at login", launchAtLoginDetail: "Start dsh-desktop when you sign in.",
        launchHidden: "Start hidden in the tray", launchHiddenDetail: "Summon it with the shortcut or tray when needed.",
        notifications: "Desktop notifications", notificationsDetail: "Notify when the app is unfocused about completion, failure, or input.",
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

    function DesktopSettings() {
      const zh = useChinese();
      const copy = zh ? COPY.zh : COPY.en;
      const bridge = typeof window !== "undefined" ? window.dshDesktop : undefined;
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
          setMessage(result.reason === "conflict" ? copy.conflict : result.reason === "invalid" ? copy.invalid : copy.unsupported);
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

      if (typeof bridge?.getDesktopPreferences !== "function" || preferences === null) return null;
      const canLaunch = preferences.launchAtLoginAvailable === true;
      return react_jsx_runtime.jsxs("div", {
        "data-dsh-desktop-settings": true,
        children: [
          react_jsx_runtime.jsx("h3", { "data-dsh-desktop-settings-heading": true, children: copy.settingsTitle }),
          react_jsx_runtime.jsx("p", { "data-dsh-desktop-settings-copy": true, children: copy.settingsCopy }),
          react_jsx_runtime.jsxs("div", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-label": true, children: copy.shortcut }),
            react_jsx_runtime.jsx("span", { "data-dsh-desktop-shortcut": true, children: recording ? copy.recording : preferences.shortcutLabel }),
            react_jsx_runtime.jsx("button", { type: "button", "data-dsh-desktop-record": true, disabled: recording, onClick: () => { setMessage(""); setRecording(true); }, children: recording ? "…" : copy.record }),
          ] }),
          react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-detail": true, children: copy.shortcutHelp }),
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.launchAtLogin, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.launchAtLoginDetail })] }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.launchAtLogin === true, disabled: !canLaunch, onChange: (event) => void update({ launchAtLogin: event.target.checked }) }),
          ] }),
          !canLaunch ? react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-detail": true, children: copy.unsupported }) : null,
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.launchHidden, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.launchHiddenDetail })] }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.launchHidden === true, disabled: !canLaunch || preferences.launchAtLogin !== true, onChange: (event) => void update({ launchHidden: event.target.checked }) }),
          ] }),
          react_jsx_runtime.jsxs("label", { "data-dsh-desktop-setting-row": true, children: [
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-setting-label": true, children: [copy.notifications, react_jsx_runtime.jsx("small", { "data-dsh-desktop-setting-detail": true, children: copy.notificationsDetail })] }),
            react_jsx_runtime.jsx("input", { "data-dsh-desktop-checkbox": true, type: "checkbox", checked: preferences.notificationsEnabled === true, disabled: preferences.notificationsAvailable !== true, onChange: (event) => void update({ notificationsEnabled: event.target.checked }) }),
          ] }),
          message === "" ? null : react_jsx_runtime.jsx("p", { "data-dsh-desktop-status": true, role: "status", children: message }),
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
          await bridge.desktopAction(action);
          setOpen(false);
        } finally {
          setBusy("");
        }
      };

      return react_jsx_runtime.jsxs("div", {
        "data-dsh-desktop-controls": true,
        children: [
          react_jsx_runtime.jsxs("button", { type: "button", "data-dsh-controls-trigger": true, "aria-expanded": open, "aria-controls": "dsh-desktop-controls-panel", "aria-label": copy.trigger, onClick: () => setOpen((current) => !current), children: [
            react_jsx_runtime.jsx("span", { "data-dsh-controls-mark": true, "aria-hidden": "true", children: "⋮" }),
            react_jsx_runtime.jsx("span", { "data-dsh-controls-label": true, children: copy.trigger }),
          ] }),
          open ? react_jsx_runtime.jsxs("section", { id: "dsh-desktop-controls-panel", "data-dsh-controls-panel": true, role: "dialog", "aria-label": copy.title, children: [
            react_jsx_runtime.jsx("h2", { "data-dsh-controls-heading": true, children: copy.title }),
            react_jsx_runtime.jsx("p", { "data-dsh-controls-copy": true, children: copy.copy }),
            typeof bridge?.desktopAction === "function" ? react_jsx_runtime.jsxs("div", { "data-dsh-controls-actions": true, children: [
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("startLanPairing"), children: copy.lan }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("toggleFullscreen"), children: copy.fullscreen }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("showAbout"), children: copy.about }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("openLogs"), children: copy.logs }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("exportDiagnostics"), children: copy.diagnostics }),
            ] }) : react_jsx_runtime.jsx("p", { "data-dsh-controls-hint": true, children: copy.unavailable }),
            react_jsx_runtime.jsx("p", { "data-dsh-controls-hint": true, children: copy.hint }),
            preferences?.shortcutLabel ? react_jsx_runtime.jsx("p", { "data-dsh-controls-hint": true, children: [copy.shortcutLabel, ": ", react_jsx_runtime.jsx("code", { "data-dsh-controls-shortcut": true, children: preferences.shortcutLabel })] }) : null,
          ] }) : null,
        ],
      });
    }

    const inject = ["slots", "sessions"];
    function apply(ctx) {
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay", id: "dsh-desktop-controls", order: 100, label: "Desktop controls",
      }, DesktopControls));
      ctx.slots.inject("settings.general.item", () => ctx.slots.register({
        name: "settings.general.item", id: "dsh-desktop-preferences", order: 5, label: "Desktop preferences",
      }, DesktopSettings));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
