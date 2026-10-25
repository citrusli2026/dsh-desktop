/**
 * Host half for the browser-only desktop controls surface.
 *
 * Registers the opt-in `screen_capture` model tool (decision 0027) when the
 * desktop shell enables it via DSH_DESKTOP_SCREEN_CAPTURE=1. The tool follows
 * route C (decision 0027): it never routes images through a second model —
 * the PNG is committed through the native attachment service so the session's
 * image-capable model sees it directly, mirroring the native `read_image`
 * contract (saveImage ref -> { image: { attachmentId, … } }).
 */
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { startIncidentServer } from "./incident-host.js";
import { installRouteGuard } from "./route-guard.js";
import { startSessionTrashServer } from "./trash-host.js";

const CAPTURE_FALLBACKS_LINUX = [
  { command: "scrot", args: (file) => ["-o", file] },
  { command: "gnome-screenshot", args: (file) => ["-f", file] },
  { command: "spectacle", args: (file) => ["-b", "-n", "-o", file] },
  { command: "import", args: (file) => ["-window", "root", file] },
];

/** Platform capture invocation for a destination PNG path; undefined when the
 *  platform has no supported tool. Pure and unit-testable. */
export function captureCommand(platform, file) {
  if (platform === "darwin") return { command: "screencapture", args: ["-x", file] };
  if (platform === "win32") {
    // PowerShell single-quoted strings escape a quote by doubling it; %TEMP%
    // legitimately contains one (e.g. C:\Users\O'Brien\...).
    const psFile = file.replace(/'/g, "''");
    return {
      command: "powershell",
      args: ["-NoProfile", "-Command",
        "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; " +
        "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; " +
        "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; " +
        "$g=[System.Drawing.Graphics]::FromImage($bmp); " +
        `$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${psFile}',[System.Drawing.Imaging.ImageFormat]::Png)`],
    };
  }
  return undefined;
}

function run(command, args, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: timeoutMs }, (error) => (error ? reject(error) : resolve()));
    child.on("error", reject);
  });
}

async function captureScreen(platform, file) {
  if (platform === "linux") {
    let lastError;
    for (const candidate of CAPTURE_FALLBACKS_LINUX) {
      try {
        await run(candidate.command, candidate.args(file));
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("no linux screenshot tool found");
  }
  const cmd = captureCommand(platform, file);
  if (cmd === undefined) throw new Error("screen capture is not supported on this platform");
  await run(cmd.command, cmd.args);
}

/** The model-facing tool. Route gate mirrors the native read_image tool: it
 *  refuses unless the calling route declares image input — this plugin ships
 *  no vision routing of its own (decision 0027). */
function registerScreenCapture(ctx) {
  const attachments = ctx.get("attachments");
  if (attachments === undefined) return;
  ctx.tools.register(defineTool({
    name: "screen_capture",
    description: "Capture the current screen of the desktop machine and return the image itself. Harness validates and downscales the PNG before the next model request. Requires the current model to accept image input. Available only because the user enabled screen capture in the desktop settings.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          image: {
            type: "object",
            additionalProperties: false,
            required: true,
            properties: {
              attachmentId: { type: "string", required: true },
              mediaType: { type: "string", required: true },
              bytes: { type: "integer", required: true },
              width: { type: "integer", required: true },
              height: { type: "integer", required: true },
            },
          },
        },
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routed = exec.agent?.session.requestHeader()?.config;
      const provider = routed?.provider ?? exec.agent?.options.provider;
      const model = routed?.model ?? exec.agent?.options.model;
      const llm = ctx.get("llm");
      if (provider === void 0 || model === void 0 || llm === void 0) {
        throw new Error("screen capture requires a resolvable model route");
      }
      const active = await llm.resolveModelInfo(provider, model, exec.signal);
      if (active.inputModalities === void 0 || !active.inputModalities.includes("image")) {
        throw new Error(`model "${model}" does not accept image input; switch to an image-capable model (for example a DeepSeek Vision variant) to use screen capture`);
      }
      const file = join(tmpdir(), `dsh-screen-${Date.now()}.png`);
      try {
        await captureScreen(process.platform, file);
        const data = await readFile(file);
        const ref = await attachments.saveImage({ data, mediaType: "image/png", name: "screen-capture.png" });
        return {
          image: {
            attachmentId: ref.attachmentId,
            mediaType: ref.mediaType,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
          },
        };
      } finally {
        await rm(file, { force: true });
      }
    },
  }));
}


/**
 * Shell-owned companion adapter for recognised third-party widgets (ADR 0044).
 * The plugin stays unmodified: this page supplies the minimal chat shell the
 * widget's self-check expects, the hide button, and the click-through bridge.
 */
