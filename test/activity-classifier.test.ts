import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyActivity } from '../src/server/activity-classifier.js'

const base = {
  status: 'busy',
  waitingFor: null,
  latestTool: null,
  liveness: 'live' as const,
}

test('dead session is done', () => {
  assert.equal(classifyActivity({ ...base, liveness: 'dead' }), 'done')
})

test('waiting on permission', () => {
  assert.equal(
    classifyActivity({
      ...base,
      status: 'waiting',
      waitingFor: 'permission prompt',
    }),
    'waiting_permission',
  )
})

test('waiting with no permission reason = a question', () => {
  assert.equal(
    classifyActivity({ ...base, status: 'waiting', waitingFor: null }),
    'waiting_question',
  )
})

test('web search → researching', () => {
  assert.equal(
    classifyActivity({ ...base, latestTool: 'WebSearch' }),
    'researching_web',
  )
})

test('Task tool → meeting', () => {
  assert.equal(classifyActivity({ ...base, latestTool: 'Task' }), 'meeting')
})

test('Edit → working', () => {
  assert.equal(classifyActivity({ ...base, latestTool: 'Edit' }), 'working')
})

test('stale → idle', () => {
  assert.equal(classifyActivity({ ...base, liveness: 'stale' }), 'idle')
})
