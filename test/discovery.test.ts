import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discover } from '../src/server/discovery.js'

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