const COMPANION_ADAPTER_PATH = "/__dsh-desktop/whale-pet";
const COMPANION_ADAPTER_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>小鲸鱼</title>
<style>
html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}
#root{display:none!important}
#dsh-companion-hide{position:fixed;top:8px;right:8px;width:28px;height:28px;border-radius:50%;border:0;padding:0 0 2px;background:rgba(32,49,112,.78);color:#fff;font-size:17px;line-height:1;cursor:pointer;z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:inherit}
#dsh-companion-hide:hover{background:#203170}
</style></head><body>
<div id="root"><div data-composer-input="true"></div></div>
<button id="dsh-companion-hide" type="button" title="收起小鲸鱼并打开 DSH" aria-label="收起小鲸鱼并打开 DSH">\u2212</button>
<script>
(function () {
  // The shell passes the independently configured desktop size (px); pin both
  // vars so the companion no longer inherits the main window's viewport-based
  // base or the widget's saved scale.
  var requested = parseInt(new URLSearchParams(location.search).get("dshCompanionSize"), 10);
  var size = Math.min(400, Math.max(80, isFinite(requested) ? requested : 160));
  var fit = Math.max(80, Math.min(size, Math.max(80, window.innerWidth - 16), Math.max(80, window.innerHeight - 16)));
  var sizing = document.createElement("style");
  sizing.textContent = ".dshwv-root{--dshw-scale:1!important;--dshw-base:" + fit + "px!important}";
  document.head.appendChild(sizing);
  var bridge = window.dshCompanion;
  function interactive(on) { try { if (bridge && bridge.setInteractive) bridge.setInteractive(!!on); } catch (e) {} }
  var hit = null;
  function hitTest(event) {
    var target = document.elementFromPoint(event.clientX, event.clientY);
    var over = !!(target && target.closest && target.closest(".dshwv-root, .dshwv-menu, #dsh-companion-hide"));
    if (over !== hit) { hit = over; interactive(over); }
  }
  document.addEventListener("mousemove", hitTest, { passive: true });
  document.addEventListener("mouseleave", function () { hit = null; interactive(false); });
  window.addEventListener("blur", function () { hit = null; interactive(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && bridge && bridge.hide) bridge.hide();
  });
  var hide = document.getElementById("dsh-companion-hide");
  hide.addEventListener("click", function () { if (bridge && bridge.focusMain) bridge.focusMain(); });
  if (bridge && bridge.setInteractive) bridge.setInteractive(false);
  // If the widget never mounts (plugin missing or disabled), do not leave a
  // transparent window blocking the desktop.
  setTimeout(function () {
    if (!window.__dshWhaleWidget && bridge && bridge.hide) bridge.hide();
  }, 6000);
})();
</script>
<script src="/dsh-whale/widget.js"></script>
</body></html>`;

export function registerCompanionAdapter(ctx) {
  const webServer = ctx.webServer;
  if (!webServer || typeof webServer.register !== "function") return;
  ctx.effect(() => webServer.register({
    kind: "exact",
    path: COMPANION_ADAPTER_PATH,
    handler: (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(COMPANION_ADAPTER_HTML);
    },
  }));
}

export function apply(ctx) {
  // Install the reload-safe route wrapper before any third-party plugin applies
  // (this patch runs first), so a fiber reload cannot hit duplicate routes.
  try {
    ctx.inject(["webServer"], (hostCtx) => {
      try { installRouteGuard(hostCtx.webServer); } catch (error) {
        console.warn(`dsh-desktop-controls: route guard injection failed: ${String(error)}`);
      }
    });
  } catch (error) {
    console.warn(`dsh-desktop-controls: route guard inject failed: ${String(error)}`);
  }
  // Served for every profile so a recognised plugin needs no code change; the
  // page is only opened by the shell's companion controller. The web server is
  // an optional service, so wait for it locally instead of reading ctx.webServer
  // at apply time (it is not injected yet).
  try {
    ctx.inject(["webServer"], (hostCtx) => {
      try { registerCompanionAdapter(hostCtx); } catch (error) {
        console.warn(`dsh-desktop-controls: companion adapter unavailable: ${String(error)}`);
      }
    });
  } catch (error) {
    console.warn(`dsh-desktop-controls: companion adapter injection failed: ${String(error)}`);
  }
  const token = process.env.DSH_DESKTOP_TRASH_TOKEN;
  if (token) ctx.inject(["sessionController", "sessionPersistence", "workspaceRegistry"], (hostCtx) => {
    const server = startSessionTrashServer(hostCtx, process.env.DSH_HOME, token,
      port => console.log(`dsh-desktop-trash-ready: ${port}`));
    hostCtx.on("dispose", () => {
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    });
  });
  if (token) ctx.inject(["sessionController"], (hostCtx) => {
    try {
      const server = startIncidentServer(hostCtx, process.env.DSH_HOME, token,
        port => console.log(`dsh-desktop-incident-ready: ${port}`));
      hostCtx.on("dispose", () => {
        server.closeAllConnections();
        return new Promise(resolve => server.close(resolve));
      });
    } catch (error) {
      console.warn(`dsh-desktop-controls: incident host unavailable: ${String(error)}`);
    }
  });
  if (process.env.DSH_DESKTOP_SCREEN_CAPTURE !== "1") return;
  ctx.inject(["attachments"], (attachmentsCtx) => {
    registerScreenCapture(attachmentsCtx);
  });
}
