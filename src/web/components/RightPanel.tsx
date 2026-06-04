import type { Session } from '../../shared/types.js'
import type { FeedItem } from '../activityFeed.js'
import { Inspector } from './Inspector.js'
import { ActivityFeed } from './ActivityFeed.js'

export type PanelTab = 'inspector' | 'activity'

export function RightPanel({
  tab,
  onTab,
  collapsed,
  onToggleCollapse,
  selected,
  activity,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  collapsed: boolean
  onToggleCollapse: () => void
  selected: Session | null
  activity: FeedItem[]
}) {
  if (collapsed) {
    return (
      <div className="panel-edge">
        <button
          className="panel-collapse-btn"
          onClick={onToggleCollapse}
          title="Expand panel"
          aria-label="Expand panel"
        >
          ‹
        </button>
      </div>
    )
  }

  return (
    <aside className="right-panel">
      <div className="panel-tabs">
        <button
          className={`panel-tab${tab === 'inspector' ? ' panel-tab--active' : ''}`}
          onClick={() => onTab('inspector')}
        >
          Inspector
        </button>
        <button
          className={`panel-tab${tab === 'activity' ? ' panel-tab--active' : ''}`}
          onClick={() => onTab('activity')}
        >
          Activity
        </button>
        <button
          className="panel-collapse-btn"
          onClick={onToggleCollapse}
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          ›
        </button>
      </div>
      <div className="panel-body">
        {tab === 'inspector' ? (
          <Inspector key={selected?.sessionId ?? 'none'} s={selected} />
        ) : (
          <ActivityFeed items={activity} />
        )}
      </div>
    </aside>
  )
}
