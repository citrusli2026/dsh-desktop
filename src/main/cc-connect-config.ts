/** Fixed cc-connect configuration owned by the desktop shell. */
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { atomicWriteFile, jsonCodec } from './config-file.ts'

export const CONNECT_DIRECTORY = 'cc-connect'
export const CONNECT_SECRET_ENV = 'DSH_CC_CONNECT_FEISHU_SECRET'

export interface ConnectSettings {
  enabled: boolean
  appId: string
  workspace: string
}

export interface ConnectTomlPaths {
  dataDir: string
  nodeCommand: string
  dshEntry: string
  dshHome: string
  workspace: string
}

export interface ConnectTomlInput {
  settings: ConnectSettings
  paths: ConnectTomlPaths
}

const DEFAULT_SETTINGS: ConnectSettings = { enabled: false, appId: '', workspace: '' }

export function connectDirectory(userData: string): string {
  return join(userData, CONNECT_DIRECTORY)
}

export function connectSettingsPath(userData: string): string {
  return join(connectDirectory(userData), 'settings.json')
}

export function connectConfigPath(userData: string): string {
  return join(connectDirectory(userData), 'config.toml')
}

export function normalizeConnectSettings(raw: unknown): ConnectSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const value = raw as Partial<ConnectSettings>
  return {
    enabled: value.enabled === true,
    appId: typeof value.appId === 'string' ? value.appId : '',
    workspace: typeof value.workspace === 'string' ? value.workspace : '',
  }
}

export async function readConnectSettings(userData: string): Promise<ConnectSettings> {
  try {
    return normalizeConnectSettings(JSON.parse(await readFile(connectSettingsPath(userData), 'utf8')) as unknown)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function writeConnectSettings(userData: string, settings: ConnectSettings): Promise<string> {
  const normalized = normalizeConnectSettings(settings)
  const path = connectSettingsPath(userData)
  await atomicWriteFile(path, jsonCodec.stringify(normalized), 0o600)
  return path
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function requireAbsolute(name: string, value: string): void {
  if (!isAbsolute(value)) throw new Error(`${name} must be absolute`)
}

/** Render only the fixed v1 structure; user values are basic-string escaped. */
export function renderConnectToml({ settings, paths }: ConnectTomlInput): string {
  requireAbsolute('dataDir', paths.dataDir)
  requireAbsolute('nodeCommand', paths.nodeCommand)
  requireAbsolute('dshEntry', paths.dshEntry)
  requireAbsolute('dshHome', paths.dshHome)
  requireAbsolute('workspace', paths.workspace)
  const args = [paths.dshEntry, '--profile', 'acp'].map(tomlString).join(', ')
  return [
    `data_dir = ${tomlString(paths.dataDir)}`,
    'language = "zh"',
    '',
    '[log]',
    'level = "info"',
    '',
    '[[projects]]',
    'name = "dsh-desktop"',
    '',
    '[projects.agent]',
    'type = "dsh"',
    '',
    '[projects.agent.options]',
    `command = ${tomlString(paths.nodeCommand)}`,
    `args = [${args}]`,
    `work_dir = ${tomlString(paths.workspace)}`,
    '',
    '[projects.agent.options.env]',
    `DSH_HOME = ${tomlString(paths.dshHome)}`,
    '',
    '[[projects.platforms]]',
    'type = "feishu"',
    '',
    '[projects.platforms.options]',
    `app_id = ${tomlString(settings.appId)}`,
    `app_secret = ${tomlString('${' + CONNECT_SECRET_ENV + '}')}`,
    'allow_from = "*"',
    '',
  ].join('\n')
}

export async function writeConnectToml(userData: string, input: ConnectTomlInput): Promise<string> {
  const path = connectConfigPath(userData)
  await atomicWriteFile(path, renderConnectToml(input), 0o600)
  return path
}
