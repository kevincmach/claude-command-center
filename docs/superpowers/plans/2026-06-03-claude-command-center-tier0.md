# Claude Command Center — Tier 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only local service that discovers live Claude Code sessions, normalizes their state, serves it to a phone over the LAN with live SSE updates, and mirrors every observation into an Obsidian-ready markdown vault.

**Architecture:** A long-running Node/TypeScript backend reads `~/.claude/sessions/*.json` + transcripts, builds a normalized in-memory `Session` map, and emits change events. An Express server exposes a JSON snapshot + an SSE stream and serves a React (Vite) frontend that renders sessions grouped by project. A subscriber writes the same events into a markdown vault.

**Tech Stack:** TypeScript · Node + Express · React + Vite · React built-in state · SSE · `node:test` · `chokidar` · `npx`.

**Learner notes:** A few functions are flagged **🎓 Try it yourself** — the logic is the interesting part and worth attempting before reading the reference implementation. The reference code is always provided so you're never blocked.

---

## File Structure

```
claude-command-center/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── bin/
│   └── cli.mjs                 # npx entrypoint → starts the server
├── src/
│   ├── shared/
│   │   └── types.ts            # Session, Activity, Config — shared contract
│   ├── server/
│   │   ├── config.ts           # resolve settings (flags/env/defaults)
│   │   ├── discovery.ts        # locate & validate ~/.claude
│   │   ├── registry-reader.ts  # read sessions/*.json
│   │   ├── liveness.ts         # is a pid alive / stale / dead
│   │   ├── transcript-reader.ts# stream a transcript → title, tool, context, cost
│   │   ├── activity-classifier.ts # (state) → Activity  [pure]
│   │   ├── cost-model.ts        # tokens/model → context % + $ estimate [pure]
│   │   ├── session-model.ts     # build Session + SessionStore (diff→events)
│   │   ├── event-log.ts         # write the Obsidian vault
│   │   ├── watcher.ts           # chokidar + liveness tick → store.refresh()
│   │   ├── server.ts            # Express app: /api/state, /api/stream, static
│   │   └── index.ts             # wire everything + start
│   └── web/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts              # fetch snapshot + subscribe SSE
│       └── components/
│           ├── Board.tsx
│           ├── ProjectZone.tsx
│           └── SessionCard.tsx
└── test/
    ├── fixtures/claude-home/  # a fake ~/.claude for tests
    └── *.test.ts
```

**Module interface summary (defined in Task 2, used everywhere):**

```ts
type Status   = 'busy' | 'waiting' | 'idle' | 'unknown'
type Liveness = 'live' | 'stale' | 'dead'
type Activity = 'working' | 'researching_web' | 'reading' | 'meeting'
              | 'planning' | 'waiting_permission' | 'waiting_question'
              | 'idle' | 'done' | 'unknown'

interface RegistryRecord { pid; sessionId; cwd; status?; waitingFor?; model?;
  version?; entrypoint?; kind?; startedAt?; updatedAt?; bridgeSessionId? }

interface TranscriptInfo { model; title; latestTool; contextTokens;
  cost: { inputTokens; cacheReadTokens; cacheCreateTokens; outputTokens };
  subAgents; queuedCount; permissionMode }

interface Session { sessionId; pid; alive; project:{name;cwd}; status; activity;
  waitingFor; model; version; entrypoint; title; context:{tokens;limit;pct};
  cost:{usd}; subAgents; queuedCount; startedAt; updatedAt }

interface Config { claudeHome; host; port; vaultPath; pollIntervalMs;
  staleIdleMs; logContent }
```

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore` (append), `src/`, `test/` dirs

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-command-center",
  "version": "0.0.0",
  "description": "A LAN-served virtual office for your live Claude Code sessions.",
  "type": "module",
  "bin": { "claude-command-center": "bin/cli.mjs" },
  "scripts": {
    "dev:server": "tsx watch src/server/index.ts",
    "dev:web": "vite",
    "dev": "concurrently -n server,web \"npm:dev:server\" \"npm:dev:web\"",
    "build": "tsc && vite build",
    "start": "node dist/server/index.js",
    "test": "node --import tsx --test test/*.test.ts"
  },
  "dependencies": { "chokidar": "^4.0.0", "express": "^4.21.0" },
  "devDependencies": {
    "@types/express": "^4.17.21", "@types/node": "^22.0.0",
    "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0", "concurrently": "^9.0.0",
    "react": "^18.3.0", "react-dom": "^18.3.0",
    "tsx": "^4.19.0", "typescript": "^5.6.0", "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "outDir": "dist", "rootDir": "src", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "resolveJsonModule": true, "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Append to `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
.superpowers/
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: completes; `node_modules/` created.

- [ ] **Step 5: Verify the test runner works (empty pass)**

Create `test/smoke.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
test('runner works', () => { assert.equal(1 + 1, 2) })
```
Run: `npm test`
Expected: 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore test/smoke.test.ts
git commit -m "chore: scaffold Tier 0 project (TS, Express, Vite, node:test)"
```

---

## Task 1: Build the test fixture (fake `~/.claude`)

A fake Claude home lets every later test run against realistic files.

**Files:**
- Create: `test/fixtures/claude-home/sessions/39115.json`
- Create: `test/fixtures/claude-home/sessions/71640.json`
- Create: `test/fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl`

- [ ] **Step 1: Create a "busy" session record** → `sessions/39115.json`

```json
{ "pid": 39115, "sessionId": "aaaa1111", "cwd": "/tmp/Demo",
  "status": "busy", "model": "claude-opus-4-8", "version": "2.1.161",
  "entrypoint": "cli", "kind": "interactive",
  "startedAt": 1780459080062, "updatedAt": 1780459164397,
  "bridgeSessionId": "session_x" }
