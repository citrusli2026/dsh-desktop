/**
 * DeepSeek balance readout for the tray and the extension settings
 * (decision 0025). The API key never leaves the main process except to the
 * DeepSeek balance API; reads come from the harness credential store
 * (`.credentials.yaml`, refs.DEEPSEEK_API_KEY). Fetch-on-demand with a
 * five-minute cache and in-flight dedupe — no background polling.
 * @module main/balance
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'

export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'
export const BALANCE_CACHE_TTL_MS = 5 * 60_000
/** Bound the balance lookup: a hung network must not leave the settings row
 *  and tray line silently missing forever. */
export const BALANCE_FETCH_TIMEOUT_MS = 10_000

export interface DeepSeekBalance {
  currency: string
  totalBalance: string
  isAvailable: boolean
}

/** Read the DeepSeek key from the harness credential store. Absent file or
 *  entry yields undefined — the balance surfaces simply disappear. */
export async function readDeepSeekApiKey(dshHome: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(dshHome, '.credentials.yaml'), 'utf8')
    const data = parse(raw) as { refs?: Record<string, unknown> } | null
    const key = data?.refs?.DEEPSEEK_API_KEY
    return typeof key === 'string' && key.trim() !== '' ? key.trim() : undefined
  } catch {
    return undefined
  }
}

/** Pick the balance entry from the DeepSeek user-balance payload, preferring
 *  CNY when several currencies are reported. Unrecognized shapes fail soft. */
export function parseBalancePayload(payload: unknown): DeepSeekBalance | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const { is_available: isAvailable, balance_infos: infos } = payload as {
    is_available?: unknown
    balance_infos?: unknown
  }
  if (!Array.isArray(infos) || infos.length === 0) return undefined
  const entries = infos.filter((entry): entry is Record<string, unknown> =>
    typeof entry === 'object' && entry !== null)
  const preferred = entries.find(entry => entry.currency === 'CNY') ?? entries[0]!
  const { currency, total_balance: totalBalance } = preferred as {
    currency?: unknown
    total_balance?: unknown
  }
  if (typeof currency !== 'string' || typeof totalBalance !== 'string') return undefined
  return { currency, totalBalance, isAvailable: isAvailable === true }
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export async function fetchBalance(
  apiKey: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  url: string = DEEPSEEK_BALANCE_URL,
  timeoutMs: number = BALANCE_FETCH_TIMEOUT_MS,
): Promise<DeepSeekBalance | undefined> {
  try {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return undefined
    return parseBalancePayload(await response.json())
  } catch {
    return undefined
  }
}

/** Format for display: currency-aware amount with the platform symbol. */
export function formatBalance(balance: DeepSeekBalance): string {
  const symbol = balance.currency === 'CNY' ? '¥' : balance.currency === 'USD' ? '$' : `${balance.currency} `
  return `${symbol}${balance.totalBalance}`
}

/** Cached read used by the tray and the extension settings. */
export class BalanceService {
  private cache: { at: number; balance: DeepSeekBalance } | undefined
  private inFlight: Promise<DeepSeekBalance | undefined> | undefined
  private readonly resolveApiKey: () => Promise<string | undefined>
  private readonly fetchImpl: FetchLike
  private readonly now: () => number

  constructor(
    resolveApiKey: () => Promise<string | undefined>,
    fetchImpl: FetchLike = fetch as unknown as FetchLike,
    now: () => number = Date.now,
  ) {
    this.resolveApiKey = resolveApiKey
    this.fetchImpl = fetchImpl
    this.now = now
  }

  /** Cached balance; refetches when the cache is older than the TTL. */
  async current(): Promise<DeepSeekBalance | undefined> {
    const cached = this.cache
    if (cached !== undefined && this.now() - cached.at < BALANCE_CACHE_TTL_MS) return cached.balance
    if (this.inFlight !== undefined) return this.inFlight
    this.inFlight = (async () => {
      try {
        const key = await this.resolveApiKey()
        if (key === undefined) return undefined
        const balance = await fetchBalance(key, this.fetchImpl)
        if (balance !== undefined) this.cache = { at: this.now(), balance }
        return balance
      } finally {
        this.inFlight = undefined
      }
    })()
    return this.inFlight
  }
}
