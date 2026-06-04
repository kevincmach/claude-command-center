# Tier 2b — Rich Signals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each session's model, permission mode (YOLO / Plan), sub-agents, and *pending* queued messages — minimally on the character (a corner badge), fully in the detail card.

**Architecture:** Backend already reads `permissionMode` into `TranscriptInfo`; we fix the `queuedCount` accumulation bug and thread `permissionMode` onto `Session` so it rides the existing SSE stream. The frontend adds one pure, unit-tested module (`badges.ts`) as the single source of truth for label/badge mapping, consumed by `Character.tsx` (corner badge) and `CharacterDetail.tsx` (full rows).

**Tech Stack:** TypeScript · Node + Express · React + Vite · SSE · `node:test`.

---

## Context for the implementer

- **Branch:** `tier2b` (already created off `main`).
- **Run tests:** `npm test` (runs `node --import tsx --test test/*.test.ts`).
- **Build (also the verification gate for React/CSS tasks):** `npm run build` (runs `tsc && vite build`).
- **Commits:** run `git` directly (zsh aliases shadow helper fns). Author env is required:
  ```bash
  GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
  GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
  git commit -m "..."
  ```
- **Smoke test (Kevin, on phone/desktop after the build):**
  ```bash
  node dist/server/index.js --lan --port 4317 --vault /tmp/ClaudeVault-live
  ```
  then open `http://192.168.68.147:4317`.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `test/fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl` | Modify (append lines) | Drive both backend tests: net-queued + permissionMode |
| `src/server/transcript-reader.ts` | Modify (line 65) | Net enqueue−dequeue, clamp ≥ 0 |
| `src/shared/types.ts` | Modify (`Session`) | Add `permissionMode: string \| null` |
| `src/server/session-model.ts` | Modify (`buildSession`) | Propagate `info.permissionMode` onto `Session` |
| `src/web/badges.ts` | Create | Pure `modelLabel` + `permissionBadge` mapping |
| `test/badges.test.ts` | Create | Unit-test `badges.ts` |
| `src/web/components/Character.tsx` | Modify | Render corner badge when `permissionBadge` non-null |
| `src/web/office.css` | Modify | `.char-badge` corner-badge style |
| `src/web/components/CharacterDetail.tsx` | Modify | Model / mode / sub-agents / 📥 queued rows |

---

## Task 1: Fix `queuedCount` to net pending (enqueue − dequeue, clamped)

**Files:**
- Modify: `test/fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl` (append 4 lines)
- Modify: `src/server/transcript-reader.ts:65`
- Test: `test/transcript-reader.test.ts`

- [ ] **Step 1: Extend the fixture with queue + permission lines**

Append these four lines to the **end** of `test/fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl` (after the existing two `assistant` lines — they are not `assistant` entries, so the existing title/tool/context assertions are unaffected):

```jsonl
{"type":"queue-operation","operation":"enqueue"}
{"type":"queue-operation","operation":"enqueue"}
{"type":"queue-operation","operation":"dequeue"}
{"type":"permission-mode","permissionMode":"bypassPermissions"}
```

(The `permission-mode` line is used by Task 2; adding it here keeps the fixture edited once.)

- [ ] **Step 2: Write the failing test**

Add to `test/transcript-reader.test.ts`:

```ts
test('queuedCount is net pending (enqueue x2 - dequeue x1), clamped at 0', async () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')!
  const info = await readTranscriptInfo(p)
  assert.equal(info.queuedCount, 1)
})

test('permissionMode reflects the last permission-mode entry', async () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')!
  const info = await readTranscriptInfo(p)
  assert.equal(info.permissionMode, 'bypassPermissions')
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern='queuedCount is net pending'`
Expected: FAIL — `info.queuedCount` is `3` (current code does `info.queuedCount++` on every `queue-operation`, counting all 3 ops), `assert.equal(3, 1)` fails.

