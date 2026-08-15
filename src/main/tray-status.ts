import type { HarnessState } from './supervisor.ts'

/** Pure status label shared by the tray and its unit test. */
export function statusLabel(state: HarnessState | undefined): string {
  if (state?.phase === 'ready') return '状态:运行中'
  if (state?.phase === 'crashed') return `状态:已崩溃(${state.attempts} 次)`
  return '状态:启动中…'
}
