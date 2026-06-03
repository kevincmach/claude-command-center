import type { Session } from '../shared/types.js'

export function subscribe(
  onSnapshot: (s: Session[]) => void,
  onChange: (kind: string, s: Session) => void,
): () => void {
  const es = new EventSource('/api/stream')
  es.addEventListener('snapshot', (e) =>
    onSnapshot(JSON.parse((e as MessageEvent).data)),
  )
  for (const kind of ['created', 'updated', 'ended']) {
    es.addEventListener(kind, (e) =>
      onChange(kind, JSON.parse((e as MessageEvent).data)),
    )
  }
  return () => es.close()
}