(The `permissionMode` test should already PASS — the reader already parses `permission-mode`; it's a regression guard.)

- [ ] **Step 4: Fix the accumulation**

In `src/server/transcript-reader.ts`, replace line 65:

```ts
      if (d.type === 'queue-operation') info.queuedCount++
```

with:

```ts
      if (d.type === 'queue-operation') {
        if (d.operation === 'enqueue') info.queuedCount++
        else if (d.operation === 'dequeue')
          info.queuedCount = Math.max(0, info.queuedCount - 1)
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all existing transcript-reader tests still green (title `Refactoring the auth flow`, latestTool `WebSearch`, contextTokens unchanged), plus the two new tests pass (`queuedCount === 1`, `permissionMode === 'bypassPermissions'`).

- [ ] **Step 6: Commit**

```bash
git add src/server/transcript-reader.ts test/transcript-reader.test.ts \
  test/fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "fix(server): queuedCount is net pending (enqueue-dequeue), clamped"
```

---

## Task 2: Propagate `permissionMode` onto `Session`

**Files:**
- Modify: `src/shared/types.ts:40-58` (`Session` interface)
- Modify: `src/server/session-model.ts:35-58` (`buildSession` return)
- Test: `test/session-model.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/session-model.test.ts` (inside the existing first test, or as a new one — use a new one for clarity):

```ts
test('permissionMode from the transcript appears on the built session', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const demo = store.all().find((s) => s.sessionId === 'aaaa1111')!
  assert.equal(demo.permissionMode, 'bypassPermissions')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern='permissionMode from the transcript'`
Expected: FAIL — TypeScript error `Property 'permissionMode' does not exist on type 'Session'` (the field isn't on the interface yet) / the value is `undefined`.

- [ ] **Step 3: Add `permissionMode` to the `Session` interface**

In `src/shared/types.ts`, in the `Session` interface, add the field next to `queuedCount` (line 56):

```ts
  subAgents: number
  queuedCount: number
  permissionMode: string | null
  startedAt: number
```

- [ ] **Step 4: Set `permissionMode` in `buildSession`**

In `src/server/session-model.ts`, in the object returned by `buildSession`, add the field next to `queuedCount` (line 55):

```ts
    subAgents: info.subAgents,
    queuedCount: info.queuedCount,
    permissionMode: info.permissionMode,
    startedAt: rec.startedAt ?? 0,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — the new test passes (`demo.permissionMode === 'bypassPermissions'`), the existing session-model tests still green (`all.length === 2`, created count `2`, second-refresh emits nothing — both refreshes read identical data so still no diff).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/server/session-model.ts test/session-model.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(server): expose permissionMode on Session"
```

---

## Task 3: Pure `badges.ts` (modelLabel + permissionBadge)

**Files:**
- Create: `src/web/badges.ts`
- Test: `test/badges.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/badges.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelLabel, permissionBadge } from '../src/web/badges.js'

test('modelLabel maps known families to a friendly short label', () => {
  assert.equal(modelLabel('claude-opus-4-8'), 'Opus')
  assert.equal(modelLabel('claude-sonnet-4-6'), 'Sonnet')
  assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'Haiku')
})

test('modelLabel returns the raw string for an unknown model', () => {
  assert.equal(modelLabel('gpt-9-turbo'), 'gpt-9-turbo')
})

test('modelLabel returns a dash for null/empty', () => {
  assert.equal(modelLabel(null), '—')
  assert.equal(modelLabel(''), '—')
})

