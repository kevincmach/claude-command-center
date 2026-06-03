import type { Session } from '../../shared/types.js'

export function CharacterDetail({
  s,
  onClose,
}: {
  s: Session
  onClose: () => void
}) {
  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h3>{s.title ?? s.sessionId.slice(0, 8)}</h3>
        <p className="detail-row">📁 {s.project.name}</p>
        <p className="detail-row">⚙️ {s.activity}</p>
        <p className="detail-row">🧠 {s.model ?? '—'}</p>
        <p className="detail-row">
          📊 {s.context.pct}% context · ${s.cost.usd.toFixed(2)}
        </p>
        {s.subAgents > 0 && (
          <p className="detail-row">🐤 {s.subAgents} sub-agent(s)</p>
        )}
        <p className="detail-id">{s.sessionId}</p>
        <button className="detail-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
