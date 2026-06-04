import type { Session, Settings, SummaryResult } from '../shared/types.js'

export type SettingsView = Settings & { claudeAvailable: boolean }

export async function getSettings(): Promise<SettingsView> {
  const r = await fetch('/api/settings')
  return r.json()
}

export async function updateSettings(
  patch: Partial<Settings>,
): Promise<SettingsView> {
  const r = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return r.json()
}

export async function summarizeSession(id: string): Promise<SummaryResult> {
  const r = await fetch(`/api/sessions/${encodeURIComponent(id)}/summarize`, {
    method: 'POST',
  })
  return r.json()
}

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
