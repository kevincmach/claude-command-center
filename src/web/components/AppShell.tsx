import { useState } from 'react'
import type { Session } from '../../shared/types.js'
import type { FeedItem } from '../activityFeed.js'
import { NavRail } from './NavRail.js'
import { Office } from './Office.js'
import { RightPanel, type PanelTab } from './RightPanel.js'
import { SettingsPanel } from './SettingsPanel.js'

// 3-column app shell. Owns UI state (collapse, active tab, settings overlay).
// Selection + data live one level up in App and arrive as props.
export function AppShell({
  sessions,
  selectedId,
  onSelect,
  activity,
}: {
  sessions: Session[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  activity: FeedItem[]
}) {
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [tab, setTab] = useState<PanelTab>('inspector')
  const [showSettings, setShowSettings] = useState(false)

  // Re-resolve the selected session each render so the Inspector reflects live
  // updates and clears when that session ends (same pattern Office used).
  const selected = selectedId
    ? (sessions.find((s) => s.sessionId === selectedId) ?? null)
    : null

  const needsAttention = sessions.filter(
    (s) =>
      s.activity === 'waiting_permission' || s.activity === 'waiting_question',
  )

  function handleSelect(id: string) {
    onSelect(id)
    setTab('inspector')
    if (panelCollapsed) setPanelCollapsed(false)
  }

  const shellClass = [
    'shell',
    navCollapsed ? 'shell--nav-collapsed' : '',
    panelCollapsed ? 'shell--panel-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      <NavRail
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed((v) => !v)}
        activeSection="office"
        onNavigate={() => {}}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="center-col">
        <h1 className="shell-title">🎮 Claude Command Center</h1>
        {needsAttention.length > 0 && (
          <div className="attention">
            🔔 {needsAttention.length} session(s) need you
          </div>
        )}
        <Office
          sessions={sessions}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </main>

      <RightPanel
        tab={tab}
        onTab={setTab}
        collapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed((v) => !v)}
        selected={selected}
        activity={activity}
      />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
