import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOM_DECOR } from '../src/web/roomDecor.js'
import { ROOMS } from '../src/web/rooms.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const names = JSON.parse(
  fs.readFileSync(
    path.join(here, '../src/web/assets/props/names.json'),
    'utf8',
  ),
)
const known = new Set(Object.values(names))

test('every room has decor', () => {
  for (const r of ROOMS) assert.ok(ROOM_DECOR[r.id], r.id)
})

test('every decor prop exists in names.json', () => {
  for (const props of Object.values(ROOM_DECOR)) {
    for (const p of props) assert.ok(known.has(p), p)
  }
})
