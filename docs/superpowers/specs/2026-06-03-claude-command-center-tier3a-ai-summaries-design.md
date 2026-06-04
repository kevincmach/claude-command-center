# Tier 3a — AI-Distilled Session Summaries — Design Spec

**Project:** Claude Command Center
**Status:** Approved design — ready for implementation plan (2026-06-03)
**Parent:** `2026-06-03-claude-command-center-roadmap.md` (Tier 3 · Knowledge & Analytics)

> Tier 3 was decomposed into two independent subsystems. **This spec is sub-project A
> (AI summaries).** Sub-project B (analytics dashboard) is a separate, later spec.

## Goal

Turn each session's thin vault timeline into a real second-brain note: when a session
ends (or on demand), distill its transcript into a **structured digest** and write it
as a `## Summary` section in `Sessions/<sessionId>.md`.

## Decisions locked during brainstorming

- **Trigger:** **auto on session end + a manual refresh button** in the detail card.
- **Generator:** **headless `claude -p`** (the local Claude Code CLI), NOT the Anthropic
  SDK. Reuses Kevin's existing Claude Code auth/subscription → **no new npm dependency,
  no separate API billing**. We spawn a *fresh* headless invocation; we do NOT inject
  into a live session (that would need the Tier 5 Remote Control bridge).
- **Model:** `haiku` by default (cheap/fast; config-overridable via `--model`).
- **Summary shape:** structured digest — TL;DR, What got done, Key decisions, Files
  touched, Open / next steps.
- **Model input:** a **distilled extract** (prompts, ai-titles, tool names + brief args,
  final assistant messages), capped — not the raw transcript.
- **Opt-in:** off by default. Enabling sends distilled content to Anthropic via the CLI,
  so it stays explicit + is announced on startup.

## Architecture & data flow

```
session ends (ended event)  ──┐
manual "↻ Summarize" button ──┴─► SummaryService.maybeSummarize(session, {force})
        │  guards: enabled? claude on PATH? (auto only) not already summarized?
        ▼
   distillTranscript(file)      → distilled source string (capped)
        ▼
   summarize(source, {run,model}) → spawn `claude -p` → digest markdown
        ▼
   writeSummary(vault, id, digest) → upsert `## Summary` in Sessions/<id>.md
```

Summarization is best-effort and isolated: any failure is swallowed + logged and never
affects monitoring (same contract as `EventLog.record`).

## Components (isolated, testable)

### `src/server/transcript-distiller.ts` *(new, pure core + thin reader)*
- `buildDigestSource(entries: any[], capChars?: number): string` — **pure.** From parsed
  transcript JSON objects, extract in chronological order: user prompts
  (`type:'user'` text), `ai-title`s, `tool_use` name + one brief arg (e.g. `file_path`/
  `command` truncated), and final assistant text blocks. Join into a compact labeled
  text. If over `capChars` (default ~24000 ≈ 6k tokens), keep the **most recent** content.
- `distillTranscript(file: string): Promise<string>` — stream-reads the `.jsonl` (reusing
  the same readline pattern as `transcript-reader.ts`), parses lines, calls
  `buildDigestSource`. Returns `''` on missing/empty file.

### `src/server/summarizer.ts` *(new — the only impure unit; runner injected)*
- `type SummaryRunner = (args: { source: string; model: string }) => Promise<string>`
- `summarize(source: string, deps: { run: SummaryRunner; model: string }): Promise<string>`
  — returns the digest markdown (trimmed). Empty `source` → returns `''` (caller skips).
- `spawnClaudeRunner(claudeBin: string): SummaryRunner` — real runner. Spawns
  `claudeBin -p --model <model> --output-format text --disallowedTools "*"
  --append-system-prompt <SYSTEM_PROMPT>` with **`cwd: SUMMARIZER_CWD`**, writes `source`
  to stdin, resolves trimmed stdout. Rejects on non-zero exit, spawn error, or a 60s
  timeout (kill the child). `SYSTEM_PROMPT` instructs the exact structured-digest format.
- Tests inject a fake `run` — **no process is spawned in tests.**

### `src/server/summary-writer.ts` *(new, pure core + thin IO)*
- `upsertSummarySection(md: string, summary: string): string` — **pure.** If a `## Summary`
  block exists (from `## Summary` to the next `## ` heading or EOF), replace it; else
  insert a `## Summary\n\n<summary>\n` block immediately **before** `## Timeline` (or append
  if no Timeline). Preserves frontmatter, title, and all other sections.
- `writeSummary(vault: string, sessionId: string, summary: string): void` — reads
  `Sessions/<id>.md` (if absent, nothing to anchor → skip), applies `upsertSummarySection`,
  writes back.
- `hasSummary(vault: string, sessionId: string): boolean` — true if the page already
  contains a `## Summary` heading (used by the auto idempotency guard).

### `src/server/summary-service.ts` *(new — coordinator)*
- `class SummaryService { constructor(cfg, run: SummaryRunner) }`
- `async maybeSummarize(session: Session, opts?: { force?: boolean }): Promise<SummaryResult>`
  where `SummaryResult = { ok: boolean; status: 'written'|'skipped'|'disabled'|'error'; error?: string }`.
  - Guards (in order): `cfg.summaries` off → `disabled`; auto (`!force`) and
    `hasSummary(...)` → `skipped`; transcript distills to `''` → `skipped`.
  - Else: `distillTranscript` → `summarize` → `writeSummary` → `written`.
  - Whole body in try/catch → on throw, log once + return `{ ok:false, status:'error' }`.

