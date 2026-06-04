# Tier 3a — AI-Distilled Session Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a session ends (or on a button tap), distill its transcript and have a headless `claude -p` write a structured `## Summary` into the session's vault page — gated by a runtime on/off toggle.

**Architecture:** Pure units (distiller, summary-writer, settings) + one impure unit (`summarizer`, which spawns `claude -p` via an injected runner) are tied together by `SummaryService`. A runtime `SettingsStore` (persisted `settings.json`) holds the `summaries` toggle, read live on every call and flipped from a ⚙ settings panel via `GET`/`PATCH /api/settings`. Our own headless runs are kept off the board (and out of the auto-trigger) by spawning them in a dedicated `SUMMARIZER_CWD` that `session-model` filters out.

**Tech Stack:** TypeScript · Node + Express · React + Vite · SSE · `node:test` · `node:child_process` (no new npm dependency).

---

## Context for the implementer

- **Spec:** `docs/superpowers/specs/2026-06-03-claude-command-center-tier3a-ai-summaries-design.md`
- **Run tests:** `npm test` (`node --import tsx --test test/*.test.ts`).
- **Typecheck + build (gate for non-unit-tested UI/wiring):** `npm run build` (`tsc && vite build`).
- **Commits:** run `git` directly (zsh aliases shadow helper fns). Required author env:
  ```bash
  GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
  GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
  git commit -m "..."
  ```
- **Branch:** create `tier3a` off `main` **after PR #2 (tier2b) merges**, so this builds on Tier 2b.
- **Smoke test:** `npm run build` then
  `node dist/server/index.js --lan --port 4317 --vault /tmp/ClaudeVault-live`; open
  `http://192.168.68.147:4317`.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/shared/types.ts` | Modify | Add `Settings`, `SummaryResult`; add `summaryModel`/`claudeBin`/`settingsPath` to `Config` |
| `src/server/config.ts` | Modify | Parse new Config fields; export `SUMMARIZER_CWD` |
| `src/server/session-model.ts` | Modify | `isSelfSummarizer` + exclude those records in `refresh` |
| `src/server/transcript-distiller.ts` | Create | `buildDigestSource` (pure) + `distillTranscript` (reader) |
| `src/server/summary-writer.ts` | Create | `upsertSummarySection` (pure) + `writeSummary` + `hasSummary` |
| `src/server/settings.ts` | Create | `SettingsStore` (load/get/patch, persisted) |
| `src/server/summarizer.ts` | Create | `summarize` (pure, runner injected) + `spawnClaudeRunner` + `isClaudeAvailable` |
| `src/server/summary-service.ts` | Create | `SummaryService.maybeSummarize` coordinator |
| `src/server/server.ts` | Modify | `GET`/`PATCH /api/settings`, `POST /api/sessions/:id/summarize` |
| `src/server/index.ts` | Modify | Wire settings/service, `ended`→summarize, startup logs |
| `src/web/api.ts` | Modify | `getSettings`, `updateSettings`, `summarizeSession` |
| `src/web/components/SettingsPanel.tsx` | Create | ⚙ panel with the summaries toggle |
| `src/web/App.tsx` | Modify | ⚙ gear button opening the panel |
| `src/web/components/CharacterDetail.tsx` | Modify | "↻ Summarize" button + TL;DR display |
| `src/web/office.css` | Modify | `.gear`, `.setting-row`, `.detail-summarize` styles |

---

## Task 1: Shared types, Config fields, and `SUMMARIZER_CWD`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/server/config.ts`
- Modify: `test/config.test.ts`
- Modify: `test/server.test.ts` (Config literal), `test/session-model.test.ts` (Config literal)

- [ ] **Step 1: Add the new shared types**

In `src/shared/types.ts`, add after the `Config` interface (end of file):

```ts
export interface Settings {
  summaries: boolean
}

export type SummaryStatus = 'written' | 'skipped' | 'disabled' | 'error'

export interface SummaryResult {
  ok: boolean
  status: SummaryStatus
  tldr?: string
  error?: string
}
```

And add three fields to the existing `Config` interface (after `logContent: boolean`):

```ts
  logContent: boolean
  summaryModel: string
  claudeBin: string
  settingsPath: string
}
```

- [ ] **Step 2: Write failing config tests**

In `test/config.test.ts`, add:

```ts
test('summary defaults: haiku model, claude bin, settings path under home', () => {
  const c = resolveConfig({ argv: [], env: {}, home: '/home/u' })
  assert.equal(c.summaryModel, 'haiku')
  assert.equal(c.claudeBin, 'claude')
  assert.equal(c.settingsPath, '/home/u/.claude-command-center/settings.json')
})

test('summary config overrides via flags + env', () => {
  const c = resolveConfig({
    argv: ['--summary-model', 'sonnet', '--claude-bin', '/opt/claude'],
    env: { CCC_SETTINGS: '/tmp/s.json' },
    home: '/home/u',
  })
  assert.equal(c.summaryModel, 'sonnet')
  assert.equal(c.claudeBin, '/opt/claude')
  assert.equal(c.settingsPath, '/tmp/s.json')
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- --test-name-pattern='summary defaults'`
Expected: FAIL — `c.summaryModel` is `undefined` (not yet parsed).

- [ ] **Step 4: Implement config parsing + the constant**

In `src/server/config.ts`, add `os` import at the top and the constant below the imports:

