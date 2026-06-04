# Tier 2b — Rich Signals — Design Spec

**Project:** Claude Command Center
**Status:** Approved design — ready for implementation plan (2026-06-03)
**Parent:** `2026-06-03-claude-command-center-roadmap.md` (Tier 2 · Polish & Delight)

## Goal

Surface more of each session's real Claude Code state on its character — model,
permission mode (YOLO / plan), sub-agents, and *pending* queued messages —
**minimally on the character, fully in the detail card.**

## Decisions locked during brainstorming

- **Placement:** minimal badges on the character; full signals in the tap/hover
  detail card (keeps the office uncluttered). [Kevin's choice]
- **To-do whiteboard is DEFERRED** — `TodoWrite` data is sparse/often absent in
  transcripts, not worth the backend work yet.
- **Costumes (recolor sprite per model) are DEFERRED** to the later design pass —
  the fixed PNG sprite can't palette-swap; a model *badge/label* is used instead.

## Signal availability (verified against real transcripts)

| Signal | Source | Status |
| --- | --- | --- |
| Model | `Session.model` | already exposed |
| Sub-agents | `Session.subAgents` | already exposed (count) |
| Permission mode | transcript `permission-mode` entries (`bypassPermissions`, `plan`, `acceptEdits`, `normal`) — read into `TranscriptInfo.permissionMode` | **not yet on `Session`** → add |
| Queued (pending) | transcript `queue-operation` entries with `operation: 'enqueue' \| 'dequeue'` | **count is cumulative today** → fix to net pending |

## Backend changes (small)

1. **`src/server/transcript-reader.ts`** — fix `queuedCount`: on `enqueue` add 1,
   on `dequeue` subtract 1, clamp at 0 (currently increments on every op).
2. **`src/shared/types.ts`** — add `permissionMode: string | null` to `Session`.
3. **`src/server/session-model.ts`** — in `buildSession`, set
   `permissionMode: info.permissionMode` on the returned `Session`.

No new endpoints or pipeline changes — the new field rides the existing SSE stream.

## Frontend changes

- **`src/web/badges.ts`** *(new, pure, tested)* — single source of truth:
  - `modelLabel(model): string` → friendly short label (e.g. `claude-opus-4-8` → "Opus").
  - `permissionBadge(mode): { icon, label } | null` → `bypassPermissions` →
    `{ '⚠️', 'YOLO' }`, `plan` → `{ '📋', 'Plan' }`, else `null` (normal/acceptEdits
    show nothing on the character).
- **`Character.tsx`** — render a small corner badge **only** when
  `permissionBadge(s.permissionMode)` is non-null (⚠️ YOLO / 📋 Plan). Nothing for
  normal sessions.
- **`CharacterDetail.tsx`** — add rows: **Model** (via `modelLabel`), **Permission
  mode** (friendly), **Sub-agents** (N, when > 0 — already present), **📥 Queued**
  (N pending, when > 0).
- **`office.css`** — a `.char-badge` corner-badge style.

## Components (isolated)

- `badges.ts` — pure mapping, unit-tested.
- `Character.tsx` / `CharacterDetail.tsx` — consume `badges.ts`.
- `transcript-reader.ts` / `session-model.ts` / `types.ts` — the small backend add.

## Error handling / edges

- `permissionMode` null/unknown → `permissionBadge` returns null → no badge.
- `modelLabel` unknown model → return the raw string (don't hide info).
- Queued count never negative (clamped).

## Testing

- **Unit (`node:test`):**
  - `badges.ts` — `modelLabel` known + unknown; `permissionBadge` for
    bypass/plan/normal/null.
  - `transcript-reader` — a fixture with enqueue×2 + dequeue×1 → `queuedCount === 1`.
  - `session-model` — `permissionMode` from the fixture appears on the built `Session`.
- **Visual:** run against real `~/.claude`; confirm a ⚠️ YOLO badge appears on
  bypass sessions and the detail card shows model / mode / sub-agents / queued.

## Out of scope (later)

To-do whiteboard, model costumes (sprite recolor), skill/MCP props, sound,
plan-mode dedicated room — all part of the deferred design pass or later tiers.
