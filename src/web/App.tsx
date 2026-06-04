import { useEffect, useState } from 'react'
import type { Session } from '../shared/types.js'
import { subscribe } from './api.js'
import { Office } from './components/Office.js'
import { SettingsPanel } from './components/SettingsPanel.js'

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    return subscribe(
      (snapshot) => setSessions(snapshot),
      (kind, s) =>
        setSessions((prev) => {
          if (kind === 'ended')
            return prev.filter((p) => p.sessionId !== s.sessionId)
          const i = prev.findIndex((p) => p.sessionId === s.sessionId)
          if (i === -1) return [...prev, s]
          const copy = [...prev]
          copy[i] = s
          return copy
        }),
    )
  }, [])

  const needsAttention = sessions.filter(
    (s) =>
      s.activity === 'waiting_permission' || s.activity === 'waiting_question',
  )

  return (
    <div
      style={{
        fontFamily: 'system-ui',
        padding: 16,
        background: '#0f0f12',
        color: '#eee',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        🎮 Claude Command Center
        <button
          className="gear"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </h1>
      {needsAttention.length > 0 && (
        <div style={{ background: '#5c1111', padding: 10, borderRadius: 8 }}>
          🔔 {needsAttention.length} session(s) need you
        </div>
      )}
      <Office sessions={sessions} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