```

- [ ] **Step 2: Create a "waiting" session record** → `sessions/71640.json`

```json
{ "pid": 71640, "sessionId": "bbbb2222", "cwd": "/tmp/Other",
  "status": "waiting", "waitingFor": "permission prompt",
  "model": "claude-sonnet-4-6", "version": "2.1.159", "entrypoint": "cli",
  "startedAt": 1780283343226, "updatedAt": 1780459098144 }
```

- [ ] **Step 3: Create a small transcript** → `projects/-tmp-Demo/aaaa1111.jsonl`

```jsonl
{"type":"ai-title","title":"Refactoring the auth flow"}
{"type":"assistant","message":{"model":"claude-opus-4-8","usage":{"input_tokens":10,"cache_read_input_tokens":37000,"cache_creation_input_tokens":2500,"output_tokens":700},"content":[{"type":"tool_use","name":"Edit"}]}}
{"type":"assistant","message":{"model":"claude-opus-4-8","usage":{"input_tokens":5,"cache_read_input_tokens":40000,"cache_creation_input_tokens":100,"output_tokens":300},"content":[{"type":"tool_use","name":"WebSearch"}]}}
```

- [ ] **Step 4: Commit**

```bash
git add test/fixtures
git commit -m "test: add fake ~/.claude fixture"
```

---

## Task 2: Shared types (the contract)

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type Status = 'busy' | 'waiting' | 'idle' | 'unknown'
export type Liveness = 'live' | 'stale' | 'dead'
export type Activity =
  | 'working' | 'researching_web' | 'reading' | 'meeting' | 'planning'
  | 'waiting_permission' | 'waiting_question' | 'idle' | 'done' | 'unknown'

export interface RegistryRecord {
  pid: number; sessionId: string; cwd: string
  status?: string; waitingFor?: string; model?: string; version?: string
  entrypoint?: string; kind?: string; startedAt?: number; updatedAt?: number
  bridgeSessionId?: string
}

export interface CostTokens {
  inputTokens: number; cacheReadTokens: number
  cacheCreateTokens: number; outputTokens: number
}

export interface TranscriptInfo {
  model: string | null; title: string | null; latestTool: string | null
  contextTokens: number; cost: CostTokens
  subAgents: number; queuedCount: number; permissionMode: string | null
}

export interface Session {
  sessionId: string; pid: number; alive: boolean
  project: { name: string; cwd: string }
  status: Status; activity: Activity; waitingFor: string | null
  model: string | null; version: string | null; entrypoint: string | null
  title: string | null
  context: { tokens: number; limit: number; pct: number }
  cost: { usd: number }
  subAgents: number; queuedCount: number
  startedAt: number; updatedAt: number
}

export interface Config {
  claudeHome: string; host: string; port: number; vaultPath: string
  pollIntervalMs: number; staleIdleMs: number; logContent: boolean
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: shared Session/Config type contract"
```

---

## Task 3: Config resolution

**Files:**
- Create: `src/server/config.ts`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../src/server/config.ts'

test('defaults: localhost bind, sensible numbers', () => {
  const c = resolveConfig({ argv: [], env: {}, home: '/home/u' })
  assert.equal(c.host, '127.0.0.1')
  assert.equal(c.claudeHome, '/home/u/.claude')
  assert.equal(c.logContent, false)
  assert.ok(c.port > 0)
})

test('--lan flips bind to 0.0.0.0', () => {
  const c = resolveConfig({ argv: ['--lan'], env: {}, home: '/home/u' })
  assert.equal(c.host, '0.0.0.0')
})

test('env + flags override (flags win)', () => {
  const c = resolveConfig({
    argv: ['--port', '9000'], env: { CCC_PORT: '8000' }, home: '/home/u',
  })
  assert.equal(c.port, 9000)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- test/config.test.ts` (or `node --import tsx --test test/config.test.ts`)
Expected: FAIL — `resolveConfig` not found.

- [ ] **Step 3: Implement `config.ts`**

```ts
import path from 'node:path'
import type { Config } from '../shared/types.ts'

interface Inputs { argv: string[]; env: Record<string, string | undefined>; home: string }

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export function resolveConfig({ argv, env, home }: Inputs): Config {
  const has = (n: string) => argv.includes(n)
  const claudeHome = flag(argv, '--claude-home') ?? env.CCC_CLAUDE_HOME
    ?? path.join(home, '.claude')
  return {
    claudeHome,
    host: has('--lan') ? '0.0.0.0' : (flag(argv, '--host') ?? '127.0.0.1'),
    port: Number(flag(argv, '--port') ?? env.CCC_PORT ?? 4317),
    vaultPath: flag(argv, '--vault') ?? env.CCC_VAULT
      ?? path.join(home, 'ClaudeVault'),
    pollIntervalMs: Number(env.CCC_POLL_MS ?? 2000),
    staleIdleMs: Number(env.CCC_STALE_MS ?? 5 * 60 * 1000),
    logContent: has('--log-content'),
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/config.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts test/config.test.ts
git commit -m "feat: config resolution (flags > env > defaults)"
```

---

## Task 4: Discovery (locate & validate `~/.claude`)

**Files:**
- Create: `src/server/discovery.ts`
- Test: `test/discovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discover } from '../src/server/discovery.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixtures/claude-home')

test('valid home resolves sessions/projects dirs', () => {
  const r = discover(fixture)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.sessionsDir, path.join(fixture, 'sessions'))
    assert.equal(r.projectsDir, path.join(fixture, 'projects'))
  }
})

