import { useState } from 'react'
import type { Session } from '../../shared/types.js'
import { agentName } from '../agentName.js'
import { modelLabel, permissionBadge } from '../badges.js'
import { summarizeSession } from '../api.js'

export function CharacterDetail({
  s,
  onClose,
}: {
  s: Session
  onClose: () => void
}) {
  const [sum, setSum] = useState<{
    state: 'idle' | 'pending' | 'done' | 'error'
    tldr?: string
    path?: string
    error?: string
  }>({ state: 'idle' })

  async function onSummarize() {
    setSum({ state: 'pending' })
    try {
      const r = await summarizeSession(s.sessionId)
      if (r.status === 'disabled') {
        setSum({ state: 'error', error: 'summaries are off — enable in ⚙' })
      } else if (r.ok && r.status === 'written') {
        setSum({ state: 'done', tldr: r.tldr, path: r.path })
      } else if (r.ok) {
        setSum({ state: 'done' }) // skipped (e.g. nothing to summarize)
      } else {
        setSum({ state: 'error', error: r.error })
      }
    } catch (e) {
      setSum({ state: 'error', error: String(e) })
    }
  }

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h3>🤖 {agentName(s.sessionId)}</h3>
        <p className="detail-row">✏️ {s.title ?? '—'}</p>
        <p className="detail-row">📁 {s.project.name}</p>
        <p className="detail-row">⚙️ {s.activity}</p>
        <p className="detail-row">🧠 {modelLabel(s.model)}</p>
        {s.permissionMode && s.permissionMode !== 'normal' && (
          <p className="detail-row">
            {permissionBadge(s.permissionMode)?.icon ?? '🔓'} {s.permissionMode}
          </p>
        )}
        <p className="detail-row">
          📊 {s.context.pct}% context · ${s.cost.usd.toFixed(2)}
        </p>
        {s.subAgents > 0 && (
          <p className="detail-row">🐤 {s.subAgents} sub-agent(s)</p>
        )}
        {s.queuedCount > 0 && (
          <p className="detail-row">📥 {s.queuedCount} queued</p>
        )}
        <p className="detail-id">{s.sessionId}</p>
        <button
          className="detail-summarize"
          onClick={onSummarize}
          disabled={sum.state === 'pending'}
        >
          {sum.state === 'pending' ? '… summarizing' : '↻ Summarize'}
        </button>
        {sum.state === 'done' && (
          <>
            <p className="detail-row">📝 {sum.tldr ?? 'summary written'}</p>
            <p className="detail-row">
              <a
                className="vault-link"
                href={`/api/sessions/${s.sessionId}/page`}
                target="_blank"
                rel="noreferrer"
              >
                open summary ↗
              </a>
              {sum.path && <span className="vault-path"> · {sum.path}</span>}
            </p>
          </>
        )}
        {sum.state === 'error' && <p className="detail-row">⚠ {sum.error}</p>}
        <button className="detail-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
