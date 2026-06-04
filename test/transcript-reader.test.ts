import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findTranscriptPath,
  readTranscriptInfo,
} from '../src/server/transcript-reader.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectsDir = path.join(here, 'fixtures/claude-home/projects')

test('finds a transcript by sessionId across project dirs', () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')
  assert.ok(p && p.endsWith('aaaa1111.jsonl'))
})

test('extracts latest title, tool, and context tokens', async () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')!
  const info = await readTranscriptInfo(p)
  assert.equal(info.title, 'Refactoring the auth flow')
  assert.equal(info.latestTool, 'WebSearch') // last tool_use wins
  assert.equal(info.contextTokens, 40000 + 100 + 5) // from last usage
  assert.ok(info.cost.outputTokens >= 1000) // summed across turns
})

test('queuedCount is net pending (enqueue x2 - dequeue x1), clamped at 0', async () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')!
  const info = await readTranscriptInfo(p)
  assert.equal(info.queuedCount, 1)
})

test('permissionMode reflects the last permission-mode entry', async () => {
  const p = findTranscriptPath(projectsDir, 'aaaa1111')!
  const info = await readTranscriptInfo(p)
  assert.equal(info.permissionMode, 'bypassPermissions')
})

test('missing file returns empty info, no throw', async () => {
  const info = await readTranscriptInfo('/no/such.jsonl')
  assert.equal(info.title, null)
  assert.equal(info.contextTokens, 0)
})
