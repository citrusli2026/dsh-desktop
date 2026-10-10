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
		if (this.trashBlocked.has(sessionId) || this.resumes.has(sessionId) || this.creations.has(sessionId)) throw busy();
		this.trashBlocked.add(sessionId);
		try {
			const agent = this.ctx.agents.get(sessionId);
			if (agent !== void 0) {
				const handle = this.trashHandles.get(sessionId);
				if (handle?.agent !== agent || agent.status !== "idle" || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) throw busy();
				if (this.ctx.agents.list().some(child => child.session.header.parentSession === sessionId)) throw busy();
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
  patched = replaceOnce(patched, '\tasync resolve(sessionId, observation) {', '\tasync resolve(sessionId, observation) {\n\t\tif (this.trashBlocked.has(sessionId)) return { error: new RemoteError("session/agent-busy", "session trash operation in progress", { reason: "trash operation in progress" }) };')
  patched = replaceOnce(patched, '\tasync ensureSession(sessionId, cwd, checkPersistedIdentity, presetId) {', '\tasync ensureSession(sessionId, cwd, checkPersistedIdentity, presetId) {\n\t\tif (this.trashBlocked.has(sessionId)) throw new RemoteError("session/agent-busy", "session trash operation in progress", { reason: "trash operation in progress" });')
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
  patched = replaceOnce(patched, '\t\tinspect(sessionId, signal) {', '\t\tasync withIdleSession(sessionId, operation) {\n\t\t\treturn this.agents.withIdleSession(sessionId, operation);\n\t\t}\n\t\tinspect(sessionId, signal) {')
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

/** Only the shell-owned deployed closure is an allowed target. */
export async function patchBundledSessionTrash(root, upstreamRoot = root) {
  for (const [name, bundle, transform] of [
    ['dsh-api-session-controller', 'index.js', patchSessionTrash],
    ['dsh-client-ui-workspace', 'client.js', patchWorkspaceTrashNavigation],
  ]) {
    const packageRoot = join(root, 'node_modules', '@deepseek-ai', name)
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    if (manifest.version !== '0.2.1-alpha.2') throw new Error(`session-trash patch: unsupported kernel ${manifest.version}; lifecycle review required`)
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
