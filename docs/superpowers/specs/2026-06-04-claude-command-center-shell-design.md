# Command-Center Shell — Design Spec

**Project:** Claude Command Center
**Status:** Approved design — ready for implementation plan (2026-06-04)
**Parent:** promotes the parked **"Navigation & Management system"** roadmap item into a real tier.

## Goal

Replace the single full-screen office + pop-over modal with a proper **app shell**: a
collapsible left **nav rail**, the **office** in the center, and a collapsible right
**panel** with tabs — **Inspector** (the selected coworker's detail + summary, inline
instead of a modal) and **Activity** (a live event feed). The nav exposes the whole
product vision (Office now; Notes, Analytics, and a Claude "Toolbox" as later tiers).

## Decisions locked during brainstorming

- **Layout:** 3 columns — `nav · office · right panel`. Both side columns collapsible.
  Mobile: columns stack (office first; nav as a top bar / hamburger; right panel slides
  up from the bottom). [Kevin — chose layout "B"]
- **Right panel:** **tabbed** — *Inspector* (selected coworker) + *Activity* (live log).
  Tapping a coworker focuses Inspector. The summary opens **inline** here (this was the
  original ask), not in a modal or new tab. [Kevin — chose "tabbed"]
- **This build is lean:** ship the shell + Office + Settings. Every other nav item is a
  disabled **"soon"** stub. Each becomes its own later tier. [Kevin]
- **Backend unchanged:** Inspector reuses existing session data, Activity reuses the SSE
  events the client already receives, the summary page route already exists.

## Navigation IA (locked — structure now, sections built later)

```
🎮 Command Center
  LIVE        🏢 Office                         ← built now
  KNOWLEDGE   🗒 Notes · 📊 Analytics            ← soon (later tiers)
  TOOLBOX     🤖 Agents · 🔌 MCP Servers ·
              ⚡ Skills · ⌘ Commands · 🪝 Hooks ·
              🧩 Plugins & Marketplaces · 🧠 Memory & CLAUDE.md   ← soon (later tiers)
  —           ⚙ Settings                         ← built now (grows over time)
```

- **Toolbox** sections are each a read-only inventory of the user's Claude config with a
  **Global / Local** toggle (e.g. `~/.claude/agents` + project `.claude/agents` + plugins).
- **Output styles** and **Permissions** are configured under **Settings**, not as Toolbox
  sections. Settings also keeps the existing summaries on/off toggle + summary view.

## Architecture

A **frontend restructure** — no server changes. The current `Office` owns the selected
session and renders a `CharacterDetail` modal; we **lift selection up** to the shell so
the right panel can show it, and **re-parent** the detail content from a modal into the
Inspector tab. The Activity tab adds a *second consumer* to the SSE subscription the app
already has.

## Components (isolated)

- **`AppShell.tsx`** *(new)* — the 3-column CSS-grid layout. Owns nav-collapsed and
  panel-collapsed state. Renders `NavRail`, the active center section, and `RightPanel`.
  Responsible for responsive stacking.
- **`NavRail.tsx`** *(new)* — grouped nav (Live / Knowledge / Toolbox / Settings).
  `🏢 Office` and `⚙ Settings` are active; all others render disabled with a "soon" pill.
  Collapsible: icon-only ⇄ icon+label. Emits `onNavigate(section)`.
- **`RightPanel.tsx`** *(new)* — tab strip (`Inspector` / `Activity`) + collapse toggle.
  Renders the active tab's content.
- **`Inspector.tsx`** *(new, extracted)* — the presentational detail body lifted out of
  `CharacterDetail` (title / project / model / mode / sub-agents / queued / context+cost /
  ↻ Summarize + open-summary link). No backdrop, no modal. Shows an empty state ("select a
  coworker") when nothing is selected.
- **`ActivityFeed.tsx`** *(new)* — renders the accumulated event list (newest first):
  `<time> <name> appeared | → <activity> | ended`, color-coded by project. Empty state
  when no events yet.
- **`activityFeed.ts`** *(new, pure, tested)* — `appendEvent(list, ev, cap): FeedItem[]`
  turns a `SessionEvent`-shaped change into a capped, newest-first feed list.

**Modified:**
- **`App.tsx`** — becomes thin: holds `activeSection`, `selectedSessionId`, and the
  capped `activity` list. Its existing `subscribe()` callback now ALSO feeds
  `appendEvent`. Renders `AppShell`.
- **`Office.tsx`** — drop internal `selectedId` + the `CharacterDetail` modal; accept
  `sessions`, `selectedId`, `onSelect` as props (presentational). Keep the live
  re-resolve of the selected session (so Inspector updates live / clears on end).
- **`CharacterDetail.tsx`** — its body moves to `Inspector.tsx`; the file is removed (or
  becomes a thin modal wrapper if still wanted elsewhere — not needed, so remove).
- **`SettingsPanel.tsx`** — unchanged behavior. The nav `⚙` item opens it as an
  **overlay** (as today), rather than swapping the center view. It graduates to a real
  center section later when its config groups grow. So for this build `activeSection` is
  effectively just `office`; the shell is built to add center sections later.
- **`office.css`** — add shell grid, nav rail, right panel/tabs, collapse, responsive
  breakpoints; keep existing office/character styles.

## Data flow

```
subscribe(onSnapshot, onChange)
  ├─ onSnapshot/onChange → setSessions(...)        (office dots, as today)
  └─ onChange(kind, s)   → setActivity(a => appendEvent(a, {kind,s}, CAP))   (Activity tab)

tap coworker → setSelectedSessionId(id) → Inspector re-resolves s from sessions → renders
nav ⚙       → open SettingsPanel overlay   (office stays the center; others disabled)
```

Selection re-resolves against the live `sessions` list each render: the Inspector reflects
updates and clears when the session ends (same pattern Office uses today).

## Responsive & collapse

- **Desktop (≥ ~900px):** 3 columns. Nav collapses to an icon rail; right panel collapses
  to a thin edge toggle. State held in `AppShell`.
- **Mobile (< ~900px):** single column — office fills the view; nav becomes a top bar /
  hamburger drawer; the right panel becomes a bottom sheet that slides up (e.g. when a
  coworker is tapped, or via a toolbar button). The desktop-primary / phone-friendly
  principle holds.

## Error handling / edges

- No sessions → office shows the existing empty state; Inspector shows "select a coworker";
  Activity shows "no activity yet."
- Selected session ends → Inspector auto-clears (live re-resolve).
- Activity list is capped (e.g. 200 newest) so it can't grow unbounded.
- Disabled nav items are non-interactive and announce "coming soon" (title/aria).

## Testing

- **`activityFeed.ts`** (`node:test`): appends newest-first; caps at the limit; maps
  `created→appeared`, `updated→→activity`, `ended→ended`.
- Shell / nav / panel / inspector / feed components: `npm run build` (tsc + vite) +
  Kevin's visual smoke test (desktop 3-col, collapse, mobile stack) — consistent with how
  Tier 1–3a UI was verified (no jsdom in the project).

## Out of scope (later tiers, each its own spec)

Notes, Analytics (Tier 3b), and every Toolbox section (Agents, MCP Servers, Skills,
Commands, Hooks, Plugins & Marketplaces, Memory & CLAUDE.md). Settings expansion (output
styles, permissions). Real content for any "soon" nav item.

## Roadmap impact

This promotes the parked "Navigation & Management system" into the **next tier after 3a**
(the shell is foundational — Notes/Analytics/Toolbox all plug into it). Sequencing:
**Tier 3a (AI summaries) merges first**, then this shell, then the sections fill in. The
roadmap doc will be renumbered accordingly when the plan is approved.