```ts
import os from 'node:os'
import path from 'node:path'
import type { Config } from '../shared/types.js'

export const SUMMARIZER_CWD = path.join(os.tmpdir(), 'ccc-summarizer')
```

Then add the three fields to the returned object (after `logContent: has('--log-content'),`):

```ts
    logContent: has('--log-content'),
    summaryModel: flag(argv, '--summary-model') ?? env.CCC_SUMMARY_MODEL ?? 'haiku',
    claudeBin: flag(argv, '--claude-bin') ?? env.CCC_CLAUDE_BIN ?? 'claude',
    settingsPath:
      flag(argv, '--settings') ??
      env.CCC_SETTINGS ??
      path.join(home, '.claude-command-center', 'settings.json'),
  }
```

- [ ] **Step 5: Fix the two existing Config test literals**

`Config` now has three new required fields, so the inline `cfg` literals must include them.

In `test/server.test.ts`, change the `cfg` object (ends with `logContent: false,`) to:

```ts
  logContent: false,
  summaryModel: 'haiku',
  claudeBin: 'claude',
  settingsPath: '/tmp/ccc-test-settings.json',
}
```

In `test/session-model.test.ts`, change the `cfg` object (ends with `logContent: false,`) to the identical three added lines:

```ts
  logContent: false,
  summaryModel: 'haiku',
  claudeBin: 'claude',
  settingsPath: '/tmp/ccc-test-settings.json',
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: all pass; `tsc` exits 0 (the new fields satisfy `Config` everywhere it's constructed).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/server/config.ts test/config.test.ts \
  test/server.test.ts test/session-model.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): add summary Config fields + SUMMARIZER_CWD + shared types"
```

---

## Task 2: Exclude self-summarizer sessions from the board

**Files:**
- Modify: `src/server/session-model.ts`
- Test: `test/session-model.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/session-model.test.ts`, add an import and tests. Add to the imports at top:

```ts
import { SessionStore, isSelfSummarizer } from '../src/server/session-model.js'
import { SUMMARIZER_CWD } from '../src/server/config.js'
```

(Replace the existing `import { SessionStore } ...` line with the combined one above.)

Then add:

```ts
test('isSelfSummarizer flags records in the summarizer cwd', () => {
  assert.equal(
    isSelfSummarizer({ pid: 1, sessionId: 'x', cwd: SUMMARIZER_CWD }),
    true,
  )
  assert.equal(
    isSelfSummarizer({ pid: 1, sessionId: 'x', cwd: '/home/u/proj' }),
    false,
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='isSelfSummarizer'`
Expected: FAIL — `isSelfSummarizer` is not exported / not a function.

- [ ] **Step 3: Implement the predicate + filter**

In `src/server/session-model.ts`, add the import near the other imports:

```ts
import { contextLimit, computeContext, estimateCost } from './cost-model.js'
import { SUMMARIZER_CWD } from './config.js'
```

Add the exported predicate (above the `SessionStore` class):

```ts
export function isSelfSummarizer(rec: RegistryRecord): boolean {
  return rec.cwd === SUMMARIZER_CWD
}
```

Add `RegistryRecord` to the type import at the top if not already present — the existing import is:
`import type { Config, RegistryRecord, Session, Status } from '../shared/types.js'` (already includes it).

In `refresh`, skip these records — change the loop body start:

```ts
    for (const rec of recs) {
      if (isSelfSummarizer(rec)) continue
      seen.add(rec.sessionId)
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='isSelfSummarizer'`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass (existing session-model tests unaffected — fixtures have no summarizer-cwd records).

- [ ] **Step 6: Commit**

```bash
git add src/server/session-model.ts test/session-model.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): exclude self-summarizer sessions from the board"
```

---

## Task 3: Transcript distiller

**Files:**
- Create: `src/server/transcript-distiller.ts`
- Test: `test/transcript-distiller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/transcript-distiller.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDigestSource,
  distillTranscript,
} from '../src/server/transcript-distiller.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('buildDigestSource extracts title, user, tools, assistant text in order', () => {
  const entries = [
    { type: 'ai-title', title: 'Auth refactor' },
    { type: 'user', message: { content: 'make login work' } },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: 'auth.ts' } },
          { type: 'text', text: 'Done.' },
        ],
      },
    },
    { type: 'queue-operation', operation: 'enqueue' },
  ]
  assert.equal(
    buildDigestSource(entries),
    'Title: Auth refactor\nUser: make login work\nTool: Edit(auth.ts)\nAssistant: Done.',
  )
})

test('buildDigestSource keeps the most recent content within the cap', () => {
  const entries = [
    { type: 'user', message: { content: 'A'.repeat(100) } },
    { type: 'user', message: { content: 'recent' } },
  ]
  const out = buildDigestSource(entries, 20)
  assert.ok(out.startsWith('…'))
  assert.ok(out.endsWith('recent'))
  assert.ok(out.length <= 21)
})

test('distillTranscript reads a jsonl fixture', async () => {
  const p = path.join(
    here,
    'fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl',
  )
  const out = await distillTranscript(p)
  assert.match(out, /Title: Refactoring the auth flow/)
  assert.match(out, /Tool: Edit/)
})

test('distillTranscript on a missing file returns empty string', async () => {
  assert.equal(await distillTranscript('/no/such.jsonl'), '')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='buildDigestSource|distillTranscript'`
Expected: FAIL — `Cannot find module '../src/server/transcript-distiller.js'`.

