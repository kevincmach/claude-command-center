import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contextLimit,
  computeContext,
  estimateCost,
} from '../src/server/cost-model.js'

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
    inputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    outputTokens: 0,
  })
  assert.equal(usd, 15) // $15 / 1M input for opus
})
