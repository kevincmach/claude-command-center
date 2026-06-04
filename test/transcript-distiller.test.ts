import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDigestSource,
  distillTranscript,
} from '../src/server/transcript-distiller.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('buildDigestSource extracts title, user, tools, assistant text in order', () => {
  const entries = [
    { type: 'ai-title', title: 'Auth refactor' },
    { type: 'user', message: { content: 'make login work' } },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: 'auth.ts' } },
          { type: 'text', text: 'Done.' },
        ],
      },
    },
    { type: 'queue-operation', operation: 'enqueue' },
  ]
  assert.equal(
    buildDigestSource(entries),
    'Title: Auth refactor\nUser: make login work\nTool: Edit(auth.ts)\nAssistant: Done.',
  )
})

test('buildDigestSource keeps the most recent content within the cap', () => {
  const entries = [
    { type: 'user', message: { content: 'A'.repeat(100) } },
    { type: 'user', message: { content: 'recent' } },
  ]
  const out = buildDigestSource(entries, 20)
  assert.ok(out.startsWith('…'))
  assert.ok(out.endsWith('recent'))
  assert.ok(out.length <= 21)
})

test('distillTranscript reads a jsonl fixture', async () => {
  const p = path.join(
    here,
    'fixtures/claude-home/projects/-tmp-Demo/aaaa1111.jsonl',
  )
  const out = await distillTranscript(p)
  assert.match(out, /Title: Refactoring the auth flow/)
  assert.match(out, /Tool: Edit/)
})

test('distillTranscript on a missing file returns empty string', async () => {
  assert.equal(await distillTranscript('/no/such.jsonl'), '')
})
