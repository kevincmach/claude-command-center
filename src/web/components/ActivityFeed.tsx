import type { FeedItem } from '../activityFeed.js'
import { agentName } from '../agentName.js'
import { projectColor } from '../projectColor.js'

// Renders the accumulated feed (already newest-first from appendEvent),
// color-coded by project. agentName/projectColor are pure derivations.
export function ActivityFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return <p className="feed-empty">No activity yet.</p>
  }
  return (
    <ul className="feed">
      {items.map((it) => (
        <li key={it.id} className="feed-item">
          <span
            className="feed-dot"
            style={{ background: projectColor(it.project) }}
          />
          <span className="feed-name">{agentName(it.sessionId)}</span>
          <span className="feed-label">{it.label}</span>
        </li>
      ))}
    </ul>
  )
}