- [ ] **Step 3: Implement the distiller**

Create `src/server/transcript-distiller.ts`:

```ts
import fs from 'node:fs'
import readline from 'node:readline'

const DEFAULT_CAP = 24000 // ~6k tokens

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join(' ')
  }
  return ''
}

function briefArg(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const v = o.file_path ?? o.command ?? o.path ?? o.pattern ?? o.url
  if (typeof v !== 'string') return ''
  return v.length > 60 ? v.slice(0, 60) + '…' : v
}

/** Pure: distilled, labeled extract from parsed transcript entries.
 *  Keeps the most recent content when over `capChars`. */
export function buildDigestSource(entries: any[], capChars = DEFAULT_CAP): string {
  const lines: string[] = []
  for (const d of entries) {
    if (!d || typeof d !== 'object') continue
    if (d.type === 'ai-title' && d.title) {
      lines.push(`Title: ${d.title}`)
    } else if (d.type === 'user' && d.message) {
      const t = textOf(d.message.content).trim()
      if (t) lines.push(`User: ${t}`)
    } else if (d.type === 'assistant' && d.message) {
      for (const c of d.message.content || []) {
        if (c?.type === 'tool_use') {
          const arg = briefArg(c.input)
          lines.push(`Tool: ${c.name}${arg ? `(${arg})` : ''}`)
        } else if (c?.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
          lines.push(`Assistant: ${c.text.trim()}`)
        }
      }
    }
  }
  const joined = lines.join('\n')
  if (joined.length <= capChars) return joined
  return '…' + joined.slice(joined.length - capChars)
}

/** Stream-read a transcript .jsonl and distill it. Missing/empty → ''. */
export async function distillTranscript(file: string): Promise<string> {
  let stream: fs.ReadStream
  try {
    stream = fs.createReadStream(file, { encoding: 'utf8' })
  } catch {
    return ''
  }
  stream.on('error', () => {})
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  const entries: any[] = []
  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        /* skip partial line */
      }
    }
  } catch {
    /* return what we have */
  }
  return buildDigestSource(entries)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='buildDigestSource|distillTranscript'`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/server/transcript-distiller.ts test/transcript-distiller.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): transcript distiller (pure buildDigestSource + reader)"
```

---

## Task 4: Summary writer (upsert `## Summary`)

**Files:**
- Create: `src/server/summary-writer.ts`
- Test: `test/summary-writer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/summary-writer.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  upsertSummarySection,
  writeSummary,
  hasSummary,
} from '../src/server/summary-writer.js'

const PAGE =
  '---\ntype: session\n---\n\n# Title\n\nProject: [[Demo]]\n\n## Timeline\n- 10:00 appeared\n'

test('inserts ## Summary before ## Timeline when absent', () => {
  const out = upsertSummarySection(PAGE, 'TL;DR digest')
  assert.ok(out.includes('## Summary'))
  assert.ok(out.indexOf('## Summary') < out.indexOf('## Timeline'))
  assert.ok(out.includes('TL;DR digest'))
  assert.ok(out.includes('## Timeline')) // preserved
  assert.ok(out.startsWith('---\ntype: session')) // frontmatter preserved
})

test('replaces an existing ## Summary block, only one remains', () => {
  const withOld = upsertSummarySection(PAGE, 'OLD summary')
  const out = upsertSummarySection(withOld, 'NEW summary')
  assert.ok(out.includes('NEW summary'))
  assert.ok(!out.includes('OLD summary'))
  assert.equal(out.match(/## Summary/g)!.length, 1)
  assert.ok(out.includes('## Timeline'))
})

test('hasSummary + writeSummary round-trip on a real file; missing page is a no-op', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-vault-'))
  fs.mkdirSync(path.join(vault, 'Sessions'), { recursive: true })
  fs.writeFileSync(path.join(vault, 'Sessions', 's1.md'), PAGE)

  assert.equal(hasSummary(vault, 's1'), false)
  writeSummary(vault, 's1', 'the digest')
  assert.equal(hasSummary(vault, 's1'), true)
  assert.match(fs.readFileSync(path.join(vault, 'Sessions', 's1.md'), 'utf8'), /the digest/)

  // missing page → no throw, no file created
  writeSummary(vault, 'ghost', 'x')
  assert.equal(fs.existsSync(path.join(vault, 'Sessions', 'ghost.md')), false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='## Summary|round-trip'`
Expected: FAIL — `Cannot find module '../src/server/summary-writer.js'`.

- [ ] **Step 3: Implement the writer**

Create `src/server/summary-writer.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

/** Pure: replace an existing `## Summary` block, else insert one before
 *  `## Timeline` (else append). Preserves frontmatter and other sections. */
