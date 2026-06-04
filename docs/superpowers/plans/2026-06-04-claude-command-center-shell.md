# Command-Center Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single full-screen office + pop-over modal with a 3-column app shell (collapsible nav rail · office · collapsible right panel with Inspector + Activity tabs), responsive to a stacked mobile layout.

**Architecture:** A frontend-only restructure — no server changes. Selection state is lifted out of `Office` up to a new `AppShell`; `CharacterDetail`'s body is re-parented from a modal into a new `Inspector` tab; a new `ActivityFeed` tab is fed by a pure, unit-tested `appendEvent` reducer that consumes the SSE `onChange` events the app already receives. Office and Settings are live; every other nav item is a disabled "soon" stub.

**Tech Stack:** React 18 + TypeScript (Vite), `node:test` for the one pure unit, plain CSS (`office.css`). Verification = `npm test` + `npm run build` (tsc + vite) + Kevin's visual smoke test, consistent with Tiers 1–3a.

---

## File Structure

**New:**
- `src/web/activityFeed.ts` — pure reducer `appendEvent(list, ev, cap): FeedItem[]` + `FeedItem`/`FeedKind` types. The only unit-tested piece.
- `test/activityFeed.test.ts` — `node:test` coverage for the reducer.
- `src/web/components/Inspector.tsx` — presentational detail body extracted from `CharacterDetail` (no backdrop/modal/close). Empty state when nothing selected.
- `src/web/components/ActivityFeed.tsx` — renders the accumulated feed list (newest-first, color-coded by project). Empty state when no events.
- `src/web/components/NavRail.tsx` — grouped nav (Live / Knowledge / Toolbox / Settings). Office + Settings active; the rest disabled "soon". Collapsible icon-only ⇄ icon+label.
- `src/web/components/RightPanel.tsx` — tab strip (Inspector / Activity) + collapse toggle; renders the active tab.
- `src/web/components/AppShell.tsx` — 3-column CSS-grid layout. Owns nav-collapsed, panel-collapsed, active tab, and the Settings overlay. Wires `NavRail`, the center office column, and `RightPanel`.

**Modified:**
- `src/web/App.tsx` — becomes thin: holds `sessions`, `selectedSessionId`, and the capped `activity` list; its `subscribe()` callback now ALSO feeds `appendEvent`. Renders `AppShell`.
- `src/web/components/Office.tsx` — presentational: accepts `sessions`, `selectedId`, `onSelect` props; drops internal `selectedId` state and the `CharacterDetail` modal.
- `src/web/components/Room.tsx` — threads a `selectedId` prop to mark the selected character.
- `src/web/components/Character.tsx` — accepts a `selected` boolean → `char--selected` highlight (so selection is visible now that the modal is gone).
- `src/web/office.css` — add shell grid, nav rail, right panel/tabs, collapse, feed, inspector, and responsive breakpoints; keep all existing office/character styles.

**Removed:**
- `src/web/components/CharacterDetail.tsx` — its body moves to `Inspector.tsx`; the modal is gone.

---

## Task 1: Pure activity-feed reducer (`activityFeed.ts`)

**Files:**
- Create: `src/web/activityFeed.ts`
- Test: `test/activityFeed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/activityFeed.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendEvent, type FeedItem } from '../src/web/activityFeed.js'
import type { Session } from '../src/shared/types.js'

// Minimal Session factory — only the fields the reducer reads matter; the rest
// satisfy the type. Vary sessionId/updatedAt/activity per test.
function sess(over: Partial<Session>): Session {
  return {
    sessionId: 'sess-1',
    pid: 1,
    alive: true,
    project: { name: 'demo', cwd: '/demo' },
    status: 'busy',
    activity: 'working',
    waitingFor: null,
    model: null,
    version: null,
    entrypoint: null,
    title: null,
    context: { tokens: 0, limit: 0, pct: 0 },
    cost: { usd: 0 },
    subAgents: 0,
    queuedCount: 0,
    permissionMode: null,
    startedAt: 0,
    updatedAt: 0,
    ...over,
  }
}

test('appends newest-first', () => {
  const a = appendEvent([], { kind: 'created', s: sess({ sessionId: 'a', updatedAt: 1 }) }, 200)
  const b = appendEvent(a, { kind: 'created', s: sess({ sessionId: 'b', updatedAt: 2 }) }, 200)
  assert.equal(b[0].sessionId, 'b')
  assert.equal(b[1].sessionId, 'a')
})

test('caps at the limit, dropping the oldest', () => {
  let list: FeedItem[] = []
  for (let i = 1; i <= 5; i++) {
    list = appendEvent(list, { kind: 'updated', s: sess({ sessionId: `s${i}`, updatedAt: i }) }, 2)
  }
  assert.equal(list.length, 2)
  assert.equal(list[0].sessionId, 's5')
  assert.equal(list[1].sessionId, 's4')
})

test('maps created → appeared', () => {
  const [item] = appendEvent([], { kind: 'created', s: sess({}) }, 10)
  assert.equal(item.label, 'appeared')
})

test('maps ended → ended', () => {
  const [item] = appendEvent([], { kind: 'ended', s: sess({}) }, 10)
  assert.equal(item.label, 'ended')
})

test('maps updated → the activity', () => {
  const [item] = appendEvent([], { kind: 'updated', s: sess({ activity: 'planning' }) }, 10)
  assert.equal(item.label, '→ planning')
})

test('carries project name and a stable id', () => {
  const [item] = appendEvent([], { kind: 'created', s: sess({ sessionId: 'x', updatedAt: 7, project: { name: 'acme', cwd: '/acme' } }) }, 10)
  assert.equal(item.project, 'acme')
  assert.equal(item.id, 'x:7:created')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/web/activityFeed.js'` (module not yet created).

