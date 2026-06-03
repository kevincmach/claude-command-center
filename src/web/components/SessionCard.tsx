import type { Session } from '../../shared/types.js'

const COLOR: Record<string, string> = {
  working: '#4aa3ff',
  researching_web: '#3a7d44',
  reading: '#9a7',
  meeting: '#c93',
  waiting_permission: '#ffb300',
  waiting_question: '#ffb300',
  idle: '#777',
  done: '#5bd66f',
  unknown: '#666',
}

export function SessionCard({ s }: { s: Session }) {
  const color = COLOR[s.activity] ?? '#666'
  return (
    <div
      style={{
        width: 180,
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: 10,
        background: '#1a1a1f',
      }}
    >
      <div style={{ fontWeight: 700 }}>🤖 {s.sessionId.slice(0, 6)}</div>
      <div style={{ fontSize: 12, color }}>{s.activity}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{s.title ?? '—'}</div>
      <div
        style={{
          height: 5,
          background: '#222',
          borderRadius: 3,
          marginTop: 6,
        }}
      >
        <div
          style={{
            width: `${Math.min(s.context.pct, 100)}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
        {s.model ?? '?'} · ${s.cost.usd.toFixed(2)} · {s.context.pct}%
      </div>
    </div>
  )
}