export function upsertSummarySection(md: string, summary: string): string {
  const block = `## Summary\n\n${summary.trim()}`
  const lines = md.split('\n')

  const start = lines.findIndex((l) => l.trim() === '## Summary')
  if (start !== -1) {
    let end = start + 1
    while (end < lines.length && !lines[end].startsWith('## ')) end++
    const next = [...lines.slice(0, start), block, '', ...lines.slice(end)]
    return next.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  const tl = lines.findIndex((l) => l.trim() === '## Timeline')
  if (tl !== -1) {
    const next = [...lines.slice(0, tl), block, '', ...lines.slice(tl)]
    return next.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  return md.replace(/\n+$/, '') + '\n\n' + block + '\n'
}

function sessionFile(vault: string, sessionId: string): string {
  return path.join(vault, 'Sessions', `${sessionId}.md`)
}

export function hasSummary(vault: string, sessionId: string): boolean {
  try {
    return /^## Summary\s*$/m.test(fs.readFileSync(sessionFile(vault, sessionId), 'utf8'))
  } catch {
    return false
  }
}

export function writeSummary(vault: string, sessionId: string, summary: string): void {
  const f = sessionFile(vault, sessionId)
  let md: string
  try {
    md = fs.readFileSync(f, 'utf8')
  } catch {
    return // no page to anchor the section onto
  }
  fs.writeFileSync(f, upsertSummarySection(md, summary))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='## Summary|round-trip'`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/server/summary-writer.ts test/summary-writer.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): summary-writer (idempotent ## Summary upsert)"
```

---

## Task 5: Settings store (runtime toggle persistence)

**Files:**
- Create: `src/server/settings.ts`
- Test: `test/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/settings.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SettingsStore } from '../src/server/settings.js'

test('missing file falls back to defaults', () => {
  const s = new SettingsStore('/no/such/dir/settings.json', { summaries: false })
  assert.equal(s.get().summaries, false)
})

test('patch persists; a fresh store reading the same file sees it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-set-'))
  const file = path.join(dir, 'settings.json')
  const s = new SettingsStore(file, { summaries: false })
  const next = s.patch({ summaries: true })
  assert.equal(next.summaries, true)
  const reloaded = new SettingsStore(file, { summaries: false })
  assert.equal(reloaded.get().summaries, true)
})

test('patch write failure is swallowed (no throw)', () => {
  // a path whose parent is a file, not a dir → mkdir/write fails internally
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-set-'))
  const asFile = path.join(dir, 'afile')
  fs.writeFileSync(asFile, 'x')
  const s = new SettingsStore(path.join(asFile, 'settings.json'), { summaries: false })
  assert.equal(s.patch({ summaries: true }).summaries, true) // returns, no throw
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='falls back to defaults|patch persists'`
Expected: FAIL — `Cannot find module '../src/server/settings.js'`.

- [ ] **Step 3: Implement the store**

Create `src/server/settings.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../shared/types.js'

export class SettingsStore {
  private current: Settings

  constructor(
    private file: string,
    defaults: Settings,
  ) {
    this.current = { ...defaults }
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (raw && typeof raw === 'object') this.current = { ...defaults, ...raw }
    } catch {
      /* missing or corrupt → keep defaults */
    }
  }

  get(): Settings {
    return { ...this.current }
  }

  patch(partial: Partial<Settings>): Settings {
    this.current = { ...this.current, ...partial }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.current, null, 2))
    } catch {
      /* best-effort persistence — never throw */
    }
    return this.get()
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='falls back to defaults|patch persists|write failure'`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/server/settings.ts test/settings.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): SettingsStore (persisted runtime toggle)"
```

---

## Task 6: Summarizer (pure `summarize` + `claude -p` runner)

**Files:**
- Create: `src/server/summarizer.ts`
- Test: `test/summarizer.test.ts`

- [ ] **Step 1: Write the failing test** (pure `summarize` only — `spawnClaudeRunner`/`isClaudeAvailable` are exercised by the smoke test, not unit tests)

Create `test/summarizer.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../src/server/summarizer.js'

test('summarize trims the runner output', async () => {
  const out = await summarize('source', { run: async () => '  digest  ', model: 'haiku' })
  assert.equal(out, 'digest')
})

test('empty source returns empty and does not call the runner', async () => {
  let called = false
  const out = await summarize('   ', {
    run: async () => {
      called = true
      return 'x'
    },
    model: 'haiku',
  })
  assert.equal(out, '')
  assert.equal(called, false)
})

test('summarize passes source + model through to the runner', async () => {
  let got: unknown
  await summarize('src', {
    run: async (a) => {
      got = a
      return 'd'
    },
    model: 'sonnet',
  })
  assert.deepEqual(got, { source: 'src', model: 'sonnet' })
})

test('a throwing runner propagates (so the service can catch it)', async () => {
  await assert.rejects(
    summarize('src', {
      run: async () => {
        throw new Error('boom')
      },
      model: 'haiku',
    }),
    /boom/,
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='summarize trims|empty source returns'`
Expected: FAIL — `Cannot find module '../src/server/summarizer.js'`.

- [ ] **Step 3: Implement the summarizer**

Create `src/server/summarizer.ts`:

```ts
import fs from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { SUMMARIZER_CWD } from './config.js'

export type SummaryRunner = (args: {
  source: string
  model: string
}) => Promise<string>

const SYSTEM_PROMPT = [
  'You summarize a Claude Code coding session from a distilled transcript.',
  'Reply with GitHub-flavored markdown using EXACTLY these sections, nothing else:',
  '',
  '**TL;DR:** <one sentence>',
  '',
  '**What got done**',
  '- <bullets>',
  '',
  '**Key decisions**',
  '- <bullets, or "- none">',
  '',
  '**Files touched**',
  '- `<path>` <or "- none">',
  '',
  '**Open / next steps**',
  '- [ ] <items, or "- none">',
  '',
  'Be concise. Do not invent anything not present in the transcript.',
].join('\n')

/** Pure-ish: empty source → ''. Otherwise run the injected runner, trimmed. */
export async function summarize(
  source: string,
  deps: { run: SummaryRunner; model: string },
): Promise<string> {
  if (!source.trim()) return ''
  const out = await deps.run({ source, model: deps.model })
  return out.trim()
}

/** True if the `claude` CLI is invokable. */
export function isClaudeAvailable(claudeBin: string): boolean {
  try {
    return spawnSync(claudeBin, ['--version'], { timeout: 5000 }).status === 0
  } catch {
    return false
  }
}

/** Real runner: headless `claude -p` in the dedicated summarizer cwd. */
export function spawnClaudeRunner(claudeBin: string): SummaryRunner {
  return ({ source, model }) =>
    new Promise<string>((resolve, reject) => {
      try {
        fs.mkdirSync(SUMMARIZER_CWD, { recursive: true })
      } catch {
        /* fall through; spawn will surface a real error if cwd is unusable */
      }
      let out = ''
      let err = ''
      const child = spawn(
        claudeBin,
        [
          '-p',
          '--model',
          model,
          '--output-format',
          'text',
          '--disallowedTools',
          '*',
          '--append-system-prompt',
          SYSTEM_PROMPT,
        ],
        { cwd: SUMMARIZER_CWD },
      )
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('summary timed out'))
      }, 60_000)
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err += d))
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(out)
        else reject(new Error(`claude exited ${code}: ${err.slice(0, 200)}`))
      })
      child.stdin.end(source)
    })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='summarize trims|empty source|passes source|throwing runner'`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/server/summarizer.ts test/summarizer.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): summarizer (pure summarize + claude -p runner)"
```