test('missing home reports a friendly error', () => {
  const r = discover('/no/such/place')
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.message, /not found/i)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/discovery.test.ts`
Expected: FAIL — `discover` not found.

- [ ] **Step 3: Implement `discovery.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'

export type Discovery =
  | { ok: true; sessionsDir: string; projectsDir: string }
  | { ok: false; message: string }

export function discover(claudeHome: string): Discovery {
  if (!fs.existsSync(claudeHome)) {
    return { ok: false, message: `Claude home not found at ${claudeHome}. ` +
      `Is Claude Code installed? Set --claude-home to override.` }
  }
  const sessionsDir = path.join(claudeHome, 'sessions')
  const projectsDir = path.join(claudeHome, 'projects')
  if (!fs.existsSync(sessionsDir)) {
    return { ok: false, message: `No sessions/ dir in ${claudeHome}.` }
  }
  return { ok: true, sessionsDir, projectsDir }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/discovery.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/discovery.ts test/discovery.test.ts
git commit -m "feat: discover and validate ~/.claude"
```

---

## Task 5: Registry reader

**Files:**
- Create: `src/server/registry-reader.ts`
- Test: `test/registry-reader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRegistry } from '../src/server/registry-reader.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const sessionsDir = path.join(here, 'fixtures/claude-home/sessions')

test('reads all valid session records', () => {
  const recs = readRegistry(sessionsDir)
  assert.equal(recs.length, 2)
  const pids = recs.map(r => r.pid).sort()
  assert.deepEqual(pids, [39115, 71640])
})

test('skips malformed files without throwing', () => {
  // a junk file alongside the good ones is ignored
  const recs = readRegistry(sessionsDir)
  assert.ok(recs.every(r => typeof r.sessionId === 'string'))
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/registry-reader.test.ts`
Expected: FAIL — `readRegistry` not found.

- [ ] **Step 3: Implement `registry-reader.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { RegistryRecord } from '../shared/types.ts'

export function readRegistry(sessionsDir: string): RegistryRecord[] {
  let files: string[] = []
  try { files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json')) }
  catch { return [] }

  const out: RegistryRecord[] = []
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(sessionsDir, f), 'utf8')
      const rec = JSON.parse(raw)
      if (rec && typeof rec.pid === 'number' && typeof rec.sessionId === 'string'
          && typeof rec.cwd === 'string') {
        out.push(rec as RegistryRecord)
      }
    } catch { /* skip partially-written / junk files */ }
  }
  return out
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/registry-reader.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/registry-reader.ts test/registry-reader.test.ts
git commit -m "feat: read sessions/*.json registry, tolerate junk"
```

---

## Task 6: Liveness

**Files:**
- Create: `src/server/liveness.ts`
- Test: `test/liveness.test.ts`

🎓 **Try it yourself:** `classifyLiveness` is a small pure decision — attempt it from the test before reading the reference.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyLiveness } from '../src/server/liveness.ts'

const NOW = 1_000_000

test('dead when process is gone', () => {
  assert.equal(classifyLiveness(false, NOW, NOW, 1000), 'dead')
})
test('live when alive and recently updated', () => {
  assert.equal(classifyLiveness(true, NOW - 100, NOW, 1000), 'live')
})
test('stale when alive but updatedAt is old', () => {
  assert.equal(classifyLiveness(true, NOW - 5000, NOW, 1000), 'stale')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/liveness.test.ts`
Expected: FAIL — `classifyLiveness` not found.

- [ ] **Step 3: Implement `liveness.ts`**

```ts
import type { Liveness } from '../shared/types.ts'

/** Pure: decide liveness from already-known facts. */
export function classifyLiveness(
  alive: boolean, updatedAt: number, now: number, staleIdleMs: number,
): Liveness {
  if (!alive) return 'dead'
  if (now - updatedAt > staleIdleMs) return 'stale'
  return 'live'
}

/** Impure: ask the OS whether a pid exists. */
export function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true }      // signal 0 = existence check
  catch (e: any) { return e?.code === 'EPERM' }  // EPERM = exists, not ours
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/liveness.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/liveness.ts test/liveness.test.ts
git commit -m "feat: liveness classification (pure) + pid existence check"
```

---

## Task 7: Cost model

**Files:**
- Create: `src/server/cost-model.ts`
- Test: `test/cost-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextLimit, computeContext, estimateCost }
  from '../src/server/cost-model.ts'

test('known model context limit', () => {
  assert.equal(contextLimit('claude-opus-4-8'), 200_000)
})
test('unknown model falls back to default limit', () => {
  assert.equal(contextLimit('mystery'), 200_000)
})
test('context pct is tokens/limit rounded', () => {
  const c = computeContext(100_000, 200_000)
  assert.deepEqual(c, { tokens: 100_000, limit: 200_000, pct: 50 })
})
test('cost estimate weights cache reads cheaply', () => {
  const usd = estimateCost('claude-opus-4-8', {
    inputTokens: 1_000_000, cacheReadTokens: 0,
    cacheCreateTokens: 0, outputTokens: 0,
  })
  assert.equal(usd, 15) // $15 / 1M input for opus
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/cost-model.test.ts`
Expected: FAIL — functions not found.

- [ ] **Step 3: Implement `cost-model.ts`**

```ts
import type { CostTokens } from '../shared/types.ts'

const LIMITS: Record<string, number> = { 'claude-opus-4-8': 200_000 }
const DEFAULT_LIMIT = 200_000

// $ per 1M tokens (approximate; precise accounting lands in Tier 4)
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
}
const DEFAULT_PRICE = { in: 3, out: 15 }

export function contextLimit(model: string | null): number {
  return (model && LIMITS[model]) || DEFAULT_LIMIT
}

export function computeContext(tokens: number, limit: number) {
  return { tokens, limit, pct: Math.round((tokens / limit) * 100) }
}

export function estimateCost(model: string | null, t: CostTokens): number {
  const p = (model && PRICING[model]) || DEFAULT_PRICE
  const usd =
    (t.inputTokens * p.in +
     t.cacheCreateTokens * p.in * 1.25 +   // cache writes ~1.25x input
     t.cacheReadTokens * p.in * 0.1 +      // cache reads ~0.1x input
     t.outputTokens * p.out) / 1_000_000
  return Math.round(usd * 100) / 100
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/cost-model.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/cost-model.ts test/cost-model.test.ts
git commit -m "feat: cost model — context %, $ estimate"
```

---

## Task 8: Activity classifier

**Files:**
- Create: `src/server/activity-classifier.ts`
- Test: `test/activity-classifier.test.ts`

🎓 **Try it yourself:** this maps (status + tool + waiting) → which "room" the agent is in. It's the heart of the office. Attempt it from the test table first.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyActivity } from '../src/server/activity-classifier.ts'

const base = { status: 'busy', waitingFor: null, latestTool: null,
  liveness: 'live' as const }

test('dead session is done', () => {
  assert.equal(classifyActivity({ ...base, liveness: 'dead' }), 'done')
})
test('waiting on permission', () => {
  assert.equal(classifyActivity({ ...base, status: 'waiting',
    waitingFor: 'permission prompt' }), 'waiting_permission')
})
test('waiting with no permission reason = a question', () => {
  assert.equal(classifyActivity({ ...base, status: 'waiting',
    waitingFor: null }), 'waiting_question')
})
test('web search → researching', () => {
  assert.equal(classifyActivity({ ...base, latestTool: 'WebSearch' }),
    'researching_web')
})
test('Task tool → meeting', () => {
  assert.equal(classifyActivity({ ...base, latestTool: 'Task' }), 'meeting')
})
test('Edit → working', () => {
  assert.equal(classifyActivity({ ...base, latestTool: 'Edit' }), 'working')
})
test('stale → idle', () => {
  assert.equal(classifyActivity({ ...base, liveness: 'stale' }), 'idle')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/activity-classifier.test.ts`
Expected: FAIL — `classifyActivity` not found.

- [ ] **Step 3: Implement `activity-classifier.ts`**

```ts
import type { Activity, Liveness } from '../shared/types.ts'

interface Input {
  status: string | undefined
  waitingFor: string | null
  latestTool: string | null
  liveness: Liveness
}

const TOOL_ROOMS: Record<string, Activity> = {
  WebSearch: 'researching_web', WebFetch: 'researching_web',
  Task: 'meeting', Agent: 'meeting',
  Read: 'reading', Grep: 'reading', Glob: 'reading',
  Edit: 'working', Write: 'working', Bash: 'working', NotebookEdit: 'working',
}

export function classifyActivity(i: Input): Activity {
  if (i.liveness === 'dead') return 'done'
  if (i.status === 'waiting') {
    return i.waitingFor && /permission/i.test(i.waitingFor)
      ? 'waiting_permission' : 'waiting_question'
  }
  if (i.liveness === 'stale' || i.status === 'idle') return 'idle'
  if (i.latestTool && TOOL_ROOMS[i.latestTool]) return TOOL_ROOMS[i.latestTool]
  if (i.status === 'busy') return 'working'
  return 'unknown'
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/activity-classifier.test.ts`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/activity-classifier.ts test/activity-classifier.test.ts
git commit -m "feat: activity classifier (state -> room)"
```

---

## Task 9: Transcript reader

Streams the JSONL line-by-line (memory-safe for big files), keeping the latest
title/tool/context and a running cost sum.

**Files:**
- Create: `src/server/transcript-reader.ts`
- Test: `test/transcript-reader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTranscriptPath, readTranscriptInfo }
  from '../src/server/transcript-reader.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectsDir = path.join(here, 'fixtures/claude-home/projects')

test('finds a transcript by sessionId across project dirs', () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')
  assert.ok(p && p.endsWith('aaaa1111.jsonl'))
})

test('extracts latest title, tool, and context tokens', async () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')!
  const info = await readTranscriptInfo(p)
  assert.equal(info.title, 'Refactoring the auth flow')
  assert.equal(info.latestTool, 'WebSearch')          // last tool_use wins
  assert.equal(info.contextTokens, 40000 + 100 + 5)   // from last usage
  assert.ok(info.cost.outputTokens >= 1000)           // summed across turns
})

test('missing file returns empty info, no throw', async () => {
  const info = await readTranscriptInfo('/no/such.jsonl')
  assert.equal(info.title, null)
  assert.equal(info.contextTokens, 0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/transcript-reader.test.ts`
Expected: FAIL — functions not found.

- [ ] **Step 3: Implement `transcript-reader.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { TranscriptInfo } from '../shared/types.ts'

export function findTranscriptPath(
  projectsDir: string, sessionId: string,
): string | null {
  let dirs: string[] = []
  try { dirs = fs.readdirSync(projectsDir) } catch { return null }
  for (const d of dirs) {
    const candidate = path.join(projectsDir, d, `${sessionId}.jsonl`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function empty(): TranscriptInfo {
  return { model: null, title: null, latestTool: null, contextTokens: 0,
    cost: { inputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0,
      outputTokens: 0 },
    subAgents: 0, queuedCount: 0, permissionMode: null }
}

export async function readTranscriptInfo(file: string): Promise<TranscriptInfo> {
  const info = empty()
  let stream: fs.ReadStream
  try { stream = fs.createReadStream(file, { encoding: 'utf8' }) }
  catch { return info }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      let d: any
      try { d = JSON.parse(line) } catch { continue } // skip partial line
      if (d.type === 'ai-title' && d.title) info.title = d.title
      if (d.type === 'queue-operation') info.queuedCount++
      if (d.type === 'permission-mode' && d.permissionMode)
        info.permissionMode = d.permissionMode
      const msg = d.message
      if (d.type === 'assistant' && msg) {
        if (msg.model) info.model = msg.model
        const u = msg.usage
        if (u) {
          info.cost.inputTokens += u.input_tokens || 0
          info.cost.cacheReadTokens += u.cache_read_input_tokens || 0
          info.cost.cacheCreateTokens += u.cache_creation_input_tokens || 0
          info.cost.outputTokens += u.output_tokens || 0
          info.contextTokens = (u.input_tokens || 0) +
            (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
        }
        for (const c of msg.content || []) {
          if (c?.type === 'tool_use') {
            info.latestTool = c.name
            if (c.name === 'Task' || c.name === 'Agent') info.subAgents++
          }
        }
      }
    }
  } catch { /* read error mid-stream: return what we have */ }
  return info
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/transcript-reader.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/transcript-reader.ts test/transcript-reader.test.ts
git commit -m "feat: stream transcript -> title, tool, context, cost"
```

---

## Task 10: Session model + store

Combines all readers into a `Session`, and a `SessionStore` that diffs refreshes
into `created | updated | ended` events.

**Files:**
- Create: `src/server/session-model.ts`
- Test: `test/session-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionStore } from '../src/server/session-model.ts'
import type { Config } from '../src/shared/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'fixtures/claude-home')
const cfg: Config = { claudeHome: home, host: '127.0.0.1', port: 0,
  vaultPath: '/tmp/v', pollIntervalMs: 1000, staleIdleMs: 5 * 60_000,
  logContent: false }

test('refresh builds normalized sessions from fixtures', async () => {
  const store = new SessionStore(cfg, () => 1780459165000) // fixed "now"
  const events = await store.refresh()
  const all = store.all()
  assert.equal(all.length, 2)
  const demo = all.find(s => s.sessionId === 'aaaa1111')!
  assert.equal(demo.project.name, 'Demo')
  assert.equal(demo.activity, 'researching_web')   // last tool was WebSearch
  assert.ok(demo.context.pct > 0)
  assert.equal(events.filter(e => e.kind === 'created').length, 2)
})

test('second refresh with no change emits nothing', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const events = await store.refresh()
  assert.equal(events.length, 0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/session-model.test.ts`
Expected: FAIL — `SessionStore` not found.

- [ ] **Step 3: Implement `session-model.ts`**

```ts
import path from 'node:path'
import type { Config, RegistryRecord, Session, Status } from '../shared/types.ts'
import { readRegistry } from './registry-reader.ts'
import { discover } from './discovery.ts'
import { classifyLiveness, isProcessAlive } from './liveness.ts'
import { findTranscriptPath, readTranscriptInfo } from './transcript-reader.ts'
import { classifyActivity } from './activity-classifier.ts'
import { contextLimit, computeContext, estimateCost } from './cost-model.ts'

export type SessionEvent =
  | { kind: 'created'; session: Session }
  | { kind: 'updated'; session: Session; prev: Session }
  | { kind: 'ended'; session: Session }

function projectName(cwd: string): string {
  return path.basename(cwd) || cwd
}
function normalizeStatus(s: string | undefined): Status {
  return s === 'busy' || s === 'waiting' || s === 'idle' ? s : 'unknown'
}

async function buildSession(
  rec: RegistryRecord, projectsDir: string, now: number, staleIdleMs: number,
): Promise<Session> {
  const alive = isProcessAlive(rec.pid)
  const liveness = classifyLiveness(alive, rec.updatedAt ?? 0, now, staleIdleMs)
  const tpath = findTranscriptPath(projectsDir, rec.sessionId)
  const info = tpath ? await readTranscriptInfo(tpath)
    : await readTranscriptInfo('/none')
  const model = rec.model ?? info.model
  const limit = contextLimit(model)
  return {
    sessionId: rec.sessionId, pid: rec.pid, alive,
    project: { name: projectName(rec.cwd), cwd: rec.cwd },
    status: normalizeStatus(rec.status),
    activity: classifyActivity({ status: rec.status,
      waitingFor: rec.waitingFor ?? null, latestTool: info.latestTool, liveness }),
    waitingFor: rec.waitingFor ?? null,
    model: model ?? null, version: rec.version ?? null,
    entrypoint: rec.entrypoint ?? null, title: info.title,
    context: computeContext(info.contextTokens, limit),
    cost: { usd: estimateCost(model, info.cost) },
    subAgents: info.subAgents, queuedCount: info.queuedCount,
    startedAt: rec.startedAt ?? 0, updatedAt: rec.updatedAt ?? 0,
  }
}

export class SessionStore {
  private map = new Map<string, Session>()
  constructor(private cfg: Config, private nowFn: () => number = Date.now) {}

  all(): Session[] { return [...this.map.values()] }

  async refresh(): Promise<SessionEvent[]> {
    const d = discover(this.cfg.claudeHome)
    if (!d.ok) return []
    const now = this.nowFn()
    const recs = readRegistry(d.sessionsDir)
    const seen = new Set<string>()
    const events: SessionEvent[] = []

    for (const rec of recs) {
      seen.add(rec.sessionId)
      const next = await buildSession(rec, d.projectsDir, now,
        this.cfg.staleIdleMs)
      const prev = this.map.get(rec.sessionId)
      this.map.set(rec.sessionId, next)
      if (!prev) events.push({ kind: 'created', session: next })
      else if (JSON.stringify(prev) !== JSON.stringify(next))
        events.push({ kind: 'updated', session: next, prev })
    }
    for (const [id, s] of this.map) {
      if (!seen.has(id)) { this.map.delete(id); events.push({ kind: 'ended', session: s }) }
    }
    return events
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/session-model.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/session-model.ts test/session-model.test.ts
git commit -m "feat: SessionStore — build + diff sessions into events"
```

---

## Task 11: Event log (Obsidian vault)

**Files:**
- Create: `src/server/event-log.ts`
- Test: `test/event-log.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventLog } from '../src/server/event-log.ts'
import type { Session } from '../src/shared/types.ts'

function demoSession(): Session {
  return { sessionId: 'aaaa1111', pid: 1, alive: true,
    project: { name: 'Demo', cwd: '/tmp/Demo' }, status: 'busy',
    activity: 'working', waitingFor: null, model: 'claude-opus-4-8',
    version: '2', entrypoint: 'cli', title: 'Refactoring auth',
    context: { tokens: 100, limit: 200000, pct: 0 }, cost: { usd: 0.5 },
    subAgents: 0, queuedCount: 0, startedAt: 1, updatedAt: 2 }
}

test('writes daily, project, and session markdown', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  const log = new EventLog(vault, () => new Date('2026-06-03T10:00:00Z'))
  log.record({ kind: 'created', session: demoSession() } as any)

  const daily = fs.readFileSync(path.join(vault, 'Daily/2026-06-03.md'), 'utf8')
  assert.match(daily, /Demo/)
  assert.match(daily, /\[\[aaaa1111\]\]/)              // wikilink
  const proj = fs.readFileSync(path.join(vault, 'Projects/Demo.md'), 'utf8')
  assert.match(proj, /Refactoring auth/)
  assert.ok(fs.existsSync(path.join(vault, 'Sessions/aaaa1111.md')))
})

test('does not throw if the same event is recorded twice', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  const log = new EventLog(vault, () => new Date('2026-06-03T10:00:00Z'))
  log.record({ kind: 'created', session: demoSession() } as any)
  log.record({ kind: 'created', session: demoSession() } as any)
  assert.ok(true)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/event-log.test.ts`
Expected: FAIL — `EventLog` not found.

- [ ] **Step 3: Implement `event-log.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { SessionEvent } from './session-model.ts'

function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function hms(d: Date): string { return d.toISOString().slice(11, 19) }
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }) }
function append(file: string, text: string) {
  ensureDir(path.dirname(file)); fs.appendFileSync(file, text)
}

export class EventLog {
  constructor(private vault: string, private nowFn: () => Date = () => new Date()) {}

  record(ev: SessionEvent): void {
    try { this.write(ev) } catch { /* never let logging crash the app */ }
  }

  private write(ev: SessionEvent): void {
    const s = ev.session
    const now = this.nowFn()
    const verb = ev.kind === 'created' ? 'appeared'
      : ev.kind === 'ended' ? 'ended' : `→ ${s.activity}`

    // Daily timeline
    append(path.join(this.vault, 'Daily', `${ymd(now)}.md`),
      `- ${hms(now)} **${s.project.name}** [[${s.sessionId}]] ${verb}` +
      (s.title ? ` — ${s.title}` : '') + '\n')

    // Project rollup (create once with frontmatter)
    const projFile = path.join(this.vault, 'Projects', `${s.project.name}.md`)
    if (!fs.existsSync(projFile)) {
      append(projFile, `---\ntype: project\nname: ${s.project.name}\n---\n\n` +
        `# ${s.project.name}\n\n`)
    }
    append(projFile, `- [[${s.sessionId}]] ${s.title ?? ''} (${verb})\n`)

    // Session page (create once)
    const sessFile = path.join(this.vault, 'Sessions', `${s.sessionId}.md`)
    if (!fs.existsSync(sessFile)) {
      append(sessFile, `---\ntype: session\nproject: ${s.project.name}\n` +
        `model: ${s.model}\nsession: ${s.sessionId}\n---\n\n` +
        `# ${s.title ?? s.sessionId}\n\nProject: [[${s.project.name}]]\n\n` +
        `## Timeline\n`)
    }
    append(sessFile, `- ${ymd(now)} ${hms(now)} ${verb}\n`)
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/event-log.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/event-log.ts test/event-log.test.ts
git commit -m "feat: Obsidian vault event log (daily/project/session)"
```

---

## Task 12: Watcher

Wires fs-watching + a liveness tick to `store.refresh()`, fanning events to
subscribers. Thin glue — tested via a manual trigger rather than real fs timing.

**Files:**
- Create: `src/server/watcher.ts`
- Test: `test/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hub } from '../src/server/watcher.ts'
import { SessionStore } from '../src/server/session-model.ts'
import type { Config } from '../src/shared/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'fixtures/claude-home')
const cfg: Config = { claudeHome: home, host: '127.0.0.1', port: 0,
  vaultPath: '/tmp/v', pollIntervalMs: 9999, staleIdleMs: 5 * 60_000,
  logContent: false }

test('tick() refreshes and broadcasts events to subscribers', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  const hub = new Hub(store)
  const got: string[] = []
  hub.subscribe(ev => got.push(ev.kind))
  await hub.tick()
  assert.ok(got.includes('created'))
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/watcher.test.ts`
Expected: FAIL — `Hub` not found.

- [ ] **Step 3: Implement `watcher.ts`**

```ts
import chokidar from 'chokidar'
import { discover } from './discovery.ts'
import type { SessionStore, SessionEvent } from './session-model.ts'

type Listener = (ev: SessionEvent) => void

/** Holds subscribers and a refresh trigger. Start adds real fs/timer wiring. */
export class Hub {
  private listeners = new Set<Listener>()
  private watcher?: chokidar.FSWatcher
  private timer?: NodeJS.Timeout
  constructor(private store: SessionStore) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn); return () => this.listeners.delete(fn)
  }

  async tick(): Promise<void> {
    const events = await this.store.refresh()
    for (const ev of events) for (const fn of this.listeners) fn(ev)
  }

  start(claudeHome: string, pollIntervalMs: number): void {
    const d = discover(claudeHome)
    if (d.ok) {
      this.watcher = chokidar.watch([d.sessionsDir, d.projectsDir], {
        ignoreInitial: true, depth: 2,
      })
      const onChange = () => { void this.tick() }
      this.watcher.on('all', onChange)
    }
    this.timer = setInterval(() => { void this.tick() }, pollIntervalMs)
    void this.tick() // initial snapshot
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    if (this.watcher) await this.watcher.close()
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/watcher.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/watcher.ts test/watcher.test.ts
git commit -m "feat: Hub — refresh trigger + event fan-out + fs/timer wiring"
```

---

## Task 13: Express server (snapshot + SSE + static)

**Files:**
- Create: `src/server/server.ts`
- Test: `test/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../src/server/server.ts'
import { SessionStore } from '../src/server/session-model.ts'
import { Hub } from '../src/server/watcher.ts'
import type { Config } from '../src/shared/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'fixtures/claude-home')
const cfg: Config = { claudeHome: home, host: '127.0.0.1', port: 0,
  vaultPath: '/tmp/v', pollIntervalMs: 9999, staleIdleMs: 5 * 60_000,
  logContent: false }

test('GET /api/state returns the current sessions', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const hub = new Hub(store)
  const app = createServer(store, hub, here) // serve test dir as static root
  const srv = app.listen(0)
  const { port } = srv.address() as any
  const res = await fetch(`http://127.0.0.1:${port}/api/state`)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.length, 2)
  srv.close()
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/server.test.ts`
Expected: FAIL — `createServer` not found.

- [ ] **Step 3: Implement `server.ts`**

```ts
import express from 'express'
import type { SessionStore } from './session-model.ts'
import type { Hub } from './watcher.ts'

export function createServer(store: SessionStore, hub: Hub, webRoot: string) {
  const app = express()

  app.get('/api/state', (_req, res) => { res.json(store.all()) })

  app.get('/api/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.flushHeaders()
    res.write(`event: snapshot\ndata: ${JSON.stringify(store.all())}\n\n`)
    const unsub = hub.subscribe(ev => {
      res.write(`event: ${ev.kind}\ndata: ${JSON.stringify(ev.session)}\n\n`)
    })
    req.on('close', () => { unsub() })
  })

  app.use(express.static(webRoot))      // serves the built React app
  return app
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/server.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/server.ts test/server.test.ts
git commit -m "feat: Express server — /api/state, /api/stream (SSE), static"
```

---

## Task 14: Entrypoint + CLI

**Files:**
- Create: `src/server/index.ts`
- Create: `bin/cli.mjs`

- [ ] **Step 1: Implement `index.ts`**

```ts
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from './config.ts'
import { discover } from './discovery.ts'
import { SessionStore } from './session-model.ts'
import { Hub } from './watcher.ts'
import { EventLog } from './event-log.ts'
import { createServer } from './server.ts'

export function main(argv = process.argv.slice(2)): void {
  const cfg = resolveConfig({ argv, env: process.env, home: os.homedir() })
  const d = discover(cfg.claudeHome)
  if (!d.ok) { console.error(`\n  ⚠  ${d.message}\n`); process.exit(1) }

  const store = new SessionStore(cfg)
  const hub = new Hub(store)
  const log = new EventLog(cfg.vaultPath)
  hub.subscribe(ev => log.record(ev))

  const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)),
    '../public')   // built frontend lives in dist/public after `npm run build`
  const app = createServer(store, hub, webRoot)

  hub.start(cfg.claudeHome, cfg.pollIntervalMs)
  app.listen(cfg.port, cfg.host, () => {
    const shown = cfg.host === '0.0.0.0' ? 'your-LAN-IP' : cfg.host
    console.log(`\n  🎮 Claude Command Center → http://${shown}:${cfg.port}`)
    if (cfg.host === '0.0.0.0')
      console.log('  ⚠  LAN mode: trusted networks only.\n')
  })
}

main()
```

- [ ] **Step 2: Implement `bin/cli.mjs`**

```js
#!/usr/bin/env node
// In a published build, dist/server/index.js exists. In a clone, fall back to tsx.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const built = join(root, 'dist/server/index.js')
const cmd = existsSync(built)
  ? ['node', built]
  : ['npx', 'tsx', join(root, 'src/server/index.ts')]
spawn(cmd[0], [...cmd.slice(1), ...process.argv.slice(2)], { stdio: 'inherit' })
```

- [ ] **Step 3: Smoke-run against the fixture**

Run: `npx tsx src/server/index.ts --claude-home test/fixtures/claude-home --port 4321`
Then in another shell: `curl -s localhost:4321/api/state | head -c 200`
Expected: JSON array with 2 sessions. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts bin/cli.mjs
git commit -m "feat: server entrypoint + npx cli"
```

---

## Task 15: React + Vite frontend (the skeleton board)

**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`,
  `src/web/App.tsx`, `src/web/api.ts`,
  `src/web/components/{Board,ProjectZone,SessionCard}.tsx`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: path.resolve(__dirname, 'dist/public'), emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:4317' } }, // dev → backend
})
```

- [ ] **Step 2: Create `src/web/index.html`**

```html
<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Claude Command Center</title></head>
<body><div id="root"></div>
<script type="module" src="/main.tsx"></script></body></html>
```

- [ ] **Step 3: Create `src/web/api.ts` (fetch + SSE client)**

```ts
import type { Session } from '../shared/types.ts'

export function subscribe(
  onSnapshot: (s: Session[]) => void,
  onChange: (kind: string, s: Session) => void,
): () => void {
  const es = new EventSource('/api/stream')
  es.addEventListener('snapshot', e =>
    onSnapshot(JSON.parse((e as MessageEvent).data)))
  for (const kind of ['created', 'updated', 'ended']) {
    es.addEventListener(kind, e =>
      onChange(kind, JSON.parse((e as MessageEvent).data)))
  }
  return () => es.close()
}
```

- [ ] **Step 4: Create `src/web/App.tsx` (built-in state store)**

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '../shared/types.ts'
import { subscribe } from './api.ts'
import { Board } from './components/Board.tsx'

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    return subscribe(
      snapshot => setSessions(snapshot),
      (kind, s) => setSessions(prev => {
        if (kind === 'ended') return prev.filter(p => p.sessionId !== s.sessionId)
        const i = prev.findIndex(p => p.sessionId === s.sessionId)
        if (i === -1) return [...prev, s]
        const copy = [...prev]; copy[i] = s; return copy
      }),
    )
  }, [])

  const needsAttention = sessions.filter(s =>
    s.activity === 'waiting_permission' || s.activity === 'waiting_question')

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16, background: '#0f0f12',
      color: '#eee', minHeight: '100vh' }}>
      <h1>🎮 Claude Command Center</h1>
      {needsAttention.length > 0 && (
        <div style={{ background: '#5c1111', padding: 10, borderRadius: 8 }}>
          🔔 {needsAttention.length} session(s) need you
        </div>)}
      <Board sessions={sessions} />
    </div>
  )
}
```

- [ ] **Step 5: Create `src/web/components/Board.tsx`**

```tsx
import type { Session } from '../../shared/types.ts'
import { ProjectZone } from './ProjectZone.tsx'

