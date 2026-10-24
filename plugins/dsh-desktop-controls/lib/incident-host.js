/**
 * Host half of the incident triage channel (ADR 0046).
 *
 * The shell owns the facts (profile, log, failure classification) and this
 * process owns the only supported way to mint a Session, so the two meet over
 * a private loopback endpoint with the existing trash token. Keeping it a
 * separate server from /session-trash means a broken incident path can never
 * take the trash page down with it.
 */
import { createServer } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BODY = 64 * 1024;
const SAFE_ID = /^[\w.+-]{1,120}$/;

function authorized(header, token) {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Resolve whichever session capability this kernel exposes. Names and method
 * shapes drift across kernel lines, so probe for the two operations the
 * feature needs instead of pinning one class name.
 */
function service(ctx, name) {
  // Cordis throws on direct access to a service the plugin did not inject;
  // ctx.get() is the non-throwing lookup (and plain test contexts have neither).
  try {
    if (typeof ctx.get === "function") return ctx.get(name);
    return ctx[name];
  } catch {
    return undefined;
  }
}

function sessionApi(ctx) {
  const candidates = ["sessionController", "agents", "apiSessionController"].map(name => service(ctx, name));
  for (const api of candidates) {
    if (api === null || typeof api !== "object") continue;
    const create = typeof api.create === "function" ? api.create.bind(api)
      : typeof api.createSession === "function" ? api.createSession.bind(api) : undefined;
    if (create === undefined || typeof api.prompt !== "function") continue;
    return {
      create,
      prompt: api.prompt.bind(api),
      list: typeof api.list === "function" ? api.list.bind(api) : undefined,
    };
  }
  return undefined;
}

async function createSession(api, cwd) {
  const created = await api.create({ cwd });
  const sessionId = created?.sessionId ?? created?.agent?.id ?? created?.id;
  if (typeof sessionId !== "string" || sessionId === "") throw new Error("session creation returned no id");
  return sessionId;
}

async function sendPrompt(api, sessionId, prompt) {
  await api.prompt({
    sessionId,
    content: [{ type: "text", text: prompt }],
    requestId: randomUUID(),
    mode: "followup",
  }, AbortSignal.timeout(60_000));
}

async function persist(home, id, prompt, report) {
  const write = async base => {
    const dir = join(base, "incidents", id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, "report.md"), report, { mode: 0o600 });
    await writeFile(join(dir, "prompt.md"), prompt, { mode: 0o600 });
    return dir;
  };
  try {
    return await write(home);
  } catch {
    // A read-only DSH_HOME must not block triage: keep the evidence in a
    // private temp directory and use it as the session cwd.
    const fallback = await mkdtemp(join(tmpdir(), "dsh-desktop-incident-"));
    return write(fallback);
  }
}

function parseRequest(raw) {
  if (raw === null || typeof raw !== "object") return undefined;
  const body = raw;
  if (typeof body.id !== "string" || !SAFE_ID.test(body.id)) return undefined;
  if (typeof body.prompt !== "string" || body.prompt === "") return undefined;
  if (typeof body.report !== "string" || body.report === "") return undefined;
  if (typeof body.title !== "string") return undefined;
  return {
    id: body.id,
    title: body.title.slice(0, 200),
    prompt: body.prompt.slice(0, MAX_BODY - 512),
    report: body.report.slice(0, MAX_BODY - 512),
  };
}

async function runAsk(ctx, home, request) {
  const api = sessionApi(ctx);
  if (api === undefined) return { ok: false, reason: "unsupported" };
  const dir = await persist(home, request.id, request.prompt, request.report);
  let sessionId;
  try {
    sessionId = await createSession(api, dir);
    await sendPrompt(api, sessionId, request.prompt);
  } catch (error) {
    console.warn(`dsh-desktop-incident: triage session failed for ${request.id}: ${error instanceof Error ? error.message : "error"}`);
    return { ok: false, reason: "failed", message: error instanceof Error ? error.message : "session failed" };
  }
  // The sidebar needs the same summary shape the controller emits; resolve it
  // from list() when available and fall back to the identity.
  let summary = { sessionId };
  try {
    if (api.list !== undefined) {
      const listed = await api.list({}, AbortSignal.timeout(5_000));
      const found = Array.isArray(listed?.items) ? listed.items.find(item => item?.sessionId === sessionId) : undefined;
      if (found !== undefined) summary = found;
    }
  } catch { /* fall back to identity */ }
  try { ctx.emit("api-session/added", summary); } catch { /* older kernels */ }
  console.log(`dsh-desktop-incident: session ${sessionId} for ${request.id}`);
  return { ok: true, sessionId };
}

export function startIncidentServer(ctx, home, token, ready) {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/incident/ask") {
      response.writeHead(403).end();
      return;
    }
    if (!authorized(request.headers.authorization, token)) {
      response.writeHead(403).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        response.writeHead(413).end();
        request.destroy();
      }
    });
    request.on("end", () => {
      let parsed;
      try { parsed = parseRequest(JSON.parse(body)); } catch { /* invalid JSON */ }
      if (parsed === undefined) {
        response.writeHead(400).end();
        return;
      }
      void runAsk(ctx, home, parsed).then(
        result => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result)),
        error => {
          console.warn(`dsh-desktop-incident: ${parsed.id} failed: ${error instanceof Error ? error.message : "error"}`);
          response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, reason: "failed" }));
        },
      );
    });
  });
  server.listen(0, "127.0.0.1", () => { ready(server.address().port); });
  return server;
}