- [ ] **Step 3: Write the minimal implementation**

Create `src/web/activityFeed.ts`:

```ts
import type { Session } from '../shared/types.js'

export type FeedKind = 'created' | 'updated' | 'ended'

export interface FeedItem {
  id: string
  sessionId: string
  project: string
  kind: FeedKind
  label: string
  at: number
}

/**
 * Turn an SSE change into a capped, newest-first feed list.
 * Pure: no Date/random — `id` is derived from sessionId + updatedAt + kind.
 */
export function appendEvent(
  list: FeedItem[],
  ev: { kind: FeedKind; s: Session },
  cap: number,
): FeedItem[] {
  const { kind, s } = ev
  const label =
    kind === 'created'
      ? 'appeared'
      : kind === 'ended'
        ? 'ended'
        : `→ ${s.activity}`
  const item: FeedItem = {
    id: `${s.sessionId}:${s.updatedAt}:${kind}`,
    sessionId: s.sessionId,
    project: s.project.name,
    kind,
    label,
    at: s.updatedAt,
  }
  return [item, ...list].slice(0, cap)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `activityFeed` tests green (plus the existing suite still green).

- [ ] **Step 5: Commit**

```bash
git add src/web/activityFeed.ts test/activityFeed.test.ts
git commit -m "feat(shell): pure appendEvent reducer for the Activity feed"
```

---

## Task 2: Inspector component (extract from CharacterDetail)

**Files:**
- Create: `src/web/components/Inspector.tsx`

This is a new, currently-unused file — the build stays green. It lifts the body of `CharacterDetail` verbatim, minus the modal backdrop, `onClose`, and the close button, and adds a null/empty state.

- [ ] **Step 1: Create the Inspector component**

Create `src/web/components/Inspector.tsx`:

```tsx
import { useState } from 'react'
import type { Session } from '../../shared/types.js'
import { agentName } from '../agentName.js'
import { modelLabel, permissionBadge } from '../badges.js'
import { summarizeSession } from '../api.js'

