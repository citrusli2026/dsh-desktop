/** Single-project cc-connect configuration owned by the desktop shell. */
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { atomicWriteFile, jsonCodec } from './config-file.ts'

export const CONNECT_DIRECTORY = 'cc-connect'
export const CONNECT_SECRET_ENV = 'DSH_CC_CONNECT_FEISHU_SECRET'

export type ConnectDetail = 'full' | 'compact' | 'quiet'
export type ConnectCardMode = 'legacy' | 'rich'
export type ConnectProgressStyle = 'legacy' | 'compact' | 'card'

export interface ConnectSettings {
  enabled: boolean
  appId: string
  workspace: string
  detail: ConnectDetail
  showStreamPreview: boolean
  streamPreviewIntervalMs: number
  cardMode: ConnectCardMode
  progressStyle: ConnectProgressStyle
}

/** Legacy callers/files may omit display preferences; resolved settings cannot. */
export type ConnectSettingsSource = Pick<ConnectSettings, 'enabled' | 'appId' | 'workspace'> & Partial<Omit<ConnectSettings, 'enabled' | 'appId' | 'workspace'>>

export interface ConnectTomlPaths {
  dataDir: string
  nodeCommand: string
  dshEntry: string
  dshHome: string
  workspace: string
}

export interface ConnectTomlInput {
  settings: ConnectSettingsSource
  paths: ConnectTomlPaths
}

export const CONNECT_DISPLAY_DEFAULTS = {
  detail: 'compact', showStreamPreview: true, streamPreviewIntervalMs: 3000, cardMode: 'legacy', progressStyle: 'legacy',
} satisfies Pick<ConnectSettings, 'detail' | 'showStreamPreview' | 'streamPreviewIntervalMs' | 'cardMode' | 'progressStyle'>
const DEFAULT_SETTINGS: ConnectSettings = { enabled: false, appId: '', workspace: '', ...CONNECT_DISPLAY_DEFAULTS }

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
    detail: value.detail === 'full' || value.detail === 'compact' || value.detail === 'quiet' ? value.detail : DEFAULT_SETTINGS.detail,
    showStreamPreview: typeof value.showStreamPreview === 'boolean' ? value.showStreamPreview : DEFAULT_SETTINGS.showStreamPreview,
    streamPreviewIntervalMs: typeof value.streamPreviewIntervalMs === 'number' && Number.isFinite(value.streamPreviewIntervalMs) && Number.isInteger(value.streamPreviewIntervalMs)
      ? Math.max(500, Math.min(30000, value.streamPreviewIntervalMs)) : DEFAULT_SETTINGS.streamPreviewIntervalMs,
    cardMode: value.cardMode === 'legacy' || value.cardMode === 'rich' ? value.cardMode : DEFAULT_SETTINGS.cardMode,
    progressStyle: value.progressStyle === 'legacy' || value.progressStyle === 'compact' || value.progressStyle === 'card' ? value.progressStyle : DEFAULT_SETTINGS.progressStyle,
  }
}

export async function readConnectSettings(userData: string): Promise<ConnectSettings> {
  try {
    return normalizeConnectSettings(JSON.parse(await readFile(connectSettingsPath(userData), 'utf8')) as unknown)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function writeConnectSettings(userData: string, settings: ConnectSettingsSource): Promise<string> {
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

/** Render one fixed project/platform with validated display preferences. */
export function renderConnectToml({ settings, paths }: ConnectTomlInput): string {
  requireAbsolute('dataDir', paths.dataDir)
  requireAbsolute('nodeCommand', paths.nodeCommand)
  requireAbsolute('dshEntry', paths.dshEntry)
  requireAbsolute('dshHome', paths.dshHome)
  requireAbsolute('workspace', paths.workspace)
  const args = [paths.dshEntry, '--profile', 'acp'].map(tomlString).join(', ')
  const display = normalizeConnectSettings(settings)
  return [
    `data_dir = ${tomlString(paths.dataDir)}`,
    'language = "zh"',
    '',
    '[log]',
    'level = "info"',
    '',
    '[stream_preview]',
    `enabled = ${display.showStreamPreview}`,
    `interval_ms = ${display.streamPreviewIntervalMs}`,
    'min_delta_chars = 80',
    '',
    '[[projects]]',
    'name = "dsh-desktop"',
    '',
    '[projects.display]',
    `mode = ${tomlString(display.detail)}`,
    `thinking_messages = ${display.detail === 'full'}`,
    `tool_messages = ${display.detail === 'full'}`,
    `card_mode = ${tomlString(display.cardMode)}`,
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
    `progress_style = ${tomlString(display.progressStyle)}`,
    'enable_feishu_card = true',
    '',
  ].join('\n')
}

export async function writeConnectToml(userData: string, input: ConnectTomlInput): Promise<string> {
  const path = connectConfigPath(userData)
  await atomicWriteFile(path, renderConnectToml(input), 0o600)
  return path
}