test('permissionBadge maps bypass and plan, hides the rest', () => {
  assert.deepEqual(permissionBadge('bypassPermissions'), { icon: '⚠️', label: 'YOLO' })
  assert.deepEqual(permissionBadge('plan'), { icon: '📋', label: 'Plan' })
  assert.equal(permissionBadge('acceptEdits'), null)
  assert.equal(permissionBadge('normal'), null)
  assert.equal(permissionBadge(null), null)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern='modelLabel|permissionBadge'`
Expected: FAIL — `Cannot find module '../src/web/badges.js'` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/web/badges.ts`:

```ts
// Single source of truth for the small visual signals derived from a Session.
// Pure functions, unit-tested — Character.tsx and CharacterDetail.tsx consume these.

const FAMILIES = ['Opus', 'Sonnet', 'Haiku'] as const

/** Friendly short label for a model id, e.g. `claude-opus-4-8` → "Opus".
 *  Unknown model → the raw string (don't hide info). null/empty → "—". */
export function modelLabel(model: string | null): string {
  if (!model) return '—'
  const lower = model.toLowerCase()
  for (const fam of FAMILIES) {
    if (lower.includes(fam.toLowerCase())) return fam
  }
  return model
}

export interface PermissionBadge {
  icon: string
  label: string
}

/** Corner-badge for a permission mode. bypass → ⚠️ YOLO, plan → 📋 Plan.
 *  normal / acceptEdits / null → null (nothing shown on the character). */
export function permissionBadge(mode: string | null): PermissionBadge | null {
  if (mode === 'bypassPermissions') return { icon: '⚠️', label: 'YOLO' }
  if (mode === 'plan') return { icon: '📋', label: 'Plan' }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern='modelLabel|permissionBadge'`
Expected: PASS — all five badge tests green.

- [ ] **Step 5: Commit**

```bash
git add src/web/badges.ts test/badges.test.ts
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(web): pure badges.ts (modelLabel + permissionBadge)"
```

---

## Task 4: Minimal corner badge on the character

**Files:**
- Modify: `src/web/components/Character.tsx`
- Modify: `src/web/office.css` (add `.char-badge`)

*(React component + CSS — no jsdom in this project, so verification is `npm run build` passing + Kevin's visual smoke test. Logic is already covered by Task 3's unit tests.)*

- [ ] **Step 1: Import the badge mapping in `Character.tsx`**

In `src/web/components/Character.tsx`, add to the imports (after the `agentName` import, line 4):

```ts
import { permissionBadge } from '../badges.js'
```

- [ ] **Step 2: Compute the badge in the component body**

In `Character.tsx`, after `const work = s.title ?? PHRASE[s.activity] ?? s.activity` (line 36), add:

```ts
  const badge = permissionBadge(s.permissionMode)
```

- [ ] **Step 3: Render the badge (only when non-null)**

In `Character.tsx`, add the badge element just after the `{waiting && <span className="bubble">❗</span>}` line (line 44), so it sits in the same absolutely-positioned corner stack:

```tsx
      {waiting && <span className="bubble">❗</span>}
      {badge && (
        <span className="char-badge" title={badge.label}>
          {badge.icon}
        </span>
      )}
```

- [ ] **Step 4: Add the `.char-badge` style**

In `src/web/office.css`, add after the `.bubble { … }` block (after line 157):

```css
.char-badge {
  position: absolute;
  top: -14px;
  right: 6px;
  font-size: 13px;
  line-height: 1;
  z-index: 4;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
}
```

- [ ] **Step 5: Build to verify it compiles**

Run: `npm run build`
Expected: PASS — `tsc` reports no type errors (`s.permissionMode` is now a valid `Session` field from Task 2) and `vite build` completes.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/Character.tsx src/web/office.css
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(web): minimal permission badge on character (YOLO/Plan)"
```

- [ ] **Step 7: Visual smoke test (Kevin)**

Build is done. Run `node dist/server/index.js --lan --port 4317 --vault /tmp/ClaudeVault-live`, open `http://192.168.68.147:4317`. Confirm a ⚠️ badge appears on a `bypassPermissions` session and nothing appears on normal sessions.

---

## Task 5: Full signals in the detail card

**Files:**
- Modify: `src/web/components/CharacterDetail.tsx`

*(React component — verification is `npm run build` + Kevin's visual smoke test.)*

- [ ] **Step 1: Import the badge mapping**

In `src/web/components/CharacterDetail.tsx`, add after the `agentName` import (line 2):

```ts
import { modelLabel, permissionBadge } from '../badges.js'
```

- [ ] **Step 2: Replace the model row and add mode / queued rows**

In `CharacterDetail.tsx`, replace the model row (line 18):

```tsx
        <p className="detail-row">🧠 {s.model ?? '—'}</p>
```

with the friendly model label plus a permission-mode row (shown for every non-normal mode, including `acceptEdits`, since the card is the *full* view):

```tsx
        <p className="detail-row">🧠 {modelLabel(s.model)}</p>
        {s.permissionMode && s.permissionMode !== 'normal' && (
          <p className="detail-row">
            {permissionBadge(s.permissionMode)?.icon ?? '🔓'} {s.permissionMode}
          </p>
        )}
```

Then add a queued row immediately after the existing sub-agents block (after line 24, the closing `)}` of the `{s.subAgents > 0 && (…)}`):

```tsx
        {s.subAgents > 0 && (
          <p className="detail-row">🐤 {s.subAgents} sub-agent(s)</p>
        )}
        {s.queuedCount > 0 && (
          <p className="detail-row">📥 {s.queuedCount} queued</p>
        )}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: PASS — no type errors, `vite build` completes.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/CharacterDetail.tsx
GIT_AUTHOR_NAME='Kevin Mach' GIT_AUTHOR_EMAIL='mr.kevinmach@gmail.com' \
GIT_COMMITTER_NAME='Kevin Mach' GIT_COMMITTER_EMAIL='mr.kevinmach@gmail.com' \
git commit -m "feat(web): rich signals in detail card (model/mode/queued)"
```

- [ ] **Step 5: Visual smoke test (Kevin)**

Open the detail card for a session and confirm it shows the friendly model label (e.g. "Opus"), the permission mode when not normal, sub-agent count when > 0, and `📥 N queued` when there are pending messages.

---

## Final verification

- [ ] **Run the full suite:** `npm test` → all tests pass (expect the prior 42 + 5 new = 47).
- [ ] **Build clean:** `npm run build` → no `tsc` errors, `vite build` succeeds.
- [ ] **Finish the branch:** use `superpowers:finishing-a-development-branch` (merge `tier2b` → `main`, fast-forward, delete branch) once Kevin confirms the smoke test.

---

## Self-Review (against the spec)

**Spec coverage:**
- Backend 1 — fix `queuedCount` net pending, clamp ≥ 0 → **Task 1** ✓
- Backend 2 — add `permissionMode` to `Session` → **Task 2** ✓
- Backend 3 — set `permissionMode` in `buildSession` → **Task 2** ✓
- (Backend: `TranscriptInfo.permissionMode` + reader parsing were already present — verified in `transcript-reader.ts:37,66-68` and `types.ts:37`; no task needed.)
- `badges.ts` — `modelLabel` + `permissionBadge`, pure, tested → **Task 3** ✓
- `Character.tsx` — corner badge only when `permissionBadge` non-null → **Task 4** ✓
- `office.css` — `.char-badge` → **Task 4** ✓
- `CharacterDetail.tsx` — Model / Permission mode / Sub-agents / 📥 Queued rows → **Task 5** ✓
- Testing: badges unit (known+unknown+null), transcript-reader net-queued fixture, session-model permissionMode → Tasks 3, 1, 2 ✓
- Out of scope (to-do whiteboard, costumes, etc.) — correctly omitted ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows full code. ✓

**Type consistency:** `permissionMode: string | null` defined in Task 2 (`types.ts`) and consumed in Tasks 4/5; `permissionBadge` returns `{ icon, label } | null` (`PermissionBadge`) in Task 3 and is used as `.icon`/`.label` in Tasks 4/5; `modelLabel(string | null): string` matches usage. ✓
