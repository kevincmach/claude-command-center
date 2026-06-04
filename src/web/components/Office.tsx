import type { Session } from '../../shared/types.js'
import { ROOMS, roomForActivity, type RoomId } from '../rooms.js'
import { Room } from './Room.js'

// Presentational: selection state lives in the shell now. Office just groups
// sessions into rooms and reports clicks via onSelect.
export function Office({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: Session[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (sessions.length === 0) {
    return (
      <p className="empty">
        The office is quiet — no active Claude Code sessions.
      </p>
    )
  }

  const byRoom = new Map<RoomId, Session[]>()
  for (const r of ROOMS) byRoom.set(r.id, [])
  for (const s of sessions) byRoom.get(roomForActivity(s.activity))!.push(s)

  return (
    <div className="office">
      {ROOMS.map((r) => (
        <Room
          key={r.id}
          room={r}
          sessions={byRoom.get(r.id)!}
          selectedId={selectedId}
          onSelect={(s) => onSelect(s.sessionId)}
        />
      ))}
    </div>
  )
}
