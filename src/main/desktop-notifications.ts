/** Notifications derived from the Harness public session/job state. */
import type { ShellLocale } from './locale.ts'

export type PublicJobStatus = 'running' | 'stopping' | 'completed' | 'killed' | 'failed'

export interface PublicJobStatusSnapshot {
  id: string
  label: string
  status: PublicJobStatus
  detail?: string
}

export interface PublicSessionStatusSnapshot {
  id: string
  title: string
  running: boolean
  pendingInteraction?: 'approval' | 'plan-review' | 'question'
  jobs: readonly PublicJobStatusSnapshot[]
}

export interface PublicStatusSnapshot {
  sessions: readonly PublicSessionStatusSnapshot[]
}

export interface DesktopStatusNotification {
  title: string
  body: string
}

const JOB_STATUSES = new Set<PublicJobStatus>(['running', 'stopping', 'completed', 'killed', 'failed'])
const PENDING_INTERACTIONS = new Set(['approval', 'plan-review', 'question'])
const MAX_TEXT = 160

function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean === '' ? fallback : clean.slice(0, MAX_TEXT)
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Keep renderer-provided status reports small, typed, and display-safe. */
export function normalizePublicStatusSnapshot(value: unknown): PublicStatusSnapshot | undefined {
  const root = record(value)
  if (root === undefined || !Array.isArray(root.sessions)) return undefined
  const sessions: PublicSessionStatusSnapshot[] = []
  for (const candidate of root.sessions) {
    const source = record(candidate)
    if (source === undefined) continue
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    if (id === '') continue
    const jobs: PublicJobStatusSnapshot[] = []
    if (Array.isArray(source?.jobs)) {
      for (const jobCandidate of source.jobs.slice(0, 100)) {
        const job = record(jobCandidate)
        if (job === undefined) continue
        const jobId = typeof job.id === 'string' ? job.id.trim() : ''
        const status = job.status
        if (jobId === '' || typeof status !== 'string' || !JOB_STATUSES.has(status as PublicJobStatus)) continue
        jobs.push({
          id: jobId,
          label: text(job.label, jobId),
          status: status as PublicJobStatus,
          ...typeof job.detail === 'string' && job.detail.trim() !== '' ? { detail: text(job.detail, '') } : {},
        })
      }
    }
    const pending = typeof source.pendingInteraction === 'string' && PENDING_INTERACTIONS.has(source.pendingInteraction)
      ? source.pendingInteraction as PublicSessionStatusSnapshot['pendingInteraction']
      : undefined
    sessions.push({
      id,
      title: text(source.title, id),
      running: source.running === true,
      ...pending === undefined ? {} : { pendingInteraction: pending },
      jobs,
    })
  }
  return { sessions }
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map(item => [item.id, item]))
}

function localized(locale: ShellLocale, key: 'sessionDone' | 'needsInput' | 'jobDone' | 'jobFailed' | 'jobKilled', name: string, detail?: string): DesktopStatusNotification {
  if (locale === 'zh') {
    if (key === 'sessionDone') return { title: '任务已完成', body: `${name} 已完成。` }
    if (key === 'needsInput') return { title: '需要你的确认', body: `${name}等待你的${detail === 'question' ? '回答' : '确认'}。` }
    if (key === 'jobDone') return { title: '后台任务已完成', body: `${name} 已完成。` }
    if (key === 'jobKilled') return { title: '后台任务已停止', body: `${name} 已停止。` }
    return { title: '后台任务失败', body: detail === undefined ? `${name}执行失败。` : `${name}：${detail}` }
  }
  if (key === 'sessionDone') return { title: 'Task completed', body: `${name} finished.` }
  if (key === 'needsInput') return { title: 'Your input is needed', body: `${name} is waiting for your ${detail === 'question' ? 'answer' : 'confirmation'}.` }
  if (key === 'jobDone') return { title: 'Background task completed', body: `${name} finished.` }
  if (key === 'jobKilled') return { title: 'Background task stopped', body: `${name} was stopped.` }
  return { title: 'Background task failed', body: detail === undefined ? `${name} failed.` : `${name}: ${detail}` }
}

/**
 * Make a desktop notice click summon the shell window, so a completion or
 * waiting-for-input alert always leads back to the conversation.
 */
export function focusWindowOnNotificationClick(
  notification: { on(event: 'click', listener: () => void): unknown },
  showWindow: () => void,
): void {
  notification.on('click', showWindow)
}

/**
 * Return only true public-state edges. The first snapshot is a baseline, so a
 * renderer reload never produces a false notification for existing work.
 */
export function notificationsForPublicStatus(
  previous: PublicStatusSnapshot | undefined,
  next: PublicStatusSnapshot,
  locale: ShellLocale,
): DesktopStatusNotification[] {
  if (previous === undefined) return []
  const oldSessions = byId(previous.sessions)
  const notifications: DesktopStatusNotification[] = []
  for (const session of next.sessions) {
    const old = oldSessions.get(session.id)
    if (old === undefined) continue
    if (old.pendingInteraction === undefined && session.pendingInteraction !== undefined) {
      notifications.push(localized(locale, 'needsInput', session.title, session.pendingInteraction))
    } else if (old.running && !session.running && session.pendingInteraction === undefined) {
      notifications.push(localized(locale, 'sessionDone', session.title))
    }
    const oldJobs = byId(old.jobs)
    for (const job of session.jobs) {
      const oldJob = oldJobs.get(job.id)
      if (oldJob === undefined || !['running', 'stopping'].includes(oldJob.status) || ['running', 'stopping'].includes(job.status)) continue
      if (job.status === 'completed') notifications.push(localized(locale, 'jobDone', job.label))
      else if (job.status === 'killed') notifications.push(localized(locale, 'jobKilled', job.label))
      else if (job.status === 'failed') notifications.push(localized(locale, 'jobFailed', job.label, job.detail))
    }
  }
  return notifications.slice(0, 4)
}
