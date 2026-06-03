import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRegistry } from '../src/server/registry-reader.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const sessionsDir = path.join(here, 'fixtures/claude-home/sessions')

test('reads all valid session records', () => {
  const recs = readRegistry(sessionsDir)
  assert.equal(recs.length, 2)
  const pids = recs.map((r) => r.pid).sort()
  assert.deepEqual(pids, [39115, 71640])
})

test('skips malformed files without throwing', () => {
  const recs = readRegistry(sessionsDir)
  assert.ok(recs.every((r) => typeof r.sessionId === 'string'))
})
