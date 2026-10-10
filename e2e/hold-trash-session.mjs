/** Hold a real cross-process kernel writer lease in an isolated test home. */
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
const requireKernel = createRequire(resolve('resources/harness/node_modules/@deepseek-ai/dsh/package.json'))
const { Context } = await import(requireKernel.resolve('@deepseek-ai/cordis'))
const { default: Persistence } = await import(requireKernel.resolve('@deepseek-ai/dsh-session-persistence-jsonl'))
const [home, id] = process.argv.slice(2)
if (!home || !id) throw new Error('temporary home and session identity required')
const storage = new Persistence(new Context(), { root: join(home, 'sessions') })
const handle = await storage.open(id, 'write')
console.log('writer-ready')
process.stdin.resume()
await new Promise(resolve => process.stdin.on('end', resolve))
await handle.close()
