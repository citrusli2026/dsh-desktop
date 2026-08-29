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
    return {
      command: "powershell",
      args: ["-NoProfile", "-Command",
        "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; " +
        "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; " +
        "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; " +
        "$g=[System.Drawing.Graphics]::FromImage($bmp); " +
        `$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${file}',[System.Drawing.Imaging.ImageFormat]::Png)`],
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

export function apply(ctx) {
  if (process.env.DSH_DESKTOP_SCREEN_CAPTURE !== "1") return;
  ctx.inject(["attachments"], (attachmentsCtx) => {
    registerScreenCapture(attachmentsCtx);
  });
}
