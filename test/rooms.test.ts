import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROOMS, roomForActivity } from '../src/web/rooms.js'
import type { Activity } from '../src/shared/types.js'

test('every activity maps to a room that exists in ROOMS', () => {
  const ids = new Set(ROOMS.map((r) => r.id))
  const activities: Activity[] = [
    'working',
    'researching_web',
    'reading',
    'meeting',
    'planning',
    'waiting_permission',
    'waiting_question',
    'idle',
    'done',
    'unknown',
  ]
  for (const a of activities) assert.ok(ids.has(roomForActivity(a)), a)
})

test('specific mappings', () => {
  assert.equal(roomForActivity('working'), 'work')
  assert.equal(roomForActivity('researching_web'), 'gym')
  assert.equal(roomForActivity('reading'), 'library')
  assert.equal(roomForActivity('meeting'), 'meeting')
  assert.equal(roomForActivity('waiting_permission'), 'break')
  assert.equal(roomForActivity('waiting_question'), 'break')
  assert.equal(roomForActivity('idle'), 'lounge')
})

test('unknown / future values fall back to lounge', () => {
  assert.equal(roomForActivity('something_new' as Activity), 'lounge')
})