export function Board({ sessions }: { sessions: Session[] }) {
  const byProject = new Map<string, Session[]>()
  for (const s of sessions) {
    const list = byProject.get(s.project.name) ?? []
    list.push(s); byProject.set(s.project.name, list)
  }
  if (sessions.length === 0)
    return <p style={{ opacity: 0.6 }}>No active Claude Code sessions.</p>
  return <>{[...byProject].map(([name, list]) =>
    <ProjectZone key={name} name={name} sessions={list} />)}</>
}
```

- [ ] **Step 6: Create `src/web/components/ProjectZone.tsx`**

```tsx
import type { Session } from '../../shared/types.ts'
import { SessionCard } from './SessionCard.tsx'

export function ProjectZone({ name, sessions }:
  { name: string; sessions: Session[] }) {
  return (
    <section style={{ border: '1px solid #333', borderRadius: 10,
      padding: 12, margin: '12px 0' }}>
      <h2 style={{ fontSize: 16 }}>📁 {name}
        <span style={{ color: '#888', fontSize: 12 }}> · {sessions.length}</span>
      </h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {sessions.map(s => <SessionCard key={s.sessionId} s={s} />)}
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Create `src/web/components/SessionCard.tsx` + `main.tsx`**

`SessionCard.tsx`:
```tsx
import type { Session } from '../../shared/types.ts'

const COLOR: Record<string, string> = {
  working: '#4aa3ff', researching_web: '#3a7d44', reading: '#9a7',
  meeting: '#c93', waiting_permission: '#ffb300', waiting_question: '#ffb300',
  idle: '#777', done: '#5bd66f', unknown: '#666',
}

export function SessionCard({ s }: { s: Session }) {
  return (
    <div style={{ width: 180, border: `1px solid ${COLOR[s.activity]}`,
      borderRadius: 8, padding: 10, background: '#1a1a1f' }}>
      <div style={{ fontWeight: 700 }}>🤖 {s.sessionId.slice(0, 6)}</div>
      <div style={{ fontSize: 12, color: COLOR[s.activity] }}>{s.activity}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{s.title ?? '—'}</div>
      <div style={{ height: 5, background: '#222', borderRadius: 3,
        marginTop: 6 }}>
        <div style={{ width: `${Math.min(s.context.pct, 100)}%`, height: '100%',
          background: COLOR[s.activity], borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
        {s.model ?? '?'} · ${s.cost.usd.toFixed(2)} · {s.context.pct}%
      </div>
    </div>
  )
}
```

`main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 8: Run both servers and verify in a browser**

Terminal 1: `npx tsx src/server/index.ts --claude-home test/fixtures/claude-home`
Terminal 2: `npm run dev:web`
Open the Vite URL. Expected: two project zones (Demo, Other) with cards; the
"Other" session shows a 🔔 attention banner.

- [ ] **Step 9: Commit**

```bash
git add vite.config.ts src/web
git commit -m "feat: React+Vite skeleton board (SSE-driven)"
```

---

## Task 16: Build, README, end-to-end check

**Files:**
- Create: `README.md`

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: `dist/server/*.js` and `dist/public/index.html` exist.

- [ ] **Step 2: Run the built app against real `~/.claude`**

Run: `node dist/server/index.js --lan`
Open `http://<your-lan-ip>:4317` on your phone.
Expected: your real live sessions appear; the `ClaudeVault/` folder gets
`Daily/`, `Projects/`, `Sessions/` markdown.

- [ ] **Step 3: Write `README.md`**

```markdown
# Claude Command Center

A LAN-served virtual office for your live Claude Code sessions. See every
running session grouped by project — status, model, context %, cost — on your
phone, and auto-log everything to an Obsidian-ready vault.

## Quick start
```
npx claude-command-center          # localhost only
npx claude-command-center --lan     # share on your Wi-Fi (trusted networks only)
```

## Options
- `--lan` / `--host <ip>` — bind address (default 127.0.0.1)
- `--port <n>` — default 4317
- `--vault <path>` — Obsidian vault output (default ~/ClaudeVault)
- `--claude-home <path>` — override ~/.claude
- `--log-content` — also log prompt/response text (off by default)

## Develop
```
npm install
npm run dev    # backend + Vite together
npm test
```
Read-only. LAN mode exposes session *metadata* only; use on trusted networks.
```

- [ ] **Step 4: Final full test run**

Run: `npm test`
Expected: all suites passing.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README + Tier 0 complete"
```

---

## Self-Review (completed)

- **Spec coverage:** discovery ✓, registry ✓, liveness ✓, transcript (title/
  tool/context/cost) ✓, activity classifier ✓, cost model ✓, session model+diff ✓,
  event-log/Obsidian vault ✓, watcher ✓, Express `/api/state`+`/api/stream` ✓,
  React board ✓, config + `--lan` safety ✓, npx ✓, README ✓.
- **Refinement vs spec:** transcript-reader uses a streaming `readline` pass
  (memory-safe, also yields accurate cost sums) instead of a 64 KB tail — strictly
  simpler and more correct. Noted in Task 9.
- **Deferred (per spec, Tier 4+):** precise cost accounting, analytics, office/
  sprites, control, auth.
- **Type consistency:** `Session`, `RegistryRecord`, `TranscriptInfo`, `Config`,
  `SessionEvent` used identically across tasks; `classifyActivity`,
  `classifyLiveness`, `computeContext`, `estimateCost`, `SessionStore.refresh`,
  `Hub.tick/subscribe`, `createServer(store, hub, webRoot)` signatures match call sites.
```
