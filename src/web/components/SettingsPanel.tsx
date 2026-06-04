import { useEffect, useState } from 'react'
import { getSettings, updateSettings, type SettingsView } from '../api.js'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SettingsView | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setS)
      .catch(() => setErr('could not load settings — is the server up to date?'))
  }, [])

  async function toggleSummaries(v: boolean) {
    setS((prev) => (prev ? { ...prev, summaries: v } : prev))
    try {
      setS(await updateSettings({ summaries: v }))
    } catch {
      setErr('could not save setting')
    }
  }

  async function setView(v: 'html' | 'markdown') {
    setS((prev) => (prev ? { ...prev, summaryView: v } : prev))
    try {
      setS(await updateSettings({ summaryView: v }))
    } catch {
      setErr('could not save setting')
    }
  }

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h3>⚙ Settings</h3>
        {err ? (
          <p className="detail-row setting-warn">⚠ {err}</p>
        ) : !s ? (
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
        {s && (
          <label className="setting-row">
            <span>
              Summary view <small>(how the “open summary” link renders)</small>
            </span>
            <select
              value={s.summaryView ?? 'html'}
              onChange={(e) => setView(e.target.value as 'html' | 'markdown')}
            >
              <option value="html">Rendered (HTML)</option>
              <option value="markdown">Raw (Markdown)</option>
            </select>
          </label>
        )}
        <button className="detail-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
