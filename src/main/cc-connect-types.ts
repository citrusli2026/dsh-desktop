import type { CredentialProtection } from './cc-connect-credentials.ts'
import type { ConnectSettings, ConnectSettingsSource } from './cc-connect-config.ts'

export type ConnectPhase = 'disabled' | 'stopped' | 'starting' | 'ready' | 'crashed' | 'degraded'

export interface ConnectState extends ConnectSettings {
  phase: ConnectPhase
  secretConfigured: boolean
  credentialProtection: CredentialProtection
  lastError?: string
  restartAttempts?: number
}

export interface ConnectSettingsInput extends ConnectSettingsSource {
  appSecret?: string
}

export type ConnectSaveResult =
  | { ok: true; state: ConnectState }
  | { ok: false; reason: 'invalid-input' | 'invalid-workspace' | 'storage'; state: ConnectState }
