import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentName } from '../src/web/agentName.js'

test('deterministic: same id → same name', () => {
  assert.equal(agentName('aaaa1111'), agentName('aaaa1111'))
})

test('returns a non-empty name', () => {
  assert.ok(agentName('bbbb2222').length > 0)
})

test('different ids can produce different names', () => {
  const names = new Set(
    ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => agentName(id)),
  )
  assert.ok(names.size > 1)
})
