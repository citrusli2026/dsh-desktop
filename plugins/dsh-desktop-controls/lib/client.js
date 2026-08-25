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
      [data-dsh-desktop-controls] button {
        font: inherit;
      }
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
      [data-dsh-desktop-controls] [data-dsh-controls-action]:focus-visible {
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
      [data-dsh-desktop-controls] [data-dsh-controls-copy] {
        color: var(--dsh-controls-muted);
        font-size: 12px;
        line-height: 1.5;
        margin: 4px 0 12px;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-actions] {
        display: grid;
        gap: 6px;
      }
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
      [data-dsh-desktop-controls] [data-dsh-controls-action][disabled] {
        cursor: wait;
        opacity: .6;
      }
      [data-dsh-desktop-controls] [data-dsh-controls-hint] {
        border-top: 1px solid var(--dsh-controls-border);
        color: var(--dsh-controls-muted);
        font-size: 11px;
        line-height: 1.5;
        margin-top: 10px;
        padding-top: 10px;
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
        trigger: "桌面入口",
        title: "桌面入口",
        copy: "Windows 顶部菜单隐藏时，可从这里或系统托盘继续操作。",
        lan: "连接移动设备",
        fullscreen: "切换全屏",
        about: "关于 dsh-desktop",
        hint: "也可以右键窗口任意位置，或点击系统托盘图标。",
        unavailable: "请右键窗口或点击系统托盘图标使用桌面入口。",
      },
      en: {
        trigger: "Desktop controls",
        title: "Desktop controls",
        copy: "When the Windows menu is hidden, use this panel or the system tray.",
        lan: "Connect a mobile device",
        fullscreen: "Toggle full screen",
        about: "About dsh-desktop",
        hint: "You can also right-click anywhere in the window or use the tray icon.",
        unavailable: "Right-click the window or use the system tray for desktop controls.",
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

    function DesktopControls() {
      const zh = useChinese();
      const copy = zh ? COPY.zh : COPY.en;
      const bridge = typeof window !== "undefined" ? window.dshDesktop : undefined;
      const [open, setOpen] = react.useState(false);
      const [busy, setBusy] = react.useState("");

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
          react_jsx_runtime.jsxs("button", {
            type: "button",
            "data-dsh-controls-trigger": true,
            "aria-expanded": open,
            "aria-controls": "dsh-desktop-controls-panel",
            "aria-label": copy.trigger,
            onClick: () => setOpen((current) => !current),
            children: [
              react_jsx_runtime.jsx("span", { "data-dsh-controls-mark": true, "aria-hidden": "true", children: "⋮" }),
              react_jsx_runtime.jsx("span", { "data-dsh-controls-label": true, children: copy.trigger }),
            ],
          }),
          open ? react_jsx_runtime.jsxs("section", {
            id: "dsh-desktop-controls-panel",
            "data-dsh-controls-panel": true,
            role: "dialog",
            "aria-label": copy.title,
            children: [
              react_jsx_runtime.jsx("h2", { "data-dsh-controls-heading": true, children: copy.title }),
              react_jsx_runtime.jsx("p", { "data-dsh-controls-copy": true, children: copy.copy }),
              typeof bridge?.desktopAction === "function" ? react_jsx_runtime.jsxs("div", {
                "data-dsh-controls-actions": true,
                children: [
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    "data-dsh-controls-action": true,
                    disabled: busy !== "",
                    onClick: () => void invoke("startLanPairing"),
                    children: react_jsx_runtime.jsx("span", { children: copy.lan }),
                  }),
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    "data-dsh-controls-action": true,
                    disabled: busy !== "",
                    onClick: () => void invoke("toggleFullscreen"),
                    children: react_jsx_runtime.jsx("span", { children: copy.fullscreen }),
                  }),
                  react_jsx_runtime.jsx("button", {
                    type: "button",
                    "data-dsh-controls-action": true,
                    disabled: busy !== "",
                    onClick: () => void invoke("showAbout"),
                    children: react_jsx_runtime.jsx("span", { children: copy.about }),
                  }),
                ],
              }) : react_jsx_runtime.jsx("p", { "data-dsh-controls-hint": true, children: copy.unavailable }),
              react_jsx_runtime.jsx("p", { "data-dsh-controls-hint": true, children: copy.hint }),
            ],
          }) : null,
        ],
      });
    }

    const inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "dsh-desktop-controls",
        order: 100,
        label: "Desktop controls",
      }, DesktopControls));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
