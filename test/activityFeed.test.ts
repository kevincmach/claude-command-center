import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendEvent, type FeedItem } from '../src/web/activityFeed.js'
import type { Session } from '../src/shared/types.js'

// Minimal Session factory — only the fields the reducer reads matter; the rest
// satisfy the type. Vary sessionId/updatedAt/activity per test.
function sess(over: Partial<Session>): Session {
  return {
    sessionId: 'sess-1',
    pid: 1,
    alive: true,
    project: { name: 'demo', cwd: '/demo' },
    status: 'busy',
    activity: 'working',
    waitingFor: null,
    model: null,
    version: null,
    entrypoint: null,
    title: null,
    context: { tokens: 0, limit: 0, pct: 0 },
    cost: { usd: 0 },
    subAgents: 0,
    queuedCount: 0,
    permissionMode: null,
    startedAt: 0,
    updatedAt: 0,
    ...over,
  }
}

test('appends newest-first', () => {
  const a = appendEvent([], { kind: 'created', s: sess({ sessionId: 'a', updatedAt: 1 }) }, 200)
  const b = appendEvent(a, { kind: 'created', s: sess({ sessionId: 'b', updatedAt: 2 }) }, 200)
  assert.equal(b[0].sessionId, 'b')
  assert.equal(b[1].sessionId, 'a')
})

test('caps at the limit, dropping the oldest', () => {
  let list: FeedItem[] = []
  for (let i = 1; i <= 5; i++) {
    list = appendEvent(list, { kind: 'updated', s: sess({ sessionId: `s${i}`, updatedAt: i }) }, 2)
  }
  assert.equal(list.length, 2)
  assert.equal(list[0].sessionId, 's5')
  assert.equal(list[1].sessionId, 's4')
})

test('maps created → appeared', () => {
  const [item] = appendEvent([], { kind: 'created', s: sess({}) }, 10)
  assert.equal(item.label, 'appeared')
})

test('maps ended → ended', () => {
  const [item] = appendEvent([], { kind: 'ended', s: sess({}) }, 10)
  assert.equal(item.label, 'ended')
})

test('maps updated → the activity', () => {
  const [item] = appendEvent([], { kind: 'updated', s: sess({ activity: 'planning' }) }, 10)
  assert.equal(item.label, '→ planning')
})

test('carries project name and a stable id', () => {
  const [item] = appendEvent([], { kind: 'created', s: sess({ sessionId: 'x', updatedAt: 7, project: { name: 'acme', cwd: '/acme' } }) }, 10)
  assert.equal(item.project, 'acme')
  assert.equal(item.id, 'x:7:created')
})