## Touched existing units

- **`src/shared/types.ts`** — extend `Config` with `summaries: boolean`,
  `summaryModel: string`, `claudeBin: string`.
- **`src/server/config.ts`** — parse `--summaries` flag / `CCC_SUMMARIES=1` env (default
  `false`); `--summary-model` / `CCC_SUMMARY_MODEL` (default `'haiku'`); `--claude-bin` /
  `CCC_CLAUDE_BIN` (default `'claude'`). Export `SUMMARIZER_CWD` constant
  (`path.join(os.tmpdir(), 'ccc-summarizer')`).
- **`src/server/session-model.ts`** — in `refresh`, **exclude registry records whose
  `cwd === SUMMARIZER_CWD`** (our own headless runs) before building sessions. This keeps
  summarizer invocations off the board *and* out of the `ended` trigger (no feedback loop).
- **`src/server/index.ts`** — construct `SummaryService` (with `spawnClaudeRunner` when
  `summaries` on & `claude` resolvable, else a no-op runner); on `ended` events call
  `summaryService.maybeSummarize(session)`. On startup, if `summaries` on, log the
  privacy line (below); if `claude` not found on PATH, log one warning + disable.
- **`src/server/server.ts`** — add `POST /api/sessions/:id/summarize` → looks up the
  session, calls `maybeSummarize(session, { force: true })`, returns `SummaryResult` JSON
  (plus the digest's TL;DR line so the UI can show it).
- **`src/web/api.ts`** — `summarizeSession(id): Promise<SummaryResult & { tldr?: string }>`.
- **`src/web/components/CharacterDetail.tsx`** — a "↻ Summarize" button calling the
  endpoint, with `idle | pending | done | error` state; on success show the returned TL;DR
  inline (the full digest lives in the vault). Disabled/hidden gracefully if the endpoint
  reports `disabled`.

## Config & privacy

| Field | Default | Source |
| --- | --- | --- |
| `summaries` | `false` (opt-in) | `--summaries` · `CCC_SUMMARIES=1` · config |
| `summaryModel` | `'haiku'` | `--summary-model` · `CCC_SUMMARY_MODEL` · config |
| `claudeBin` | `'claude'` | `--claude-bin` · `CCC_CLAUDE_BIN` · config |

- **Off by default.** When on, startup logs exactly once:
  `summaries ON — distilled transcript content is sent to Anthropic via "claude -p" (<model>)`.
- We send a **distilled extract**, not raw transcripts — lowers (does not eliminate)
  secret exposure; documented honestly in the README.
- No API key handling — auth is whatever the local `claude` CLI already uses.

## Idempotency & cost guard

- **Auto-on-end:** skip if the page already has a `## Summary` (no duplicate spawn).
  Generate once per session.
- **Manual button:** `force: true` always regenerates, overwriting via `upsertSummarySection`.
- Distilled source capped (~6k tokens) + `haiku` + generate-once → negligible quota use.

## Error handling / edges

- `summaries` on but `claude` missing on PATH → warn once, disable (`disabled` result).
- CLI non-zero exit / spawn error / 60s timeout → caught, logged; auto path moves on,
  manual endpoint returns `{ ok:false, status:'error', error }`, button shows error state.
- Empty/trivial transcript (distills to `''`) → `skipped`, no spawn.
- `Sessions/<id>.md` missing when writing → `skipped` (nothing to anchor the section to).
- **Self-session feedback loop** → prevented by the `SUMMARIZER_CWD` filter in
  `session-model.ts` (our headless runs never enter the store, so they never trigger
  `ended`-summarization and never appear as characters).

## Testing (`node:test`, fixtures)

- **`transcript-distiller`** — over a fixture of mixed entries: extracts prompts/titles/
  tool names+args/final messages in order; respects `capChars` by keeping most-recent;
  ignores noise (usage-only, queue-operation). Missing file → `''`.
- **`summary-writer`** — `upsertSummarySection`: inserts before `## Timeline` when absent;
  **replaces** an existing `## Summary` block; leaves frontmatter + `## Timeline` intact.
  `hasSummary` true/false. `writeSummary` on a missing page is a no-op.
- **`summarizer`** — with an injected fake `run`: passes the right `model` + `source`,
  returns trimmed text; empty source → `''`; a throwing `run` propagates so the service
  can catch it.
- **`summary-service`** — fake runner + temp vault: `summaries` off → `disabled`; auto +
  existing summary → `skipped`; auto + none → `written`; `force` + existing → regenerates;
  thrown error → `{ ok:false, status:'error' }`.
- **`session-model`** — a registry record with `cwd === SUMMARIZER_CWD` is excluded from
  the built sessions.
- **`config`** — `summaries` / `summaryModel` / `claudeBin` parsed from flag + env.

## Implementation notes

- During the build, consult the `claude-api` skill only if we later add an SDK path — for
  now the generator is purely the CLI subprocess (built-in `node:child_process`), so no
  new dependency.
- Confirm during build whether headless `claude -p` registers a `~/.claude/sessions`
  record at all; the `SUMMARIZER_CWD` filter is correct either way (active guard if it
  does, harmless if it doesn't).

## Out of scope (later / other subsystem)

Analytics dashboard (Tier 3b), project-level rollup summaries (summary-of-summaries),
streaming the digest into the UI live, multi-provider/SDK support, summarizing on a timer.
