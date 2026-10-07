import type { CredentialProtection } from './cc-connect-credentials.ts'

export type ConnectPhase = 'disabled' | 'stopped' | 'starting' | 'ready' | 'crashed' | 'degraded'

export interface ConnectState {
  enabled: boolean
  phase: ConnectPhase
  appId: string
  secretConfigured: boolean
  workspace: string
  credentialProtection: CredentialProtection
  lastError?: string
  restartAttempts?: number
}

export interface ConnectSettingsInput {
  enabled: boolean
  appId: string
  workspace: string
  appSecret?: string
}

export type ConnectSaveResult =
  | { ok: true; state: ConnectState }
  | { ok: false; reason: 'invalid-input' | 'invalid-workspace' | 'storage'; state: ConnectState }
