export interface ParsedSemver {
  base: [number, number, number]
  pre: string[] | null
}
export function parseSemver(value: string): ParsedSemver | null
export function compareSemver(a: string, b: string): number | null
export function isSemver(value: string): string | null
export function parseCompositeVersion(version: string): { dsh: string; rev: number } | null
export function installerNames(version: string, platform?: NodeJS.Platform): string[]
export function expectedAssetNames(version: string): string[]
export function classifyPublicAsset(name: string): { kind: string; platform?: string; arch?: string }
export function classifyOs(name: string): string
export const SHA256_LINE: RegExp
export function isSha256Hex(value: string): boolean
export function isSha512Base64(value: string): boolean
