import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventLog } from '../src/server/event-log.js'
import type { Session } from '../src/shared/types.js'

function demoSession(): Session {
  return {
    sessionId: 'aaaa1111',
    pid: 1,
    alive: true,
    project: { name: 'Demo', cwd: '/tmp/Demo' },
    status: 'busy',
    activity: 'working',
    waitingFor: null,
    model: 'claude-opus-4-8',
    version: '2',
    entrypoint: 'cli',
    title: 'Refactoring auth',
    context: { tokens: 100, limit: 200000, pct: 0 },
    cost: { usd: 0.5 },
    subAgents: 0,
    queuedCount: 0,
    startedAt: 1,
    updatedAt: 2,
  }
}

test('writes daily, project, and session markdown', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  const log = new EventLog(vault, () => new Date('2026-06-03T10:00:00Z'))
  log.record({ kind: 'created', session: demoSession() })

  const daily = fs.readFileSync(path.join(vault, 'Daily/2026-06-03.md'), 'utf8')
  assert.match(daily, /Demo/)
  assert.match(daily, /\[\[aaaa1111\]\]/) // wikilink
  const proj = fs.readFileSync(path.join(vault, 'Projects/Demo.md'), 'utf8')
  assert.match(proj, /Refactoring auth/)
  assert.ok(fs.existsSync(path.join(vault, 'Sessions/aaaa1111.md')))
})

test('does not throw if the same event is recorded twice', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  const log = new EventLog(vault, () => new Date('2026-06-03T10:00:00Z'))
  log.record({ kind: 'created', session: demoSession() })
  log.record({ kind: 'created', session: demoSession() })
  assert.ok(true)
})
