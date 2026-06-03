# Tier 0 — Backbone & Skeleton — Design Spec

**Project:** Claude Command Center
**Status:** Draft for review (2026-06-03)
**Parent:** `2026-06-03-claude-command-center-roadmap.md`

## Goal

A read-only local service that discovers live Claude Code sessions, normalizes
their state, serves it to a phone over the LAN with live updates, and mirrors
every observation into an Obsidian-ready markdown vault. This proves the entire
data pipeline end-to-end and becomes the foundation every later tier builds on.

**Definition of done:** run one command on the host, open a URL on your phone,
and see an accurate, live-updating list of your Claude Code sessions grouped by
project — each showing status, model, title, context %, and estimated cost —
while a markdown vault grows in the background.

## Out of scope for Tier 0 (YAGNI)

Office/rooms/sprites/walking (Tier 1–2), any control or write-back (Tier 3),
AI summaries and analytics charts (Tier 4), auth (Tier 3), multiplayer (Tier 5).
Tier 0's UI is a plain board, not a game.

## Tech stack & rationale

- **Node.js** — every Claude Code user already has it; no extra runtime.
- **Server:** Fastify (small, fast) serving static files + JSON + SSE. SSE
  (not WebSocket) because Tier 0 push is one-directional and SSE traverses
  phones/proxies trivially with auto-reconnect.
- **File watching:** `chokidar` for the sessions dir + active transcripts;
  plus a short interval timer for pid-liveness (process death is not a file event).
- **Frontend:** vanilla HTML/CSS/JS, no build step (honors "clone and run").
  A framework/canvas arrives only when Tier 1 needs the office.
- Keep the dependency list tiny — this is a tool people clone and trust.

## Architecture — components (isolated units)

Each unit has one responsibility, a typed interface, and is independently testable.

1. **`config`** — resolves settings from flags → env → `claude-command-center.json`
   → defaults. Fields: `claudeHome`, `host` (default `127.0.0.1`), `port`,
   `vaultPath`, `pollIntervalMs`, `staleIdleMs`, `logContent` (default false).
2. **`discovery`** — locates `claudeHome` (`~/.claude` or override) and validates
   `sessions/` and `projects/` exist. Reports a friendly setup error if not.
3. **`registry-reader`** — reads `sessions/*.json`, returns raw registry records.
   Tolerates partially-written files (retry/skip).
4. **`liveness`** — `classify(pid, updatedAt)` → `live | stale | dead` using
   `process.kill(pid, 0)` (ESRCH = dead, EPERM = alive) cross-checked with an
   `updatedAt` staleness threshold.
5. **`transcript-reader`** — given `sessionId` + `cwd`, locates the JSONL
   (encode cwd as Claude does — `/`→`-`; fall back to globbing
   `projects/*/<sessionId>.jsonl`). **Tail-reads** only the last ~64 KB and parses
   the last valid lines to extract: latest `usage`, `model`, latest `tool_use`
   name, `ai-title`, active `Task` (sub-agent) count, `queue-operation` count,
   `permission-mode`. Never loads whole files.
6. **`activity-classifier`** — pure function:
   (registry `status` + `waitingFor` + latest tool + staleness) → `Activity`
   enum: `working | researching_web | reading | meeting | planning |
   waiting_permission | waiting_question | idle | done | error`. Tier 0 renders a
   simple status, but the field is computed now so Tier 1 inherits it free.
7. **`cost-model`** — `usage` → context tokens, context % (per-model context-limit
   table), and estimated USD (per-model price table). Pricing/limits in one
   constants file, easy to update.
8. **`session-model`** — aggregator. Merges registry + liveness + transcript +
   activity + cost into a normalized `Session`. Holds an in-memory map keyed by
   `sessionId`; diffs each refresh and emits `created | updated | ended` events.
9. **`watcher`** — chokidar on `sessions/` + the transcripts of known-live
   sessions, debounced; plus an interval re-check for liveness. Triggers
   `session-model` refresh for affected sessions only.