---

## Task 7: Summary service (coordinator)

**Files:**
- Create: `src/server/summary-service.ts`
- Test: `test/summary-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/summary-service.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SummaryService } from '../src/server/summary-service.js'
import { SettingsStore } from '../src/server/settings.js'
import type { Config, Session } from '../src/shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const claudeHome = path.join(here, 'fixtures/claude-home') // has projects/-tmp-Demo/aaaa1111.jsonl

function makeCfg(vault: string): Config {
  return {
    claudeHome,
    host: '127.0.0.1',
    port: 0,
    vaultPath: vault,
    pollIntervalMs: 1000,
    staleIdleMs: 5 * 60_000,
    logContent: false,
    summaryModel: 'haiku',
    claudeBin: 'claude',
    settingsPath: '/tmp/ccc-test-settings.json',
  }
}

function seededVault(): string {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-svc-'))
  fs.mkdirSync(path.join(vault, 'Sessions'), { recursive: true })
  fs.writeFileSync(
    path.join(vault, 'Sessions', 'aaaa1111.md'),
    '---\ntype: session\n---\n\n# T\n\n## Timeline\n- 10:00 appeared\n',
  )
  return vault
}

const session = { sessionId: 'aaaa1111', project: { name: 'Demo', cwd: '/tmp/Demo' } } as Session

const okRun = async () => '**TL;DR:** Did the thing.\n\n**What got done**\n- stuff'

test('disabled when the toggle is off', async () => {
  const vault = seededVault()
  const settings = new SettingsStore('/tmp/none.json', { summaries: false })
  const svc = new SummaryService(makeCfg(vault), settings, okRun)
  assert.deepEqual(await svc.maybeSummarize(session), { ok: true, status: 'disabled' })
})

test('writes a summary when on, then skips on the auto path, regenerates on force', async () => {
  const vault = seededVault()
  const settings = new SettingsStore('/tmp/none.json', { summaries: true })
  const svc = new SummaryService(makeCfg(vault), settings, okRun)

  const first = await svc.maybeSummarize(session)
  assert.equal(first.status, 'written')
  assert.equal(first.tldr, 'Did the thing.')
  assert.match(
    fs.readFileSync(path.join(vault, 'Sessions', 'aaaa1111.md'), 'utf8'),
    /## Summary[\s\S]*Did the thing\./,
  )

  const auto = await svc.maybeSummarize(session) // already summarized
  assert.equal(auto.status, 'skipped')

  const forced = await svc.maybeSummarize(session, { force: true })
  assert.equal(forced.status, 'written')
})

test('a throwing runner yields an error result, not a crash', async () => {
  const vault = seededVault()
  const settings = new SettingsStore('/tmp/none.json', { summaries: true })
  const svc = new SummaryService(makeCfg(vault), settings, async () => {
    throw new Error('boom')
  })
  const r = await svc.maybeSummarize(session, { force: true })
  assert.equal(r.ok, false)
  assert.equal(r.status, 'error')
  assert.match(r.error!, /boom/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='disabled when the toggle|writes a summary when on'`
Expected: FAIL — `Cannot find module '../src/server/summary-service.js'`.

- [ ] **Step 3: Implement the service**

Create `src/server/summary-service.ts`:

```ts
import type { Config, Session, SummaryResult } from '../shared/types.js'
import { discover } from './discovery.js'
import { findTranscriptPath } from './transcript-reader.js'
import { distillTranscript } from './transcript-distiller.js'
import { summarize, type SummaryRunner } from './summarizer.js'
import { hasSummary, writeSummary } from './summary-writer.js'
import type { SettingsStore } from './settings.js'

function tldrOf(summary: string): string | undefined {
  const m = summary.match(/\*\*TL;DR:\*\*\s*(.+)/)
  return m ? m[1].trim() : undefined
}

export class SummaryService {
  constructor(
    private cfg: Config,
    private settings: SettingsStore,
    private run: SummaryRunner,
  ) {}

  async maybeSummarize(
    session: Session,
    opts: { force?: boolean } = {},
  ): Promise<SummaryResult> {
    try {
      if (!this.settings.get().summaries) return { ok: true, status: 'disabled' }
      if (!opts.force && hasSummary(this.cfg.vaultPath, session.sessionId))
        return { ok: true, status: 'skipped' }

      const d = discover(this.cfg.claudeHome)
      if (!d.ok) return { ok: true, status: 'skipped' }

      const tpath = findTranscriptPath(d.projectsDir, session.sessionId)
      const source = tpath ? await distillTranscript(tpath) : ''
      if (!source.trim()) return { ok: true, status: 'skipped' }

      const summary = await summarize(source, {
        run: this.run,
        model: this.cfg.summaryModel,
      })
      if (!summary) return { ok: true, status: 'skipped' }

      writeSummary(this.cfg.vaultPath, session.sessionId, summary)
      return { ok: true, status: 'written', tldr: tldrOf(summary) }
    } catch (e) {
      return { ok: false, status: 'error', error: String((e as Error)?.message ?? e) }
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='disabled when the toggle|writes a summary when on|throwing runner yields'`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/server/summary-service.ts test/summary-service.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): SummaryService coordinator (guards + error isolation)"
```

---

## Task 8: Server endpoints (settings + summarize)

**Files:**
- Modify: `src/server/server.ts`
- Test: `test/server.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/server.test.ts`, add imports at the top (after the existing imports):

```ts
import os from 'node:os'
import fs from 'node:fs'
import { SettingsStore } from '../src/server/settings.js'
import { SummaryService } from '../src/server/summary-service.js'
```

Add a helper that builds server deps, after the `cfg` literal:

```ts
function makeDeps(summaries: boolean, claudeAvailable = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-srv-'))
  const settings = new SettingsStore(path.join(dir, 's.json'), { summaries })
  const summaryService = new SummaryService(cfg, settings, async () => '**TL;DR:** x')
  return { settings, summaryService, claudeAvailable }
}
```

Update the existing `GET /api/state` test's `createServer` call to pass deps:

```ts
  const app = createServer(store, hub, here, makeDeps(false))
