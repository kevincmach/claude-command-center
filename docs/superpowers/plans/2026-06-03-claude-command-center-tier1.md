# Claude Command Center — Tier 1 (The Office) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tier 0 card board with a cozy shared office floor where each live session is a character placed in the room matching its activity, with project-colored rings, context meters, attention glow, and tap-for-details.

**Architecture:** Frontend-only. The backend already tags each `Session` with an `activity`; the React app buckets sessions into activity-rooms via a pure mapping and renders them as gently-animated characters. Still SSE-driven, React built-in state, DOM/CSS (no game engine).

**Tech Stack:** TypeScript · React + Vite · CSS (keyframes) · `node:test` for pure logic.

---

## File Structure

```
src/web/
├── rooms.ts                     # NEW pure: room catalog + activity→room  (tested)
├── projectColor.ts              # NEW pure: project name → stable color    (tested)
├── office.css                   # NEW styles + bob keyframes
├── App.tsx                      # MODIFY: render <Office> instead of <Board>
└── components/
    ├── Office.tsx               # NEW floor: buckets sessions into rooms, legend, detail
    ├── Room.tsx                 # NEW one room: holds characters, glows when needed
    ├── Character.tsx            # NEW one session as a character
    ├── CharacterDetail.tsx      # NEW tap popover
    ├── Board.tsx                # DELETE (replaced by Office)
    ├── ProjectZone.tsx          # DELETE
    └── SessionCard.tsx          # DELETE
test/
├── rooms.test.ts                # NEW
└── projectColor.test.ts         # NEW
```

**Baseline check before starting:** on branch `tier1`, run `npm test` — expect the
existing 31 Tier 0 tests passing. This is the green starting point.

---

## Task 1: Room catalog + activity→room mapping (pure)

**Files:**
- Create: `src/web/rooms.ts`
- Test: `test/rooms.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROOMS, roomForActivity } from '../src/web/rooms.js'
import type { Activity } from '../src/shared/types.js'

test('every activity maps to a room that exists in ROOMS', () => {
  const ids = new Set(ROOMS.map((r) => r.id))
  const activities: Activity[] = [
    'working', 'researching_web', 'reading', 'meeting', 'planning',
    'waiting_permission', 'waiting_question', 'idle', 'done', 'unknown',
  ]
  for (const a of activities) assert.ok(ids.has(roomForActivity(a)), a)
})

test('specific mappings', () => {
  assert.equal(roomForActivity('working'), 'work')
  assert.equal(roomForActivity('researching_web'), 'gym')
  assert.equal(roomForActivity('reading'), 'library')
  assert.equal(roomForActivity('meeting'), 'meeting')
  assert.equal(roomForActivity('waiting_permission'), 'break')
  assert.equal(roomForActivity('waiting_question'), 'break')
  assert.equal(roomForActivity('idle'), 'lounge')
})

test('unknown / future values fall back to lounge', () => {
  assert.equal(roomForActivity('something_new' as Activity), 'lounge')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/rooms.test.ts`
Expected: FAIL — cannot find `../src/web/rooms.js`.

- [ ] **Step 3: Implement `src/web/rooms.ts`**

