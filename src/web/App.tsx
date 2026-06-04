import { useEffect, useRef, useState } from 'react'
import type { Session } from '../shared/types.js'
import { subscribe } from './api.js'
import { appendEvent, type FeedItem } from './activityFeed.js'
import { AppShell } from './components/AppShell.js'

const ACTIVITY_CAP = 200

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [activity, setActivity] = useState<FeedItem[]>([])
  // Monotonic counter → unique feed ids even when two changes share updatedAt.
  const seqRef = useRef(0)

  useEffect(() => {
    return subscribe(
      (snapshot) => setSessions(snapshot),
      (kind, s) => {
        setSessions((prev) => {
          if (kind === 'ended')
            return prev.filter((p) => p.sessionId !== s.sessionId)
          const i = prev.findIndex((p) => p.sessionId === s.sessionId)
          if (i === -1) return [...prev, s]
          const copy = [...prev]
          copy[i] = s
          return copy
        })
        const seq = (seqRef.current += 1)
        setActivity((prev) =>
          appendEvent(prev, { kind: kind as FeedItem['kind'], s, seq }, ACTIVITY_CAP),
        )
      },
    )
  }, [])

  return (
    <AppShell
      sessions={sessions}
      selectedId={selectedSessionId}
      onSelect={setSelectedSessionId}
      activity={activity}
    />
  )
}