```

Then add:

```ts
test('GET /api/settings returns settings + claudeAvailable', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const app = createServer(store, new Hub(store), here, makeDeps(false, true))
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/api/settings`)
  const body = (await res.json()) as { summaries: boolean; claudeAvailable: boolean }
  assert.equal(body.summaries, false)
  assert.equal(body.claudeAvailable, true)
  srv.close()
})

test('PATCH /api/settings toggles summaries', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const app = createServer(store, new Hub(store), here, makeDeps(false))
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries: true }),
  })
  const body = (await res.json()) as { summaries: boolean }
  assert.equal(body.summaries, true)
  srv.close()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern='GET /api/settings|PATCH /api/settings'`
Expected: FAIL — `createServer` expects 3 args / `deps` undefined (route 404s or throws).

- [ ] **Step 3: Implement the endpoints**

Replace the contents of `src/server/server.ts` with:

```ts
import express from 'express'
import type { SessionStore } from './session-model.js'
import type { Hub } from './watcher.js'
import type { SettingsStore } from './settings.js'
import type { SummaryService } from './summary-service.js'

export interface ServerDeps {
  settings: SettingsStore
  summaryService: SummaryService
  claudeAvailable: boolean
  onSummariesEnabled?: () => void
}

export function createServer(
  store: SessionStore,
  hub: Hub,
  webRoot: string,
  deps: ServerDeps,
) {
  const app = express()
  app.use(express.json())

  app.get('/api/state', (_req, res) => {
    res.json(store.all())
  })

  app.get('/api/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.flushHeaders()
    res.write(`event: snapshot\ndata: ${JSON.stringify(store.all())}\n\n`)
    const unsub = hub.subscribe((ev) => {
      res.write(`event: ${ev.kind}\ndata: ${JSON.stringify(ev.session)}\n\n`)
    })
    req.on('close', () => {
      unsub()
    })
  })

  app.get('/api/settings', (_req, res) => {
    res.json({ ...deps.settings.get(), claudeAvailable: deps.claudeAvailable })
  })

  app.patch('/api/settings', (req, res) => {
    const wasOff = !deps.settings.get().summaries
    const patch =
      typeof req.body?.summaries === 'boolean'
        ? { summaries: req.body.summaries as boolean }
        : {}
    const next = deps.settings.patch(patch)
    if (wasOff && next.summaries) deps.onSummariesEnabled?.()
    res.json({ ...next, claudeAvailable: deps.claudeAvailable })
  })

  app.post('/api/sessions/:id/summarize', async (req, res) => {
    const s = store.all().find((x) => x.sessionId === req.params.id)
    if (!s) {
      res.status(404).json({ ok: false, status: 'error', error: 'unknown session' })
      return
    }
    res.json(await deps.summaryService.maybeSummarize(s, { force: true }))
  })

  app.use(express.static(webRoot)) // serves the built React app
  return app
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --test-name-pattern='api/state|api/settings'`
Expected: PASS (the updated state test + both settings tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/server.ts test/server.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): settings + summarize endpoints"
```

---

## Task 9: Wire it up in `index.ts` (auto-trigger + startup logs)

**Files:**
- Modify: `src/server/index.ts`

*(Wiring — verified by `npm run build` + `npm test`; the pipeline itself is covered by Tasks 6–8.)*

- [ ] **Step 1: Add imports**

In `src/server/index.ts`, add after the `createServer` import (line 9):

```ts
import { createServer } from './server.js'
import { SettingsStore } from './settings.js'
import { SummaryService } from './summary-service.js'
import { spawnClaudeRunner, isClaudeAvailable } from './summarizer.js'
```

- [ ] **Step 2: Construct settings + service and wire the auto-trigger**

In `src/server/index.ts`, after the EventLog wiring (`hub.subscribe((ev) => log.record(ev))`, line 22), add:

```ts
  const settings = new SettingsStore(cfg.settingsPath, { summaries: false })
  const claudeAvailable = isClaudeAvailable(cfg.claudeBin)
  const summaryService = new SummaryService(
    cfg,
    settings,
    spawnClaudeRunner(cfg.claudeBin),
  )
  const announceSummaries = () =>
    console.log(
      `  📝 summaries ON — distilled transcript content is sent to Anthropic via "claude -p" (${cfg.summaryModel})`,
    )
  hub.subscribe((ev) => {
    if (ev.kind === 'ended') void summaryService.maybeSummarize(ev.session)
  })
```

- [ ] **Step 3: Pass deps to `createServer` and add startup logs**

Change the `createServer` call (line 28) to pass deps:

```ts
  const app = createServer(store, hub, webRoot, {
    settings,
    summaryService,
    claudeAvailable,
    onSummariesEnabled: announceSummaries,
  })
```

And inside the `app.listen` callback, after the existing LAN warning block (line 36), add:

```ts
    if (settings.get().summaries) announceSummaries()
    if (!claudeAvailable) {
      console.log(
        '  ⚠  summaries: `claude` CLI not found on PATH — summaries will error until installed.\n',
      )
    }
```

- [ ] **Step 4: Verify build + full suite**

Run: `npm run build` then `npm test`
Expected: `tsc` clean, `vite build` succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): wire summaries (auto on end + startup logs)"
```

---

## Task 10: Web — settings API, ⚙ panel, gear button

**Files:**
- Modify: `src/web/api.ts`
- Create: `src/web/components/SettingsPanel.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/office.css`

*(React/CSS — no jsdom; verified by `npm run build` + Kevin's visual smoke test.)*

- [ ] **Step 1: Add the API helpers**

In `src/web/api.ts`, add at the bottom:

```ts
import type { Settings, SummaryResult } from '../shared/types.js'

export type SettingsView = Settings & { claudeAvailable: boolean }

export async function getSettings(): Promise<SettingsView> {
  const r = await fetch('/api/settings')
  return r.json()
}

export async function updateSettings(patch: Partial<Settings>): Promise<SettingsView> {
  const r = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return r.json()
}

export async function summarizeSession(id: string): Promise<SummaryResult> {
  const r = await fetch(`/api/sessions/${encodeURIComponent(id)}/summarize`, {
    method: 'POST',
  })
  return r.json()
}
```

(The existing `import type { Session }` line at the top stays; this second `import type` is fine — keep it next to the new code or merge it into the top import.)

- [ ] **Step 2: Create the settings panel**

Create `src/web/components/SettingsPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { getSettings, updateSettings, type SettingsView } from '../api.js'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SettingsView | null>(null)

  useEffect(() => {
    getSettings().then(setS)
  }, [])

  async function toggleSummaries(v: boolean) {
    setS((prev) => (prev ? { ...prev, summaries: v } : prev))
    setS(await updateSettings({ summaries: v }))
  }

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h3>⚙ Settings</h3>
        {!s ? (
          <p className="detail-row">Loading…</p>
        ) : (
          <label className="setting-row">
            <input
              type="checkbox"
              checked={s.summaries}
              disabled={!s.claudeAvailable}
              onChange={(e) => toggleSummaries(e.target.checked)}
            />
            <span>
              AI session summaries <small>(uses local Claude Code)</small>
              {!s.claudeAvailable && (
                <em className="setting-warn"> — `claude` CLI not found</em>
              )}
            </span>
          </label>
        )}
        <button className="detail-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the gear button to `App.tsx`**

In `src/web/App.tsx`, update the import and state, and render the panel.

Change the imports (lines 1-4):

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '../shared/types.js'
import { subscribe } from './api.js'
import { Office } from './components/Office.js'
import { SettingsPanel } from './components/SettingsPanel.js'
```

Add state inside `App`, after the `sessions` state (line 7):

```tsx
  const [showSettings, setShowSettings] = useState(false)
```

Replace the `<h1>` line (line 40) with a header row that includes the gear:

```tsx
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        🎮 Claude Command Center
        <button
          className="gear"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </h1>
```

Add the panel render just before the closing `</div>` (after `<Office ... />`, line 46):

```tsx
      <Office sessions={sessions} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
```

- [ ] **Step 4: Add styles**

In `src/web/office.css`, append:

```css
.gear {
  all: unset;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  opacity: 0.7;
}
.gear:hover { opacity: 1; }
.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  margin: 6px 0;
  cursor: pointer;
}
.setting-row small { color: #9a8d78; }
.setting-warn { color: #ffb84d; font-style: normal; }
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `tsc` clean, `vite build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/web/api.ts src/web/components/SettingsPanel.tsx src/web/App.tsx src/web/office.css
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(web): settings API + ⚙ panel with summaries toggle"
```

---

## Task 11: Web — "↻ Summarize" button in the detail card

**Files:**
- Modify: `src/web/components/CharacterDetail.tsx`
- Modify: `src/web/office.css`

*(React/CSS — verified by `npm run build` + Kevin's visual smoke test.)*

- [ ] **Step 1: Add the button + state**

In `src/web/components/CharacterDetail.tsx`, update imports (lines 1-2):

```tsx
import { useState } from 'react'
import type { Session } from '../../shared/types.js'
import { agentName } from '../agentName.js'
import { modelLabel, permissionBadge } from '../badges.js'
import { summarizeSession } from '../api.js'
```

(If the `modelLabel, permissionBadge` import is already present from Tier 2b, keep it; just add the `useState` and `summarizeSession` imports.)

Inside the component body, before the `return`, add:

```tsx
  const [sum, setSum] = useState<{
    state: 'idle' | 'pending' | 'done' | 'error'
    tldr?: string
    error?: string
  }>({ state: 'idle' })

  async function onSummarize() {
    setSum({ state: 'pending' })
    try {
      const r = await summarizeSession(s.sessionId)
      if (r.status === 'disabled') {
        setSum({ state: 'error', error: 'summaries are off — enable in ⚙' })
      } else if (r.ok && r.status === 'written') {
        setSum({ state: 'done', tldr: r.tldr })
      } else if (r.ok) {
        setSum({ state: 'done' }) // skipped (e.g. nothing to summarize)
      } else {
        setSum({ state: 'error', error: r.error })
      }
    } catch (e) {
      setSum({ state: 'error', error: String(e) })
    }
  }
```

Add the button + status rows just before the `<button className="detail-close" ...>` line:

```tsx
        <button
          className="detail-summarize"
          onClick={onSummarize}
          disabled={sum.state === 'pending'}
        >
          {sum.state === 'pending' ? '… summarizing' : '↻ Summarize'}
        </button>
        {sum.state === 'done' && (
          <p className="detail-row">📝 {sum.tldr ?? 'written to vault'}</p>
        )}
        {sum.state === 'error' && <p className="detail-row">⚠ {sum.error}</p>}
```

- [ ] **Step 2: Add the button style**

In `src/web/office.css`, append:

```css
.detail-summarize {
  margin-top: 12px;
  margin-right: 8px;
  background: #243a2c;
  color: #d7f2e0;
  border: 1px solid #3c5c46;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
.detail-summarize:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `tsc` clean, `vite build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/CharacterDetail.tsx src/web/office.css
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(web): ↻ Summarize button in the detail card"
```

- [ ] **Step 5: Visual smoke test (Kevin)**

`npm run build` then run the server; on the phone/desktop:
1. Open ⚙ → toggle **AI session summaries** on (the privacy line prints in the server log).
2. Tap a session → **↻ Summarize** → confirm the TL;DR appears inline and a `## Summary`
   lands in `Sessions/<id>.md` in the vault.
3. End a session (close a Claude Code session) with summaries on → confirm its page gets a
   `## Summary` automatically, and that **no extra character** flickers onto the board from
   the summarizer run.

---

## Final verification

- [ ] **Full suite:** `npm test` → all pass (expect ~47 prior + ~18 new ≈ 65).
- [ ] **Build clean:** `npm run build` → no `tsc` errors, `vite build` succeeds.
- [ ] **Finish the branch:** use `superpowers:finishing-a-development-branch` → push + open a PR (per-tier PR flow standardized from Tier 2b).

---

## Self-Review (against the spec)

**Spec coverage:**
- Auto-on-end trigger → Task 9 (`hub.subscribe` `ended`) ✓
- Manual button trigger → Task 8 (`POST /summarize`) + Task 11 (button) ✓
- Headless `claude -p` generator, no SDK → Task 6 (`spawnClaudeRunner`) ✓
- `haiku` default model, overridable → Task 1 (`summaryModel`) ✓
- Structured digest shape → Task 6 (`SYSTEM_PROMPT`) ✓
- Distilled extract input, capped → Task 3 (`buildDigestSource` cap) ✓
- Opt-in + **runtime toggle**, live-read → Tasks 5, 7 (`settings.get()` each call), 8, 10 ✓
- Privacy startup/enable log → Task 9 + Task 8 (`onSummariesEnabled`) ✓
- Idempotency (skip if summarized; force regenerates) → Task 7 ✓
- Error isolation (never crash monitoring) → Task 7 (try/catch) ✓
- Self-session loop guard via `SUMMARIZER_CWD` → Tasks 1, 2, 6 ✓
- `## Summary` above `## Timeline` → Task 4 (`upsertSummarySection`) ✓
- Settings panel = first brick of nav system → Task 10 ✓
- Tests: distiller / writer / settings / summarizer / service / session-model / config / server → Tasks 1–8 ✓

**Placeholder scan:** none — every code step has full code. ✓

**Type consistency:** `Settings` + `SummaryResult` defined in Task 1 (`shared/types.ts`), consumed by `settings.ts` (T5), `summary-service.ts` (T7), `server.ts` (T8), `api.ts` (T10). `SummaryRunner` defined in T6, used in T7/T9. `ServerDeps` defined in T8, constructed in T9. `SettingsView` defined in T10, used in `SettingsPanel`. `SUMMARIZER_CWD` defined in T1, used in T2/T6. `maybeSummarize(session, {force})` signature consistent across T7/T8/T9. ✓
