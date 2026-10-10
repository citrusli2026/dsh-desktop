/** Main-only endpoint binding for the current supervised Host generation. */
import { randomBytes } from 'node:crypto'
import type { SessionTrashRequest } from './trash-host.ts'
import type { TrashSessionInfo } from './trash-sessions.ts'

export class SessionTrashClient {
  readonly token = randomBytes(32).toString('hex')
  private port: number | undefined
  private generation = 0

  bind(port: number | undefined): void {
    this.port = port
    this.generation++
  }

  private async call(request: SessionTrashRequest): Promise<{ ok?: unknown; reason?: unknown; data?: unknown } | undefined> {
    const port = this.port
    const generation = this.generation
    if (port === undefined) return undefined
    try {
      const response = await fetch(`http://127.0.0.1:${port}/session-trash`, {
        method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(15_000), redirect: 'error',
      })
      const result = await response.json() as { ok?: unknown; reason?: unknown; data?: unknown }
      if (generation !== this.generation) return undefined
      return response.ok || response.status === 409 ? result : undefined
    } catch { return undefined }
  }

  async run(request: SessionTrashRequest): Promise<true | false | 'active'> {
    const result = await this.call(request)
    return result?.ok === true ? true : result?.reason === 'active' ? 'active' : false
  }

  async list(): Promise<TrashSessionInfo[] | null> {
    const result = await this.call({ action: 'list' })
    return result?.ok === true && Array.isArray(result.data) ? result.data as TrashSessionInfo[] : null
  }
}
