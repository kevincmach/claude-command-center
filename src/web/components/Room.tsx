import type { Session } from '../../shared/types.js'
import type { RoomDef } from '../rooms.js'
import { Character } from './Character.js'

export function Room({
  room,
  sessions,
  onSelect,
}: {
  room: RoomDef
  sessions: Session[]
  onSelect: (s: Session) => void
}) {
  const hot = sessions.some(
    (s) =>
      s.activity === 'waiting_permission' || s.activity === 'waiting_question',
  )
  return (
    <section className={`room${hot ? ' room--hot' : ''}`}>
      <header className="room-head">
        <span className="room-furn">{room.furniture}</span>
        {room.emoji} {room.label}
        <span className="room-count">{sessions.length}</span>
      </header>
      <div className="crew">
        {sessions.map((s) => (
          <Character key={s.sessionId} s={s} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}
