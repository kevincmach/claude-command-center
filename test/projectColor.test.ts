import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectColor } from '../src/web/projectColor.js'

test('deterministic: same name → same color', () => {
  assert.equal(projectColor('AutoFarm'), projectColor('AutoFarm'))
})

test('different names usually differ', () => {
  const a = projectColor('AutoFarm')
  const b = projectColor('GarminFlow')
  assert.notEqual(a, b)
})

test('returns an hsl() string', () => {
  assert.match(projectColor('X'), /^hsl\(/)
})
