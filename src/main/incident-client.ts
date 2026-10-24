/** Main-only endpoint binding for the current supervised Host generation. */
import { randomBytes } from 'node:crypto'
import { truncateUtf8 } from './incident.ts'

export type IncidentAskFailure = 'unsupported' | 'failed'

export type IncidentAskResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: IncidentAskFailure; message?: string }

export class IncidentClient {
  readonly token: string
  private port: number | undefined
  private generation = 0

  constructor(token = randomBytes(32).toString('hex')) {
    this.token = token
  }

  bind(port: number | undefined): void {
    this.port = port
    this.generation++
  }

  /** `undefined` means no Host is bound (the caller reports harness-unavailable). */
  async ask(request: { id: string; title: string; prompt: string; report: string }): Promise<IncidentAskResult | undefined> {
    const port = this.port
    const generation = this.generation
    if (port === undefined) return undefined
    try {
      // The Host rejects bodies over 64 KiB. Keep JSON escaping overhead in
      // the budget: a pathological report is shortened, never the code/actions.
      let report = request.report
      let body = JSON.stringify({ ...request, report })
      if (Buffer.byteLength(body) > 63_000) {
        report = truncateUtf8(report, 24_000)
        body = JSON.stringify({ ...request, report })
      }
      const response = await fetch(`http://127.0.0.1:${port}/incident/ask`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      })
      const result = await response.json() as { ok?: unknown; sessionId?: unknown; reason?: unknown; message?: unknown }
      if (generation !== this.generation) return undefined
      if (result.ok === true && typeof result.sessionId === 'string') return { ok: true, sessionId: result.sessionId }
      const reason: IncidentAskFailure = result.reason === 'unsupported' ? 'unsupported' : 'failed'
      return { ok: false, reason, ...(typeof result.message === 'string' ? { message: result.message } : {}) }
    } catch {
      return { ok: false, reason: 'failed' }
    }
  }
}
