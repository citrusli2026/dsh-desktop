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
        copy: "窗口菜单不可达时，从这里或系统托盘继续使用扩展功能。",
        lan: "连接设备", fullscreen: "切换全屏", logs: "打开日志", diagnostics: "导出诊断", about: "关于",
        shortcutLabel: "唤起快捷键",
        hint: "也可以右键窗口任意位置，或点击系统托盘图标。",
        unavailable: "请右键窗口或点击系统托盘图标使用扩展入口。",
        settingsTitle: "扩展设置", settingsCopy: "连接移动设备、快捷键、开机启动和通知只保存在本机。",
        lanSettings: "连接移动设备", lanSettingsDetail: "手机与电脑连接同一局域网，扫描二维码即可进入 Harness Web 界面。",
        lanStart: "开始配对", lanShowQr: "显示二维码", lanStop: "停止共享",
        shortcut: "唤起快捷键", record: "重新设置", recording: "请按下快捷键…",
        shortcutHelp: "至少包含一个修饰键，例如 Ctrl + Alt + K。",
        launchAtLogin: "开机启动", launchAtLoginDetail: "登录系统后自动运行 dsh-desktop。",
        launchHidden: "启动后隐藏到托盘", launchHiddenDetail: "需要时用快捷键或托盘唤起。",
        notifications: "桌面通知", notificationsDetail: "应用未聚焦时提示完成、失败或需要确认。",
        unsupported: "当前平台不支持此项。", saved: "已保存",
        invalid: "快捷键格式不正确。", conflict: "快捷键已被其它应用占用，请换一个。",
      },
      en: {
        trigger: "Extensions", title: "Extensions",
        copy: "When the window menu is unreachable, keep using extensions from here or the system tray.",
        lan: "Pair device", fullscreen: "Fullscreen", logs: "Open logs", diagnostics: "Diagnostics", about: "About",
        shortcutLabel: "Summon shortcut",
        hint: "You can also right-click anywhere in the window or use the tray icon.",
        unavailable: "Right-click the window or use the system tray for extensions.",
        settingsTitle: "Extensions", settingsCopy: "Mobile pairing, shortcuts, startup, and notifications stay on this device.",
        lanSettings: "Connect a mobile device", lanSettingsDetail: "Same LAN as the computer; scan the QR code to enter the Harness Web UI.",
        lanStart: "Start pairing", lanShowQr: "Show QR code", lanStop: "Stop sharing",
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
          setMessage(result.reason === "conflict" ? copy.conflict : result.reason === "invalid" ? copy.invalid : copy.unsupported);
        }
      };

      const [lanState, setLanState] = react.useState(null);
      const [lanBusy, setLanBusy] = react.useState(false);

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
            react_jsx_runtime.jsx("span", { "data-dsh-desktop-setting-label": true, children: copy.shortcut }),
            react_jsx_runtime.jsxs("span", { "data-dsh-desktop-shortcut": true, children: recording ? copy.recording : preferences.shortcutLabel }),
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

      return react_jsx_runtime.jsxs("div", {
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
            react_jsx_runtime.jsx("p", { "data-dsh-controls-copy": true, children: copy.copy }),
            typeof bridge?.desktopAction === "function" ? react_jsx_runtime.jsxs("div", { "data-dsh-controls-actions": true, children: [
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("startLanPairing"), children: copy.lan }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("toggleFullscreen"), children: copy.fullscreen }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("openLogs"), children: copy.logs }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("exportDiagnostics"), children: copy.diagnostics }),
              react_jsx_runtime.jsx("hr", { "data-dsh-controls-separator": true, "aria-hidden": "true" }),
              react_jsx_runtime.jsx("button", { type: "button", "data-dsh-controls-action": true, disabled: busy !== "", onClick: () => void invoke("showAbout"), children: copy.about }),
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
