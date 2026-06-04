# Claude Command Center — Master Roadmap

**Status:** Approved direction (2026-06-03)
**Working title:** Claude Command Center (rename anytime)

## Problem statement

You run several projects with multiple concurrent Claude Code sessions and lose
track of which ones are working, which are stuck waiting on you, and what they
each accomplished. Multiple terminals are intimidating to people who aren't used
to them.

## Vision

A LAN-served, phone-first **virtual coworking office** where every live Claude
Code session is a cute pixel character that walks to the room matching what it's
doing (working at a desk, in the gym while web-searching, at the ping-pong table
while waiting on you). It glows and pushes a notification when it needs a human.
Everything it observes is written to a plain-markdown, Obsidian-ready vault so you
get an automatic second brain of your Claude Code work. Open source, cross-
platform, no cloud.

## Why this can exist (feasibility)

All required state is already on disk, no Claude Code modification needed:

- **`~/.claude/sessions/<pid>.json`** — live registry per running session:
  `pid`, `cwd`, `status` ("busy" | "waiting" | "idle"), `waitingFor`
  (e.g. "permission prompt"), `model`/`version`, `startedAt`, `updatedAt`,
  `sessionId`, `bridgeSessionId`, `entrypoint`, `kind`.
- **`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`** — full transcript:
  token/context `usage`, model, latest `tool_use` (→ current activity),
  auto-generated `ai-title`, sub-agent `Task` calls, `queue-operation`
  (queued prompts), `permission-mode` (normal / plan / acceptEdits /
  bypassPermissions).

Liveness is confirmed with `process.kill(pid, 0)`. Activity (the "room") is a
pure function of (registry status + latest tool + `waitingFor` + staleness).

## Competitive landscape & our wedge

| Tool | What it does | Why we beat it |
| --- | --- | --- |
| **Pixel Agents** (VS Code) | Pioneered the office-sim metaphor for Claude Code | Trapped in VS Code on one machine — no phone/LAN, no logging, no cost view; status desyncs |
| **claude-code-monitor** | Phone+LAN control of CC sessions | macOS-only; shows raw terminals, no visualization, no vault |
| **ccusage / Usage-Monitor** | Token/cost analytics | No live agent state |
| **Conductor / Crystal→Nimbalyst / Vibe Kanban** | Orchestrate parallel worktree agents | Desktop/kanban dev-UIs; category is churning (shutdowns/renames in early 2026) |
| **AI Town** (a16z) | Pixel-village of fictional AI agents | Not a dev tool — no real telemetry |
| Obsidian exporters | Manual transcript → markdown | One-off, never integrated into a live monitor |

**Our differentiator:** the *fusion* nobody ships — LAN-served, phone-first,
office-sim visualization + cost-as-ambient + automatic Obsidian logging,
cross-platform, no cloud.

## Cross-cutting principles

- **Zero hardcoded paths.** Auto-discover `~/.claude`, override via flag/env/config.
- **One-command run.** `npx claude-command-center` or clone + `npm start`. The
  published package ships prebuilt frontend assets, so end users never run a build.
- **Stack:** TypeScript · Node + Express · React + Vite · React built-in state ·
  SSE · `node:test` · `npx`. Chosen as industry-standard, well-documented,
  transferable tech (see Tier 0 spec for rationale).
- **Read-only until the control tier (now Tier 5).** Safe by default; control is
  explicit and opt-in.
- **Privacy first.** Vault logs metadata/titles/events by default, not raw prompt
  content (transcripts can contain secrets); content logging is opt-in.
- **LAN security posture.** Default bind `127.0.0.1`; LAN exposure (`--lan`) is
  explicit and documented "trusted networks only." Auth arrives with control (Tier 5).
- **Isolated, testable units.** Each component has one job and a clear interface.

## Tiers (each ships independently)

### Tier 0 — Backbone & Skeleton  *(first spec → build)*
Collector (registry + liveness + transcript + activity + cost), local LAN web
server with live SSE push, a plain project-grouped board UI, config + one-command
run + README, and Obsidian audit logging v0 (append-only vault).
**Ships:** open it on your phone, see every live session + a growing markdown vault.

### Tier 1 — The Office
Board → animated office floor: rooms, activity→room engine, characters placed by
what they're doing, status visuals, attention glow + banner, nameplate from
auto-title, context meter, sub-agents in the meeting room. (Static placement.)
**Ships:** the living coworking space.

### Tier 2 — Polish & Delight
Walking/pathfinding between rooms, real pixel sprites, model costumes, plan-mode
whiteboard, YOLO badge (bypassPermissions), queued-message inbox stack, live
to-do whiteboard, skill/MCP props, sound.
**Ships:** the "make it fun" layer.

> **Reordered 2026-06-03:** Phone Cockpit (control) was Tier 3; Kevin deprioritized
> it (heaviest tier — auth + Remote Control bridge — and least wanted for now), so it
> moves to last. Knowledge & Analytics is promoted to next: it builds directly on the
> vault + live state already shipped, adds no new bridge/auth surface, and is the
> "automatic second brain" differentiator. New order below.

### Tier 3 — Knowledge & Analytics  *(was Tier 4 — promoted to next)*
Obsidian KB layer 2: optional AI-distilled session summaries (toggle, needs API
key). Analytics: token spend over time, per-project stats, session replay,
leaderboards.
**Ships:** the second brain + insights.

### Tier 4 — Share & Multiplayer  *(was Tier 5)*
Cross-platform hardening, install flow, GitHub release docs, optional shared team
floor (teammates see the same office over LAN).
**Ships:** the public, shareable "ultimate toolkit."

### Tier 5 — Phone Cockpit  *(was Tier 3 — deprioritized to last)*
Push notifications when a session needs you, two-kinds-of-waiting detection
(permission vs. asked-a-question), tap-a-character to act (answer permission /
nudge / pause / kill) by riding Claude Code's first-party Remote Control bridge
(`bridgeSessionId` / `peerProtocol`). Adds auth.
**Ships:** run your whole fleet from the couch.

## Emerging direction — Navigation & Management system *(parking lot, not yet scheduled)*

A first-class in-app navigation/settings surface for *managing* Claude Code from the
dashboard: feature toggles, preferences, and per-aspect control panels (not just the
office view). Kevin's idea (2026-06-03); scope TBD in its own brainstorm. **First brick
already landing in Tier 3a:** a ⚙ settings panel with the AI-summaries on/off toggle
(runtime `Settings` store + `GET`/`PATCH /api/settings`). Future toggles/aspects extend
the same panel + store.

## Selected features → tier map

| Feature | Tier |
| --- | --- |
| Live session board, project grouping, context meter, cost | 0 |
| Obsidian audit vault (events) | 0 |
| Office rooms + activity→room + nameplate + attention glow | 1 |
| Walking animation, pixel sprites, model costumes | 2 |
| Plan-mode whiteboard, YOLO badge, queued inbox, todo whiteboard, skill/MCP props | 2 |
| AI-distilled summaries, analytics/replay/leaderboards | 3 |
| Shared team floor, install/release hardening | 4 |
| Phone push, two-kinds-of-waiting, tap-to-act control | 5 |

## Process

Each tier gets its own spec → implementation plan → build cycle. Next up:
the **Tier 0 design spec** (companion document).
