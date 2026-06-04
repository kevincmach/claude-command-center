import type { CSSProperties } from 'react'
import type { Session } from '../../shared/types.js'
import { projectColor } from '../projectColor.js'
import { agentName } from '../agentName.js'
import characterSprite from '../assets/character.png'

const IDLE: ReadonlySet<string> = new Set(['idle', 'done', 'unknown', 'planning'])

// Friendly phrase for what an agent is doing, when there's no auto-title yet.
const PHRASE: Record<string, string> = {
  working: 'coding',
  researching_web: 'researching the web',
  reading: 'reading the codebase',
  meeting: 'leading sub-agents',
  waiting_permission: 'waiting on you',
  waiting_question: 'asked you a question',
  idle: 'taking a break',
  done: 'wrapping up',
  planning: 'planning',
  unknown: 'idling',
}

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
  const color = projectColor(s.project.name)
  const ringStyle = { '--ring': color } as CSSProperties
  const name = agentName(s.sessionId)
  const work = s.title ?? PHRASE[s.activity] ?? s.activity

  return (
    <button
      className={`char${idle ? ' char--idle' : ''}`}
      style={ringStyle}
      onClick={() => onSelect(s)}
    >
      {waiting && <span className="bubble">❗</span>}
      <span className="speech">
        <b>{name}</b> · {s.project.name}
        <br />
        {work}
      </span>
      <span className="ring" />
      <img className="char-sprite" src={characterSprite} alt="" draggable={false} />
      <span className="agentname">{name}</span>
      <span className="project-tag" style={{ color }}>
        {s.project.name}
      </span>
      <span className="worktoday">{work}</span>
      <span className="meter">
        <i style={{ width: `${Math.min(s.context.pct, 100)}%` }} />
      </span>
    </button>
  )
}
