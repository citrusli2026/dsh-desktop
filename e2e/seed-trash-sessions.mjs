/** Real, validated kernel persistence fixtures, created only in the supplied temporary home. */
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
const requireKernel = createRequire(resolve('resources/harness/node_modules/@deepseek-ai/dsh/package.json'))
const { Context } = await import(requireKernel.resolve('@deepseek-ai/cordis'))
const { default: Persistence } = await import(requireKernel.resolve('@deepseek-ai/dsh-session-persistence-jsonl'))
const { SESSION_FORMAT_VERSION } = await import(requireKernel.resolve('@deepseek-ai/dsh-session'))
const [home, workspace] = process.argv.slice(2)
if (!home || !workspace) throw new Error('temporary home and workspace required')
const ctx = new Context()
const storage = new Persistence(ctx, { root: join(home, 'sessions') })
for (const id of ['session-livesession1', 'session-archivedsess']) {
  const handle = await storage.create({ version: SESSION_FORMAT_VERSION, id, createdAt: Date.now(), cwd: workspace, isSeeded: false })
  await handle.flush()
  await handle.close()
}
