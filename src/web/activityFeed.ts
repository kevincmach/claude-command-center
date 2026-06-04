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
 * Pure: no Date/random. `seq` is a caller-supplied monotonic counter — it's the
 * uniqueness source for `id`, because the server can emit several `updated`
 * events for one session without bumping `updatedAt` (e.g. a time-driven
 * live→stale transition), so updatedAt alone would collide as a React key.
 */
export function appendEvent(
  list: FeedItem[],
  ev: { kind: FeedKind; s: Session; seq: number },
  cap: number,
): FeedItem[] {
  const { kind, s, seq } = ev
  const label =
    kind === 'created'
      ? 'appeared'
      : kind === 'ended'
        ? 'ended'
        : `→ ${s.activity}`
  const item: FeedItem = {
    id: `${s.sessionId}:${seq}`,
    sessionId: s.sessionId,
    project: s.project.name,
    kind,
    label,
    at: s.updatedAt,
  }
  return [item, ...list].slice(0, cap)
}