10. **`event-log`** (Obsidian writer) — subscribes to `session-model` events,
    writes the vault (see below). Append-only, idempotent (dedupe by event key).
11. **`server`** — Fastify. Routes: static UI, `GET /api/state` (snapshot array),
    `GET /api/stream` (SSE of session events). Binds per `config.host`.
12. **`web/`** — vanilla UI: fetches `/api/state`, subscribes to `/api/stream`,
    renders project-grouped session cards; reconnects automatically.

## Data flow

```
watcher (fs events + liveness tick)
   → registry-reader + transcript-reader
   → activity-classifier + cost-model
   → session-model (diff → events)
        ├─ server  → SSE → phone browser
        └─ event-log → markdown vault
```

## Normalized `Session` shape (the API contract)

```
{
  sessionId, pid, alive,            // identity + liveness
  project: { name, cwd },           // grouping
  status, activity, waitingFor,     // what it's doing / needs
  model, version, entrypoint,
  title,                            // from ai-title
  context: { tokens, limit, pct },
  cost: { usd },
  subAgents, queuedCount,
  startedAt, updatedAt
}
```

This contract is frozen for the tier — later tiers add fields, never rename.

## Obsidian vault layout (logging v0)

```
<vaultPath>/
├── index.md                         # links to projects + today
├── Daily/2026-06-03.md              # chronological event timeline
├── Projects/<Project>.md            # rollup: sessions + links + totals
└── Sessions/2026-06-03-<Project>-<short>.md   # one page per session
```

- Files carry YAML frontmatter (`project`, `session`, `model`, `started`, tags)
  and `[[wikilinks]]` between session ↔ project ↔ daily.
- **Events logged:** session started, activity/room changes, went waiting (+why),
  idle, context milestones, ended. Append-only; each event keyed to avoid dupes.
- **Privacy:** titles and event metadata only by default; raw prompt/response
  content is logged only when `logContent: true`.

## Error handling

- **Missing `~/.claude`** → UI + stderr show a friendly setup message; keep
  retrying, don't crash.
- **Malformed / partially-written JSON** (transcript written concurrently) →
  skip the bad line, use last good data; every parse wrapped in try/catch.
- **Huge transcripts** → tail-read last ~64 KB only.
- **`process.kill` errors** → EPERM ⇒ alive, ESRCH ⇒ dead.
- **Dead pid, lingering file** → mark `ended` after a grace period, log it once.
- **Port in use** → auto-increment with a clear notice, or fail with guidance.
- **Vault write failure** (disk full / perms) → log and continue serving; the
  live view must never go down because logging failed.
- **No sessions** → UI shows an empty-state, not an error.

## Security posture (Tier 0)

Read-only, so risk is exposure of session *metadata* on the LAN. Default bind
`127.0.0.1`; LAN exposure requires explicit `--lan` / `--host 0.0.0.0`, with a
"trusted networks only" warning in README and at startup. Token-based auth is
introduced in Tier 3 alongside control.

## Testing strategy (TDD)

- **Unit:**
  - `activity-classifier` — table of (status, tool, waitingFor, staleness) → expected enum.
  - `cost-model` — usage fixtures → context %/USD against known values.
  - `liveness` — mock `process.kill` for ESRCH/EPERM/success.
  - `transcript-reader` — fixture JSONL including malformed lines, huge file (tail correctness), missing title.
  - `discovery` — cwd→folder encoding + glob fallback.
  - `event-log` — golden-file markdown output; idempotency on replayed events.
- **Integration:**
  - Point the service at a temp fake `~/.claude` fixture; assert `/api/state` shape.
  - Mutate a fixture file → assert an SSE event is emitted.
  - Assert vault files are created/updated with expected frontmatter + links.
- **Fixtures:** a handful of sanitized real registry records + a small transcript,
  committed under `test/fixtures/`.

## Open questions to resolve during planning

- Exact context-limit + price constants per model (source from a maintained table).
- Staleness thresholds (`staleIdleMs`) — pick sensible defaults, make configurable.
- Package name for `npx` (`claude-command-center` vs shorter alias).
