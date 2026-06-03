import { useState } from 'react'
import type { Session } from '../../shared/types.js'
import { ROOMS, roomForActivity, type RoomId } from '../rooms.js'
import { projectColor } from '../projectColor.js'
import { Room } from './Room.js'
import { CharacterDetail } from './CharacterDetail.js'

export function Office({ sessions }: { sessions: Session[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const projects = [...new Set(sessions.map((s) => s.project.name))]
  // Re-resolve the selected session each render so it reflects live updates,
  // and disappears (popover closes) if that session ended.
  const selected = selectedId
    ? (sessions.find((s) => s.sessionId === selectedId) ?? null)
    : null

  return (
    <>
      <div className="office">
        {ROOMS.map((r) => (
          <Room
            key={r.id}
            room={r}
            sessions={byRoom.get(r.id)!}
            onSelect={(s) => setSelectedId(s.sessionId)}
          />
        ))}
      </div>

      <div className="legend">
        {projects.map((p) => (
          <span key={p} className="legend-item">
            <span
              className="legend-dot"
              style={{ background: projectColor(p) }}
            />
            {p}
          </span>
        ))}
      </div>

      {selected && (
        <CharacterDetail s={selected} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
