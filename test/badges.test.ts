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
