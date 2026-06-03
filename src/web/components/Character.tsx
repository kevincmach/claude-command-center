import type { CSSProperties } from 'react'
import type { Session } from '../../shared/types.js'
import { projectColor } from '../projectColor.js'

const IDLE: ReadonlySet<string> = new Set(['idle', 'done', 'unknown', 'planning'])

export function Character({
  s,
  onSelect,
}: {
  s: Session
  onSelect: (s: Session) => void
}) {
  const waiting =
    s.activity === 'waiting_permission' || s.activity === 'waiting_question'
  const idle = IDLE.has(s.activity)
  const ringStyle = { '--ring': projectColor(s.project.name) } as CSSProperties

  return (
    <button
      className={`char${idle ? ' char--idle' : ''}`}
      style={ringStyle}
      onClick={() => onSelect(s)}
      title={s.title ?? s.sessionId}
    >
      {waiting && <span className="bubble">❗</span>}
      <span className="ring" />
      <span className="body">{idle ? '😴' : '🤖'}</span>
      <span className="nameplate">{s.title ?? s.project.name}</span>
      <span className="meter">
        <i style={{ width: `${Math.min(s.context.pct, 100)}%` }} />
      </span>
    </button>
  )
}
