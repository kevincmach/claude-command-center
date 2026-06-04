import type { Session } from '../shared/types.js'

export type FeedKind = 'created' | 'updated' | 'ended'

export interface FeedItem {
  id: string
  sessionId: string
  project: string
  kind: FeedKind
  label: string
  at: number
}

/**
 * Turn an SSE change into a capped, newest-first feed list.
 * Pure: no Date/random — `id` is derived from sessionId + updatedAt + kind.
 */
export function appendEvent(
  list: FeedItem[],
  ev: { kind: FeedKind; s: Session },
  cap: number,
): FeedItem[] {
  const { kind, s } = ev
  const label =
    kind === 'created'
      ? 'appeared'
      : kind === 'ended'
        ? 'ended'
        : `→ ${s.activity}`
  const item: FeedItem = {
    id: `${s.sessionId}:${s.updatedAt}:${kind}`,
    sessionId: s.sessionId,
    project: s.project.name,
    kind,
    label,
    at: s.updatedAt,
  }
  return [item, ...list].slice(0, cap)
}
