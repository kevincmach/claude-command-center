# Tier 1 — The Office — Design Spec

**Project:** Claude Command Center
**Status:** Approved direction (2026-06-03)
**Parent:** `2026-06-03-claude-command-center-roadmap.md`
**Builds on:** Tier 0 (`tier0` branch / PR #1)

## Goal

Replace the Tier 0 card board with a cozy, living **office floor**: one shared
space of activity-rooms where every live Claude Code session appears as a
character standing in the room that matches what it's doing. The office breathes
(gentle idle motion), shows who needs you (a glowing room + bubble), and lets you
tap any character for details.

**Definition of done:** open the dashboard on a phone and see your sessions as
characters distributed across rooms by activity, project shown by a colored ring,
context shown by a meter, attention shown by a glow — updating live over SSE.

## Scope

**Frontend-only.** The Tier 0 backend already computes `activity` for every
session, so no server, collector, or API changes are needed. We swap the
presentation layer.

**Out of scope (later tiers):** real pixel sprites and characters *walking*
between rooms (Tier 2); a dedicated plan-mode/whiteboard room and other extra
signals (Tier 2); any control or write-back (Tier 3).

## The room map

One shared floor. Each `Activity` value maps to exactly one room:

| Activity | Room | Notes |
| --- | --- | --- |
| `working` | 🖥️ Work Pods | editing / bash / coding |
| `researching_web` | 🏋️ Gym | WebSearch / WebFetch |
| `reading` | 📚 Library | Read / Grep / Glob |
| `meeting` | 🧩 Meeting Room | sub-agents shown as small 🐤 beside the parent |
| `waiting_permission` | 🏓 Break Room | **glows**, ❗ bubble, raises the top banner |
| `waiting_question` | 🏓 Break Room | same room, same urgency |
| `idle` | ☕ Lounge | shown still and dimmed |
| `done` | ☕ Lounge | brief; session is ending |
| `planning` | ☕ Lounge | fallback until its own room (Tier 2) |
| `unknown` | ☕ Lounge | safe fallback |

The mapping is a **pure function** with a default of `lounge`, so any future or
unexpected activity value still lands somewhere valid.

## Components

Replaces `Board.tsx`, `ProjectZone.tsx`, `SessionCard.tsx`. Each unit is small,
single-purpose, and (for pure logic) unit-tested.

- **`rooms.ts`** *(pure, tested)* — the room catalog (`id`, `label`, `emoji`,
  `furniture`) and `roomForActivity(activity): RoomId` with a `lounge` default.
- **`projectColor.ts`** *(pure, tested)* — `projectColor(name): string`: hash a
  project name to a stable HSL ring color (same name → same color every render).
- **`Office.tsx`** — renders the room grid (CSS grid; columns collapse to fewer on
  narrow phone widths). Buckets sessions by `roomForActivity` and hands each room
  its occupants. Shows a cozy empty-state when there are no sessions.
- **`Room.tsx`** — one room: emoji + label + a furniture accent; renders its
  characters; adds a "glow" style when any occupant needs attention.
- **`Character.tsx`** — one session: emoji body with a gentle CSS **bob** (idle
  characters render still + dimmed), a project-color ring, the title as a small
  nameplate, a context-% meter, and an ❗ bubble when waiting. Tap toggles detail.
- **`CharacterDetail.tsx`** — a small popover/card shown on tap: full title,
  model, estimated cost, context %, status/activity, short sessionId.
- **`App.tsx`** — unchanged data flow (SSE → built-in state) and the existing
  attention banner; just renders `<Office>` instead of `<Board>`.

## Data flow

Unchanged from Tier 0: `EventSource('/api/stream')` → React state array of
`Session` → `Office` buckets them via `roomForActivity(session.activity)` →
rooms render characters. No new network or backend paths.

## Visual & interaction details

- **Alive:** active characters bob via CSS keyframes (staggered delays so they
  don't move in lockstep); idle/lounge characters are still and ~60% opacity.
- **Attention:** the Break Room glows; its characters show an ❗ bubble; the
  Tier 0 top banner ("N sessions need you") remains.
- **Identity:** a colored ring around each character encodes its project; a tiny
  legend (or the detail popover) explains the colors.
- **Detail on tap:** phone-first — no hover dependency. Tapping a character opens
  `CharacterDetail`; tapping elsewhere or again closes it.
- **Responsive:** room grid is 3-wide on tablet/desktop, collapses to 2 or 1 on
  narrow phones.

## Error handling / edge cases

- **Unknown/oversized activity set:** `roomForActivity` defaults to `lounge` —
  never crashes, never drops a character.
- **No sessions:** Office shows a friendly empty-state ("The office is quiet…").
- **Many characters in one room:** characters wrap within the room; the room grows
  vertically rather than overflowing.
- **Missing fields** (`title`, `model` null): render a neutral placeholder ("—").

## Testing

Same philosophy as Tier 0 — test the pure logic, verify rendering by eye:

- **Unit (`node:test`, no new deps):**
  - `rooms.ts` — every `Activity` value maps to a defined room; the default is
    `lounge`; the room catalog contains each referenced room id.
  - `projectColor.ts` — deterministic (same input → same output) and produces
    distinct colors for a handful of sample project names.
- **Visual verification:** run the app against the fixture and against real
  `~/.claude`, confirm on the phone that characters land in the right rooms, the
  Break Room glows on a waiting session, idle sessions sit in the Lounge, and
  tapping a character shows details.

## Open questions for planning

- Exact CSS grid breakpoints for the phone (pick sensible defaults, refine on
  device).
- Whether the project-color legend is always visible or lives only in the detail
  popover (lean: small always-visible legend).
