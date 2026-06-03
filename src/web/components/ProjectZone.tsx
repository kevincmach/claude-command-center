import type { Session } from '../../shared/types.js'
import { SessionCard } from './SessionCard.js'

export function ProjectZone({
  name,
  sessions,
}: {
  name: string
  sessions: Session[]
}) {
  return (
    <section
      style={{
        border: '1px solid #333',
        borderRadius: 10,
        padding: 12,
        margin: '12px 0',
      }}
    >
      <h2 style={{ fontSize: 16 }}>
        📁 {name}
        <span style={{ color: '#888', fontSize: 12 }}> · {sessions.length}</span>
      </h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {sessions.map((s) => (
          <SessionCard key={s.sessionId} s={s} />
        ))}
      </div>
    </section>
  )
}
