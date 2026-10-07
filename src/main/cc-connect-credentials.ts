/** Main-process-only storage for the Feishu app secret. */
import * as electron from 'electron'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWriteFile } from './config-file.ts'
import { connectDirectory } from './cc-connect-config.ts'

export type CredentialProtection = 'none' | 'safeStorage' | 'file'

export interface CredentialState {
  secretConfigured: boolean
  credentialProtection: CredentialProtection
}

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface CredentialDocument {
  version: 1
  protection: Exclude<CredentialProtection, 'none'>
  value: string
}

const electronStorage: SafeStorageAdapter = {
  isEncryptionAvailable: () => electron.safeStorage.isEncryptionAvailable(),
  encryptString: value => electron.safeStorage.encryptString(value),
  decryptString: value => electron.safeStorage.decryptString(value),
}

export function credentialsPath(userData: string): string {
  return join(connectDirectory(userData), 'credentials.json')
}

function redactError(error: unknown, secret = ''): Error {
  const raw = error instanceof Error ? error.message : String(error)
  const message = secret === '' ? raw : raw.split(secret).join('[REDACTED]')
  return new Error(`credential storage failed: ${message}`)
}

function isCredentialDocument(value: unknown): value is CredentialDocument {
  if (typeof value !== 'object' || value === null) return false
  const document = value as Partial<CredentialDocument>
  return document.version === 1
    && (document.protection === 'safeStorage' || document.protection === 'file')
    && typeof document.value === 'string'
    && document.value !== ''
}

export class ConnectCredentials {
  private readonly path: string
  private readonly storage: SafeStorageAdapter

  constructor(path: string, storage: SafeStorageAdapter = electronStorage) {
    this.path = path
    this.storage = storage
  }

  private encryptionAvailable(): boolean {
    try {
      return this.storage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private async readDocument(): Promise<CredentialDocument | undefined> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw redactError(error)
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!isCredentialDocument(parsed)) throw new Error('credential document is malformed')
      return parsed
    } catch (error) {
      throw redactError(error)
    }
  }

  async state(): Promise<CredentialState> {
    const document = await this.readDocument()
    if (document === undefined) return { secretConfigured: false, credentialProtection: 'none' }
    return { secretConfigured: true, credentialProtection: document.protection }
  }

  async readSecret(): Promise<string | undefined> {
    const document = await this.readDocument()
    if (document === undefined) return undefined
    if (document.protection === 'file') return document.value
    if (!this.encryptionAvailable()) throw redactError(new Error('safeStorage is unavailable'))
    try {
      return this.storage.decryptString(Buffer.from(document.value, 'base64'))
    } catch (error) {
      throw redactError(error)
    }
  }

  async setSecret(secret: string): Promise<CredentialProtection> {
    if (secret === '') {
      await this.clearSecret()
      return 'none'
    }
    const protection: Exclude<CredentialProtection, 'none'> = this.encryptionAvailable() ? 'safeStorage' : 'file'
    let value: string
    try {
      value = protection === 'safeStorage'
        ? this.storage.encryptString(secret).toString('base64')
        : secret
    } catch (error) {
      throw redactError(error, secret)
    }
    try {
      await atomicWriteFile(this.path, `${JSON.stringify({ version: 1, protection, value })}\n`, 0o600)
    } catch (error) {
      throw redactError(error, secret)
    }
    return protection
  }

  async clearSecret(): Promise<void> {
    try {
      await unlink(this.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw redactError(error)
    }
  }
}
