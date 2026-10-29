/** Narrow, version-bound Host lifecycle extension; never patches user overlays. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const marker = '// dsh-desktop: idle-session-trash-v1'
const lifecycle = `
	${marker}
	trashHandles = new Map();
	trashBlocked = new Set();
	keepTrashHandle(handle) {
		this.trashHandles.set(handle.agent.id, handle);
		return handle.agent;
	}
	async withIdleSession(sessionId, operation) {
		const busy = () => new RemoteError("session/agent-busy", "session is active or owned by another client", { reason: "active or writer-held" });
		if (this.trashBlocked.has(sessionId) || this.resumes.has(sessionId) || this.claims.has(sessionId)) throw busy();
		this.trashBlocked.add(sessionId);
		try {
			if (this.ctx.agents.list().some(child => child.session.header.parentSession === sessionId) ||
				(await this.ctx.sessionPersistence.list()).some(child => child.header.parentSession === sessionId)) throw busy();
			const agent = this.ctx.agents.get(sessionId);
			if (agent !== void 0) {
				const handle = this.trashHandles.get(sessionId);
				if (handle?.agent !== agent || agent.status !== "idle" || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) throw busy();
				let claimed = false;
				try {
					return await agent.runMaintenance(async () => {
						claimed = true;
						await this.ctx.sessions.flush(agent.session);
						return operation(agent.session.header);
					});
				} finally {
					if (claimed) {
						try { await handle.dispose(); }
						finally { this.trashHandles.delete(sessionId); }
					}
				}
			}
			if (this.ctx.sessions.get(sessionId) !== void 0) throw busy();
			const stored = await this.ctx.sessionPersistence.open(sessionId, "write");
			try { return await operation(stored.header); }
			finally { await stored.close(); }
		} finally { this.trashBlocked.delete(sessionId); }
	}
`

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('session-trash patch: upstream anchor changed; review lifecycle before building')
  return source.replace(before, after)
}

/** Pure transform, exercised against the pinned upstream bundle in tests. */
export function patchSessionTrash(source) {
  if (source.includes(marker)) return source
  let patched = replaceOnce(source, 'var ApiSessionAgentController = class {', 'var ApiSessionAgentController = class {' + lifecycle)
  patched = replaceOnce(patched, '\t\t\t"sessions",\n\t\t\t"sessionProjections",', '\t\t\t"sessions",\n\t\t\t"sessionPersistence",\n\t\t\t"sessionProjections",')
  patched = replaceOnce(patched, '\tasync resolve(sessionId, observation) {', '\tasync resolve(sessionId, observation) {\n\t\tif (this.trashBlocked.has(sessionId)) return { error: new RemoteError("session/agent-busy", "session trash operation in progress", { reason: "trash operation in progress" }) };')
  // alpha.3 replaced ensureSession/creations with createSession → inOrder →
  // claim/claims. Guard the named admission and its actual serialization map.
  patched = replaceOnce(patched, '\tasync claim(sessionId, request) {', '\tasync claim(sessionId, request) {\n\t\tif (this.trashBlocked.has(sessionId)) throw new RemoteError("session/agent-busy", "session trash operation in progress", { reason: "trash operation in progress" });')
  // Preserve disposer capabilities at the owning create/resume sites, not by
  // looking up or mutating another owner's bare Agent/session registry.
  let handles = 0
  patched = patched.replace(/return \(await this\.ctx\.agents\.(resume|create)\(\{([\s\S]*?)\}\)\)\.agent;/g, (_, operation, options) => {
    handles++
    return `return this.keepTrashHandle(await this.ctx.agents.${operation}({${options}}));`
  })
  if (handles !== 3) throw new Error('session-trash patch: owning create/resume sites changed')
  patched = replaceOnce(patched, '\t\t\t\tawait this.ctx.agents.create({\n\t\t\t\t\tsessionId: childId,', '\t\t\t\tthis.agents.keepTrashHandle(await this.ctx.agents.create({\n\t\t\t\t\tsessionId: childId,')
  patched = replaceOnce(patched, '\t\t\t\t\tsetup: composition.setup\n\t\t\t\t});', '\t\t\t\t\tsetup: composition.setup\n\t\t\t\t}));')
  // 0.2.2-alpha.2 split Session creation into SessionCommandController and
  // dropped the outer controller's `inspect` method (the old anchor here). The
  // delegating `resolveAgent` forwarder it sat next to is byte-identical in
  // both reviewed kernels, so the exposed entry point hangs off that instead.
  patched = replaceOnce(patched,
    '\t\tresolveAgent(sessionId) {\n\t\t\treturn this.agents.resolveAgent(sessionId);\n\t\t}\n',
    '\t\tresolveAgent(sessionId) {\n\t\t\treturn this.agents.resolveAgent(sessionId);\n\t\t}\n\t\tasync withIdleSession(sessionId, operation) {\n\t\t\treturn this.agents.withIdleSession(sessionId, operation);\n\t\t}\n')
  return patched
}