// Presentational detail body lifted out of the old CharacterDetail modal.
// Render with `key={selected?.sessionId}` so summarize state resets on change.
export function Inspector({ s }: { s: Session | null }) {
  const [sum, setSum] = useState<{
    state: 'idle' | 'pending' | 'done' | 'error'
    tldr?: string
    path?: string
    error?: string
  }>({ state: 'idle' })

  if (!s) {
    return <p className="inspector-empty">Select a coworker to inspect them.</p>
  }

  async function onSummarize() {
    setSum({ state: 'pending' })
    try {
      const r = await summarizeSession(s!.sessionId)
      if (r.status === 'disabled') {
        setSum({ state: 'error', error: 'summaries are off — enable in ⚙' })
      } else if (r.ok && r.status === 'written') {
        setSum({ state: 'done', tldr: r.tldr, path: r.path })
      } else if (r.ok) {
        setSum({ state: 'done' }) // skipped (e.g. nothing to summarize)
      } else {
        setSum({ state: 'error', error: r.error })
      }
    } catch (e) {
      setSum({ state: 'error', error: String(e) })
    }
  }

  return (
    <div className="inspector">
      <h3>🤖 {agentName(s.sessionId)}</h3>
      <p className="detail-row">✏️ {s.title ?? '—'}</p>
      <p className="detail-row">📁 {s.project.name}</p>
      <p className="detail-row">⚙️ {s.activity}</p>
      <p className="detail-row">🧠 {modelLabel(s.model)}</p>
      {s.permissionMode && s.permissionMode !== 'normal' && (
        <p className="detail-row">
          {permissionBadge(s.permissionMode)?.icon ?? '🔓'} {s.permissionMode}
        </p>
      )}
      <p className="detail-row">
        📊 {s.context.pct}% context · ${s.cost.usd.toFixed(2)}
      </p>
      {s.subAgents > 0 && (
        <p className="detail-row">🐤 {s.subAgents} sub-agent(s)</p>
      )}
      {s.queuedCount > 0 && (
        <p className="detail-row">📥 {s.queuedCount} queued</p>
      )}
      <p className="detail-id">{s.sessionId}</p>
      <button
        className="detail-summarize"
        onClick={onSummarize}
        disabled={sum.state === 'pending'}
      >
        {sum.state === 'pending' ? '… summarizing' : '↻ Summarize'}
      </button>
      {sum.state === 'done' && (
        <>
          <p className="detail-row">📝 {sum.tldr ?? 'summary written'}</p>
          <p className="detail-row">
            <a
              className="vault-link"
              href={`/api/sessions/${s.sessionId}/page`}
              target="_blank"
              rel="noreferrer"
            >
              open summary ↗
            </a>
            {sum.path && <span className="vault-path"> · {sum.path}</span>}
          </p>
        </>
      )}
      {sum.state === 'error' && <p className="detail-row">⚠ {sum.error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: PASS — tsc + vite build succeed (new file compiles; `s!` is safe because of the early `if (!s) return`).

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Inspector.tsx
git commit -m "feat(shell): Inspector component extracted from CharacterDetail body"
```

---

## Task 3: ActivityFeed component

**Files:**
- Create: `src/web/components/ActivityFeed.tsx`

- [ ] **Step 1: Create the ActivityFeed component**

Create `src/web/components/ActivityFeed.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: PASS — new file compiles, imports resolve.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/ActivityFeed.tsx
git commit -m "feat(shell): ActivityFeed component (project-colored event list)"
```

---

## Task 4: NavRail component

**Files:**
- Create: `src/web/components/NavRail.tsx`

The IA (from the spec): Live → Office (active); Knowledge → Notes, Analytics (soon); Toolbox → Agents, MCP Servers, Skills, Commands, Hooks, Plugins & Marketplaces, Memory & CLAUDE.md (soon); Settings (active, rendered at the bottom).

- [ ] **Step 1: Create the NavRail component**

Create `src/web/components/NavRail.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/NavRail.tsx
git commit -m "feat(shell): NavRail with grouped IA and disabled 'soon' stubs"
```

---

## Task 5: RightPanel component (tabs + collapse)

**Files:**
- Create: `src/web/components/RightPanel.tsx`

Depends on `Inspector` (Task 2) and `ActivityFeed` (Task 3).

- [ ] **Step 1: Create the RightPanel component**

Create `src/web/components/RightPanel.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: PASS — `Inspector` and `ActivityFeed` imports resolve; `PanelTab` exported for the shell.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/RightPanel.tsx
git commit -m "feat(shell): RightPanel with Inspector/Activity tabs and collapse"
```

---

## Task 6: Mark the selected character (Office highlight plumbing)

**Files:**
- Modify: `src/web/components/Character.tsx`
- Modify: `src/web/components/Room.tsx`

The modal is going away, so the selected coworker must be visible in the office. Thread a `selected` flag down to `Character`. This task does NOT yet change `Office`'s public signature (that happens in Task 7), so it stays build-green: `Room`/`Character` gain a new **optional** prop that the current `Office` simply doesn't pass.

- [ ] **Step 1: Add the `selected` prop to Character**

In `src/web/components/Character.tsx`, change the props signature and the root `className`.

Replace:

```tsx
export function Character({
  s,
  onSelect,
}: {
  s: Session
  onSelect: (s: Session) => void
}) {
```

with:

```tsx
export function Character({
  s,
  onSelect,
  selected = false,
}: {
  s: Session
  onSelect: (s: Session) => void
  selected?: boolean
}) {
```

Replace:

```tsx
    <button
      className={`char${idle ? ' char--idle' : ''}`}
      style={ringStyle}
      onClick={() => onSelect(s)}
    >
```

with:

```tsx
    <button
      className={`char${idle ? ' char--idle' : ''}${
        selected ? ' char--selected' : ''
      }`}
      style={ringStyle}
      onClick={() => onSelect(s)}
    >
```

- [ ] **Step 2: Thread `selectedId` through Room**

In `src/web/components/Room.tsx`, add the optional prop and pass `selected` to each `Character`.

Replace:

```tsx
export function Room({
  room,
  sessions,
  onSelect,
}: {
  room: RoomDef
  sessions: Session[]
  onSelect: (s: Session) => void
}) {
```

with:

```tsx
export function Room({
  room,
  sessions,
  onSelect,
  selectedId = null,
}: {
  room: RoomDef
  sessions: Session[]
  onSelect: (s: Session) => void
  selectedId?: string | null
}) {
```

Replace:

```tsx
          {sessions.map((s) => (
            <Character key={s.sessionId} s={s} onSelect={onSelect} />
          ))}
```

with:

```tsx
          {sessions.map((s) => (
            <Character
              key={s.sessionId}
              s={s}
              onSelect={onSelect}
              selected={s.sessionId === selectedId}
            />
          ))}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: PASS — new props are optional, so the existing `Office` (which doesn't pass them) still compiles.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/Character.tsx src/web/components/Room.tsx
git commit -m "feat(shell): mark the selected coworker in the office grid"
```

---

## Task 7: Assemble the shell (Office presentational + AppShell + App + remove CharacterDetail)

**Files:**
- Modify: `src/web/components/Office.tsx`
- Create: `src/web/components/AppShell.tsx`
- Modify: `src/web/App.tsx`
- Delete: `src/web/components/CharacterDetail.tsx`

These four changes are mutually dependent (Office's new signature, the shell that consumes it, the thin App that renders the shell, and the now-orphaned modal). They land in **one commit** so the build is green before and after.

- [ ] **Step 1: Make Office presentational**

Replace the entire contents of `src/web/components/Office.tsx` with:

```tsx
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
```

- [ ] **Step 2: Create AppShell**

Create `src/web/components/AppShell.tsx`:

```tsx
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
```

- [ ] **Step 3: Make App thin and feed the activity reducer**

Replace the entire contents of `src/web/App.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '../shared/types.js'
import { subscribe } from './api.js'
import { appendEvent, type FeedItem } from './activityFeed.js'
import { AppShell } from './components/AppShell.js'

const ACTIVITY_CAP = 200

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [activity, setActivity] = useState<FeedItem[]>([])

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
        setActivity((prev) =>
          appendEvent(prev, { kind: kind as FeedItem['kind'], s }, ACTIVITY_CAP),
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
```

- [ ] **Step 4: Delete the orphaned modal**

```bash
git rm src/web/components/CharacterDetail.tsx
```

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`
Expected: PASS — no dangling import of `CharacterDetail`; `Office`/`AppShell`/`App` typecheck. (The cast `kind as FeedItem['kind']` is sound: `subscribe` only emits `created`/`updated`/`ended`.)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests + the `activityFeed` tests are green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shell): lift selection into AppShell, re-parent detail into Inspector, drop modal"
```

---

## Task 8: Shell styling + responsive layout (`office.css`)

**Files:**
- Modify: `src/web/office.css`

Append the shell styles. Keep every existing rule (office grid, rooms, characters, `.detail-*`, `.setting-*`, `.gear` — `.detail-row`/`.detail-id`/`.detail-summarize`/`.vault-link` are still used by `Inspector` and `SettingsPanel`). The old `<body>` had `padding: 16` from App's inline style which is now gone; the shell owns full-viewport layout.

- [ ] **Step 1: Append the shell layout styles**

Add to the end of `src/web/office.css`:

```css
/* ─────────────────────────  App shell  ───────────────────────── */
:root {
  --nav-w: 200px;
  --nav-w-collapsed: 56px;
  --panel-w: 300px;
  --panel-w-collapsed: 28px;
}

body {
  margin: 0;
  background: #0f0f12;
  color: #eee;
  font-family: system-ui;
}

.shell {
  display: grid;
  grid-template-columns: var(--nav-w) 1fr var(--panel-w);
  min-height: 100vh;
}
.shell--nav-collapsed {
  grid-template-columns: var(--nav-w-collapsed) 1fr var(--panel-w);
}
.shell--panel-collapsed {
  grid-template-columns: var(--nav-w) 1fr var(--panel-w-collapsed);
}
.shell--nav-collapsed.shell--panel-collapsed {
  grid-template-columns: var(--nav-w-collapsed) 1fr var(--panel-w-collapsed);
}

.center-col {
  padding: 16px;
  min-width: 0; /* let the office grid shrink instead of overflowing */
  overflow-y: auto;
}
.shell-title {
  margin: 0 0 12px;
  font-size: 20px;
}
.attention {
  background: #5c1111;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 12px;
}

/* ─────────────────────────  Nav rail  ───────────────────────── */
.nav-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 8px;
  background: #16161b;
  border-right: 1px solid #26262e;
}
.nav-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.nav-rail--collapsed .nav-top {
  flex-direction: column;
  gap: 6px;
}
.nav-brand {
  font-size: 20px;
}
.nav-collapse-btn {
  background: none;
  border: none;
  color: #9a8d78;
  cursor: pointer;
  font-size: 14px;
}
.nav-collapse-btn:hover {
  color: #eee;
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-group--bottom {
  margin-top: auto;
}
.nav-group-label {
  margin: 8px 6px 2px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6a6356;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  color: #d8d2c6;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.nav-item:hover:not(.nav-item--disabled) {
  background: #23232b;
}
.nav-item--active {
  background: #2a2a36;
  color: #fff;
}
.nav-item--disabled {
  color: #5a5448;
  cursor: default;
}
.nav-icon {
  width: 20px;
  text-align: center;
}
.nav-label {
  flex: 1;
}
.nav-soon {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 8px;
  background: #2a2a32;
  color: #8a8270;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nav-rail--collapsed .nav-item {
  justify-content: center;
  padding: 7px 0;
}

/* ─────────────────────────  Right panel  ───────────────────────── */
.right-panel {
  display: flex;
  flex-direction: column;
  background: #16161b;
  border-left: 1px solid #26262e;
  min-width: 0;
}
.panel-edge {
  display: flex;
  justify-content: center;
  padding-top: 12px;
  background: #16161b;
  border-left: 1px solid #26262e;
}
.panel-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid #26262e;
}
.panel-tab {
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: none;
  color: #9a8d78;
  font-size: 13px;
  cursor: pointer;
}
.panel-tab:hover {
  color: #eee;
}
.panel-tab--active {
  background: #2a2a36;
  color: #fff;
}
.panel-collapse-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: #9a8d78;
  font-size: 16px;
  cursor: pointer;
}
.panel-collapse-btn:hover {
  color: #eee;
}
.panel-body {
  padding: 12px;
  overflow-y: auto;
}

/* ─────────────────────────  Inspector  ───────────────────────── */
.inspector h3 {
  margin: 0 0 8px;
}
.inspector-empty {
  opacity: 0.6;
  font-size: 13px;
}

/* ─────────────────────────  Activity feed  ───────────────────────── */
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.feed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.feed-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.feed-name {
  font-weight: 600;
}
.feed-label {
  color: #9a8d78;
}
.feed-empty {
  opacity: 0.6;
  font-size: 13px;
}

/* ─────────────────────────  Selected coworker  ───────────────────────── */
.char--selected {
  outline: 2px solid var(--ring, #ffb84d);
  outline-offset: 3px;
  border-radius: 8px;
}

/* ─────────────────────────  Responsive: stack under ~900px  ───────────────────────── */
@media (max-width: 900px) {
  .shell,
  .shell--nav-collapsed,
  .shell--panel-collapsed,
  .shell--nav-collapsed.shell--panel-collapsed {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }
  .nav-rail {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    border-right: none;
    border-bottom: 1px solid #26262e;
    gap: 4px;
  }
  .nav-top {
    margin-bottom: 0;
  }
  .nav-group {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .nav-group--bottom {
    margin-top: 0;
    margin-left: auto;
  }
  .nav-group-label {
    display: none;
  }
  /* Right panel becomes a bottom sheet. */
  .right-panel {
    border-left: none;
    border-top: 1px solid #26262e;
    max-height: 45vh;
  }
  .panel-edge {
    border-left: none;
    border-top: 1px solid #26262e;
    justify-content: flex-start;
    padding: 8px 12px;
  }
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: PASS — CSS is bundled by Vite; no TS impact.

- [ ] **Step 3: Visual smoke test (Kevin, on phone + desktop)**

Run: `npm run dev` and open the LAN URL.
Check:
- Desktop ≥900px: three columns (nav · office · panel). Tap a coworker → it gets the selected outline AND the Inspector tab shows their detail. Switch to Activity → events stream in newest-first, color-coded by project. ↻ Summarize still works and the "open summary ↗" link opens.
- Collapse the nav (« / ☰) → icon-only rail. Collapse the panel (›) → thin edge with a ‹ expand button.
- Disabled nav items (Notes, Analytics, Toolbox/*) are non-interactive and show a "soon" pill + "coming soon" tooltip.
- ⚙ Settings opens the existing overlay; the summaries toggle + view selector still work.
- Mobile <900px: columns stack — nav as a top bar, office below, panel as a bottom sheet.

- [ ] **Step 4: Commit**

```bash
git add src/web/office.css
git commit -m "feat(shell): 3-column grid, nav rail, right panel, feed, responsive stack"
```

---

## Task 9: Link the plan from the spec & push the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-06-04-claude-command-center-shell-design.md`

- [ ] **Step 1: Add a plan link under the spec header**

In `docs/superpowers/specs/2026-06-04-claude-command-center-shell-design.md`, after the `**Parent:**` line (line 5), add:

```markdown
**Plan:** [2026-06-04-claude-command-center-shell.md](../plans/2026-06-04-claude-command-center-shell.md)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-04-claude-command-center-shell-design.md
git commit -m "docs(shell): link implementation plan from the design spec"
```

- [ ] **Step 3: Final verification before pushing**

Run: `npm test && npm run build`
Expected: PASS — both green. (Evidence before claiming done.)

- [ ] **Step 4: Push and open the PR (do NOT merge — Kevin smoke-tests first)**

```bash
git push -u origin tier-shell
gh pr create --base main --head tier-shell \
  --title "Tier: Command-Center app shell (nav · office · Inspector/Activity panel)" \
  --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-06-04-claude-command-center-shell-design.md.

3-column app shell: collapsible nav rail · office · collapsible right panel with
Inspector + Activity tabs. Responsive — columns stack under ~900px (nav top bar,
panel bottom sheet). Office + Settings are live; all other nav items are disabled
"soon" stubs.

Frontend-only — no server changes:
- Selection lifted out of Office up to AppShell; Office is now presentational.
- CharacterDetail's body re-parented into a new Inspector tab (modal removed).
- New ActivityFeed tab fed by the existing SSE onChange stream via a pure,
  unit-tested appendEvent reducer (capped, newest-first).

Verification: `npm test` (incl. new activityFeed tests) + `npm run build` green;
desktop 3-col / collapse / mobile stack pending Kevin's visual smoke test.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (performed against the spec)

- **Layout (3 cols, both sides collapsible, mobile stack):** Tasks 7–8 (`AppShell` grid + `office.css` `@media (max-width: 900px)`). ✓
- **Right panel tabbed (Inspector + Activity), tap focuses Inspector, summary inline:** Tasks 2, 3, 5, 7 (`handleSelect` sets `tab='inspector'`; `Inspector` keeps the inline `↻ Summarize` + open-summary link). ✓
- **Lean: only Office + Settings live, rest disabled "soon":** Task 4 (`ENABLED = {office}`, disabled stubs with "soon" pill + "coming soon" title/aria). Settings opens as overlay. ✓
- **Backend unchanged:** No `src/server/**` files touched; Inspector reuses session data, Activity reuses SSE, summary route unchanged. ✓
- **Lift selection / re-parent detail:** Task 7 (App holds `selectedSessionId`; `AppShell` re-resolves `selected`; `Office` presentational; `CharacterDetail` removed). ✓
- **ActivityFeed pure reducer unit-tested:** Task 1 (`node:test`: newest-first; cap; created→appeared, updated→→activity, ended→ended). ✓
- **Error/edge cases:** no sessions → office empty state (Office) + "Select a coworker" (Inspector) + "No activity yet." (ActivityFeed); selected ends → Inspector auto-clears via live re-resolve; activity capped at 200; disabled nav announces "coming soon". ✓ (Tasks 4, 7)
- **Nav IA exact:** Live/Knowledge/Toolbox/Settings groups with the spec's icons & labels. ✓ (Task 4)
- **Placeholder scan:** none — every code step shows complete content.
- **Type consistency:** `FeedItem`/`FeedKind` (Task 1) used identically in ActivityFeed/RightPanel/App; `PanelTab` defined in RightPanel and imported by AppShell; `appendEvent(list, ev, cap)` signature consistent across reducer, test, and App.