```ts
import type { Activity } from '../shared/types.js'

export type RoomId = 'work' | 'gym' | 'library' | 'meeting' | 'break' | 'lounge'

export interface RoomDef {
  id: RoomId
  label: string
  emoji: string
  furniture: string
}

export const ROOMS: RoomDef[] = [
  { id: 'work', label: 'Work Pods', emoji: '🖥️', furniture: '🪑' },
  { id: 'gym', label: 'Gym', emoji: '🏋️', furniture: '🏃' },
  { id: 'break', label: 'Break Room', emoji: '🏓', furniture: '🛋️' },
  { id: 'meeting', label: 'Meeting Room', emoji: '🧩', furniture: '📋' },
  { id: 'library', label: 'Library', emoji: '📚', furniture: '🪴' },
  { id: 'lounge', label: 'Lounge', emoji: '☕', furniture: '🛋️' },
]

const MAP: Partial<Record<Activity, RoomId>> = {
  working: 'work',
  researching_web: 'gym',
  reading: 'library',
  meeting: 'meeting',
  waiting_permission: 'break',
  waiting_question: 'break',
  idle: 'lounge',
  done: 'lounge',
  planning: 'lounge',
  unknown: 'lounge',
}

export function roomForActivity(a: Activity): RoomId {
  return MAP[a] ?? 'lounge'
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `node --import tsx --test test/rooms.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/web/rooms.ts test/rooms.test.ts
git commit -m "feat(web): room catalog + activity->room mapping"
```

---

## Task 2: Project color (pure)

**Files:**
- Create: `src/web/projectColor.ts`
- Test: `test/projectColor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectColor } from '../src/web/projectColor.js'

test('deterministic: same name → same color', () => {
  assert.equal(projectColor('AutoFarm'), projectColor('AutoFarm'))
})

test('different names usually differ', () => {
  const a = projectColor('AutoFarm')
  const b = projectColor('GarminFlow')
  assert.notEqual(a, b)
})

