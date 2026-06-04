// Grouped navigation rail. Office + Settings are active; everything else is a
// disabled "soon" stub (each becomes its own later tier). Collapsible to icons.

interface NavItem {
  id: string
  icon: string
  label: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  { label: 'Live', items: [{ id: 'office', icon: '🏢', label: 'Office' }] },
  {
    label: 'Knowledge',
    items: [
      { id: 'notes', icon: '🗒', label: 'Notes' },
      { id: 'analytics', icon: '📊', label: 'Analytics' },
    ],
  },
  {
    label: 'Toolbox',
    items: [
      { id: 'agents', icon: '🤖', label: 'Agents' },
      { id: 'mcp', icon: '🔌', label: 'MCP Servers' },
      { id: 'skills', icon: '⚡', label: 'Skills' },
      { id: 'commands', icon: '⌘', label: 'Commands' },
      { id: 'hooks', icon: '🪝', label: 'Hooks' },
      { id: 'plugins', icon: '🧩', label: 'Plugins & Marketplaces' },
      { id: 'memory', icon: '🧠', label: 'Memory & CLAUDE.md' },
    ],
  },
]

const ENABLED = new Set(['office'])

export function NavRail({
  collapsed,
  onToggleCollapse,
  activeSection,
  onNavigate,
  onOpenSettings,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  activeSection: string
  onNavigate: (id: string) => void
  onOpenSettings: () => void
}) {
  return (
    <nav className={`nav-rail${collapsed ? ' nav-rail--collapsed' : ''}`}>
      <div className="nav-top">
        <span className="nav-brand">🎮</span>
        <button
          className="nav-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? '☰' : '«'}
        </button>
      </div>

      {GROUPS.map((g) => (
        <div className="nav-group" key={g.label}>
          {!collapsed && <p className="nav-group-label">{g.label}</p>}
          {g.items.map((it) => {
            const enabled = ENABLED.has(it.id)
            const active = enabled && activeSection === it.id
            return (
              <button
                key={it.id}
                className={`nav-item${active ? ' nav-item--active' : ''}${
                  enabled ? '' : ' nav-item--disabled'
                }`}
                onClick={enabled ? () => onNavigate(it.id) : undefined}
                disabled={!enabled}
                title={enabled ? it.label : `${it.label} — coming soon`}
                aria-disabled={!enabled}
              >
                <span className="nav-icon">{it.icon}</span>
                {!collapsed && <span className="nav-label">{it.label}</span>}
                {!collapsed && !enabled && <span className="nav-soon">soon</span>}
              </button>
            )
          })}
        </div>
      ))}

      <div className="nav-group nav-group--bottom">
        <button
          className="nav-item"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <span className="nav-icon">⚙</span>
          {!collapsed && <span className="nav-label">Settings</span>}
        </button>
      </div>
    </nav>
  )
}
