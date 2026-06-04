import { useEffect, useState } from 'react'
import { getSettings, updateSettings, type SettingsView } from '../api.js'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SettingsView | null>(null)

  useEffect(() => {
    getSettings().then(setS)
  }, [])

  async function toggleSummaries(v: boolean) {
    setS((prev) => (prev ? { ...prev, summaries: v } : prev))
    setS(await updateSettings({ summaries: v }))
  }

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h3>⚙ Settings</h3>
        {!s ? (
          <p className="detail-row">Loading…</p>
        ) : (
          <label className="setting-row">
            <input
              type="checkbox"
              checked={s.summaries}
              disabled={!s.claudeAvailable}
              onChange={(e) => toggleSummaries(e.target.checked)}
            />
            <span>
              AI session summaries <small>(uses local Claude Code)</small>
              {!s.claudeAvailable && (
                <em className="setting-warn"> — `claude` CLI not found</em>
              )}
            </span>
          </label>
        )}
        <button className="detail-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