/** The selection owner, not the desktop plugin, releases a removed main-view reference. */
export function patchWorkspaceTrashNavigation(source) {
  const clientMarker = '// dsh-desktop: removed-session-selection-v1'
  if (source.includes(clientMarker)) return source
  return replaceOnce(source, '\t\t\t\t\tif (this.clearArchivedCurrent()) return;', `\t\t\t\t\t${clientMarker}
\t\t\t\t\tif (this.mainReference?.binding.session.getSnapshot().removed) {
\t\t\t\t\t\tthis.clearMain();
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tif (this.clearArchivedCurrent()) return;`)
}

/** Kernels whose session-trash lifecycle has been reviewed against this patch.
 *  Every bump must add its kernel here with the review evidence: compare the
 *  two patched bundles (dsh-api-session-controller/lib/index.js and
 *  dsh-client-ui-workspace/lib/client.js) upstream between the versions, then
 *  re-run both transforms against the new source. 0.2.1-rc.1 → 0.2.1-rc.2:
 *  both files are byte-identical upstream (diff 0 lines) and both transforms
 *  still apply, so the reviewed diff carries over unchanged.
 *  0.2.1-rc.2 → 0.2.2-alpha.2: both upstream bundles changed a lot
 *  (dsh-api-session-controller/lib/index.js 3183 diff lines,
 *  dsh-client-ui-workspace/lib/client.js 1917). Every lifecycle anchor this
 *  patch depends on still resolves exactly once — the ApiSessionAgentController
 *  class, its "sessionPersistence" service dependency, `resolve`, `claim`, the
 *  three `agents.resume/create(...).agent` handle sites and the child-create
 *  site — and the workspace transform applies unchanged. Two upstream
 *  structural changes were absorbed: Session creation moved to the new
 *  SessionCommandController (which delegates to the reviewed controller, so
 *  handle wrapping stays on the owning path), and the outer controller's
 *  `inspect` method the delegation used as its anchor was removed; the
 *  delegation now hangs off the byte-identical `resolveAgent` forwarder. */
export const REVIEWED_KERNELS = ['0.2.1-rc.1', '0.2.1-rc.2', '0.2.2-alpha.2']

/** Only the shell-owned deployed closure is an allowed target. */
export async function patchBundledSessionTrash(root, upstreamRoot = root) {
  for (const [name, bundle, transform] of [
    ['dsh-api-session-controller', 'index.js', patchSessionTrash],
    ['dsh-client-ui-workspace', 'client.js', patchWorkspaceTrashNavigation],
  ]) {
    const packageRoot = join(root, 'node_modules', '@deepseek-ai', name)
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    if (!REVIEWED_KERNELS.includes(manifest.version)) throw new Error(`session-trash patch: unsupported kernel ${manifest.version}; lifecycle review required`)
    const file = join(packageRoot, 'lib', bundle)
    const upstreamFile = join(upstreamRoot, 'node_modules', '@deepseek-ai', name, 'lib', bundle)
    const source = await readFile(upstreamFile, 'utf8')
    const patched = transform(source)
    if (await readFile(file, 'utf8') !== patched) {
      const temporary = file + '.desktop-trash.tmp'
      await writeFile(temporary, patched)
      await rename(temporary, file)
    }
  }
}
