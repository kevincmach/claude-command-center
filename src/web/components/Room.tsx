import type { Session } from '../../shared/types.js'
import type { RoomDef } from '../rooms.js'
import { Character } from './Character.js'
import { ROOM_DECOR } from '../roomDecor.js'
import { PROP_URL } from '../propImages.js'

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
      <div className="room-decor">
        {(ROOM_DECOR[room.id] ?? [])
          .map((name) => PROP_URL[name])
          .filter(Boolean)
          .map((url, i) => (
            <img key={i} className="prop" src={url} alt="" draggable={false} />
          ))}
      </div>
      <div className="crew">
        {sessions.map((s) => (
          <Character key={s.sessionId} s={s} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}