test('returns an hsl() string', () => {
  assert.match(projectColor('X'), /^hsl\(/)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/projectColor.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/web/projectColor.ts`**

```ts
// Stable color per project name: hash → hue, fixed saturation/lightness.
export function projectColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360
  }
  return `hsl(${h} 65% 60%)`
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `node --import tsx --test test/projectColor.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/web/projectColor.ts test/projectColor.test.ts
git commit -m "feat(web): stable per-project ring color"
```

---

## Task 3: Office stylesheet

**Files:**
- Create: `src/web/office.css`

- [ ] **Step 1: Create `src/web/office.css`**

```css
.office {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
@media (max-width: 640px) {
  .office { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 380px) {
  .office { grid-template-columns: 1fr; }
}

.room {
  background: rgba(255, 240, 220, 0.04);
  border: 1px solid #4a3a2a;
  border-radius: 10px;
  min-height: 110px;
  padding: 8px;
  position: relative;
}
.room--hot {
  border-color: #ffb84d;
  box-shadow: inset 0 0 14px rgba(255, 184, 77, 0.35);
}
.room-head {
  font-size: 11px;
  color: #caa987;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}
.room-furn { opacity: 0.5; }
.room-count { margin-left: auto; color: #7a6a55; }

.crew {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.char {
  all: unset;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 46px;
  animation: bob 2.4s ease-in-out infinite;
}
.char:nth-child(2) { animation-delay: 0.5s; }
.char:nth-child(3) { animation-delay: 1s; }
.char:nth-child(4) { animation-delay: 1.5s; }
.char--idle { animation: none; opacity: 0.55; }
@keyframes bob {
  50% { transform: translateY(-3px); }
}

.ring {
  position: absolute;
  top: -2px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--ring, #888);
  opacity: 0.9;
}
.body { font-size: 24px; line-height: 1; }
.nameplate {
  font-size: 8px;
  color: #bbab95;
  max-width: 46px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}
.meter {
  width: 26px;
  height: 3px;
  background: #0008;
  border-radius: 2px;
  margin-top: 2px;
  overflow: hidden;
}
.meter > i {
  display: block;
  height: 100%;
  background: #4aa3ff;
}
.bubble {
  position: absolute;
  top: -16px;
  font-size: 13px;
  animation: bob 1.1s ease-in-out infinite;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: #999;
  margin-top: 12px;
}
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-dot { width: 9px; height: 9px; border-radius: 50%; }

.empty { opacity: 0.6; margin-top: 24px; }

.detail-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.detail {
  background: #1c1822;
  border: 1px solid #4a3a2a;
  border-radius: 12px;
  padding: 16px 18px;
  max-width: 320px;
  width: 100%;
}
.detail h3 { margin: 0 0 8px; }
.detail-row { margin: 4px 0; font-size: 13px; }
.detail-id { font-size: 10px; color: #666; word-break: break-all; margin-top: 8px; }
.detail-close {
  margin-top: 12px;
  background: #2c2536;
  color: #eee;
  border: 1px solid #443c52;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/office.css
git commit -m "feat(web): cozy office stylesheet + bob animation"
```

---

## Task 4: Character component

**Files:**
- Create: `src/web/components/Character.tsx`

- [ ] **Step 1: Create `src/web/components/Character.tsx`**

```tsx
import type { CSSProperties } from 'react'
import type { Session } from '../../shared/types.js'
import { projectColor } from '../projectColor.js'

const IDLE: ReadonlySet<string> = new Set([
  'idle', 'done', 'unknown', 'planning',
])

export function Character({
  s,
  onSelect,
}: {
  s: Session
  onSelect: (s: Session) => void
}) {
  const waiting =
    s.activity === 'waiting_permission' || s.activity === 'waiting_question'
  const idle = IDLE.has(s.activity)
  const ringStyle = { '--ring': projectColor(s.project.name) } as CSSProperties

  return (
    <button
      className={`char${idle ? ' char--idle' : ''}`}
      style={ringStyle}
      onClick={() => onSelect(s)}
      title={s.title ?? s.sessionId}
    >
      {waiting && <span className="bubble">❗</span>}
      <span className="ring" />
      <span className="body">{idle ? '😴' : '🤖'}</span>
      <span className="nameplate">{s.title ?? s.project.name}</span>
      <span className="meter">
        <i style={{ width: `${Math.min(s.context.pct, 100)}%` }} />
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Character.tsx
git commit -m "feat(web): Character — bob, project ring, meter, attention bubble"
```

---

## Task 5: Character detail popover

**Files:**
- Create: `src/web/components/CharacterDetail.tsx`

- [ ] **Step 1: Create `src/web/components/CharacterDetail.tsx`**

```tsx
import type { Session } from '../../shared/types.js'

export function CharacterDetail({
  s,
  onClose,
}: {
  s: Session
  onClose: () => void
}) {
  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h3>{s.title ?? s.sessionId.slice(0, 8)}</h3>
        <p className="detail-row">📁 {s.project.name}</p>
        <p className="detail-row">⚙️ {s.activity}</p>
        <p className="detail-row">🧠 {s.model ?? '—'}</p>
        <p className="detail-row">
          📊 {s.context.pct}% context · ${s.cost.usd.toFixed(2)}
        </p>
        {s.subAgents > 0 && (
          <p className="detail-row">🐤 {s.subAgents} sub-agent(s)</p>
        )}
        <p className="detail-id">{s.sessionId}</p>
        <button className="detail-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/CharacterDetail.tsx
git commit -m "feat(web): CharacterDetail tap popover"
```

---

## Task 6: Room component

**Files:**
- Create: `src/web/components/Room.tsx`

- [ ] **Step 1: Create `src/web/components/Room.tsx`**

```tsx
import type { Session } from '../../shared/types.js'
import type { RoomDef } from '../rooms.js'
import { Character } from './Character.js'

export function Room({
  room,
  sessions,
  onSelect,
}: {
  room: RoomDef
  sessions: Session[]
  onSelect: (s: Session) => void
}) {
  const hot = sessions.some(
    (s) =>
      s.activity === 'waiting_permission' || s.activity === 'waiting_question',
  )
  return (
    <section className={`room${hot ? ' room--hot' : ''}`}>
      <header className="room-head">
        <span className="room-furn">{room.furniture}</span>
        {room.emoji} {room.label}
        <span className="room-count">{sessions.length}</span>
      </header>
      <div className="crew">
        {sessions.map((s) => (
          <Character key={s.sessionId} s={s} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Room.tsx
git commit -m "feat(web): Room — holds characters, glows when attention needed"
```

---

## Task 7: Office component (floor + legend + selection)

**Files:**
- Create: `src/web/components/Office.tsx`

- [ ] **Step 1: Create `src/web/components/Office.tsx`**

```tsx
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
            <span className="legend-dot" style={{ background: projectColor(p) }} />
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Office.tsx
git commit -m "feat(web): Office floor — bucket sessions into rooms, legend, detail"
```

---

## Task 8: Wire App to the Office; remove old board

**Files:**
- Modify: `src/web/App.tsx`
- Modify: `src/web/main.tsx` (import the stylesheet)
- Delete: `src/web/components/Board.tsx`, `ProjectZone.tsx`, `SessionCard.tsx`

- [ ] **Step 1: Replace `src/web/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '../shared/types.js'
import { subscribe } from './api.js'
import { Office } from './components/Office.js'

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])

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
      <h1>🎮 Claude Command Center</h1>
      {needsAttention.length > 0 && (
        <div style={{ background: '#5c1111', padding: 10, borderRadius: 8 }}>
          🔔 {needsAttention.length} session(s) need you
        </div>
      )}
      <Office sessions={sessions} />
    </div>
  )
}
```

- [ ] **Step 2: Import the stylesheet in `src/web/main.tsx`**

Replace the file contents with:
```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './office.css'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 3: Delete the old board components**

```bash
git rm src/web/components/Board.tsx src/web/components/ProjectZone.tsx src/web/components/SessionCard.tsx
```

- [ ] **Step 4: Type-check + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; tests pass (31 Tier 0 + rooms + projectColor = 37).

- [ ] **Step 5: Commit**

```bash
git add src/web/App.tsx src/web/main.tsx
git commit -m "feat(web): render Office, retire the card board"
```

---

## Task 9: Build + visual verification

**Files:** none (verification)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: builds clean; `dist/public/` regenerated.

- [ ] **Step 2: Run against the fixture and check the office**

Run: `node dist/server/index.js --claude-home test/fixtures/claude-home --port 4323 --vault /tmp/ccc-t1-vault`
Open `http://localhost:4323`. Expected: two characters — "Demo" placed by its
activity, "Other" in the **Break Room** which glows (it's `waiting_permission`),
the attention banner shows "1 session(s) need you", and a project-color legend at
the bottom. Tap a character → detail popover. Ctrl-C to stop.

- [ ] **Step 3: Run against real `~/.claude` on the LAN and check on phone**

Run: `node dist/server/index.js --lan --port 4317 --vault /tmp/ClaudeVault-live`
Open `http://<your-lan-ip>:4317` on the phone. Expected: your live sessions
distributed across rooms by activity, idle ones dozing in the Lounge, any waiting
session glowing in the Break Room, gentle bob on active characters.

- [ ] **Step 4: Final commit (if any tweaks were made during verification)**

```bash
git add -A
git commit -m "chore: Tier 1 visual verification tweaks" --allow-empty
```

---

## Self-Review (completed)

- **Spec coverage:** one shared office ✓ (Office), activity→room map ✓ (rooms.ts,
  all 10 activity values + lounge default), project ring ✓ (projectColor +
  Character), context meter ✓, attention glow + bubble + banner ✓ (Room/Character/
  App), sub-agents in detail ✓, idle dimmed/still ✓, tap-for-detail ✓
  (CharacterDetail), responsive grid ✓ (office.css breakpoints), empty state ✓,
  legend ✓. Unit tests for the two pure modules ✓; visual verification steps ✓.
- **Placeholder scan:** none — every step has full code or an exact command.
- **Type consistency:** `RoomId`, `RoomDef`, `ROOMS`, `roomForActivity`,
  `projectColor`, `Session`, the `Character`/`Room`/`Office`/`CharacterDetail`
  prop shapes, and `onSelect(s: Session)` / `setSelectedId(string)` all match
  across tasks. `Session` is reused unchanged from Tier 0 (no backend edits).
- **Deferred (per spec):** pixel sprites + walking (Tier 2), dedicated planning
  room (Tier 2), control (Tier 3).
```
