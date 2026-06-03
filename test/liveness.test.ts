import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyLiveness } from '../src/server/liveness.js'

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
