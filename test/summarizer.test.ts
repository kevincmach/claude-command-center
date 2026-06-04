import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../src/server/summarizer.js'

test('summarize trims the runner output', async () => {
  const out = await summarize('source', {
    run: async () => '  digest  ',
    model: 'haiku',
  })
  assert.equal(out, 'digest')
})

test('empty source returns empty and does not call the runner', async () => {
  let called = false
  const out = await summarize('   ', {
    run: async () => {
      called = true
      return 'x'
    },
    model: 'haiku',
  })
  assert.equal(out, '')
  assert.equal(called, false)
})

test('summarize passes source + model through to the runner', async () => {
  let got: unknown
  await summarize('src', {
    run: async (a) => {
      got = a
      return 'd'
    },
    model: 'sonnet',
  })
  assert.deepEqual(got, { source: 'src', model: 'sonnet' })
})

test('a throwing runner propagates (so the service can catch it)', async () => {
  await assert.rejects(
    summarize('src', {
      run: async () => {
        throw new Error('boom')
      },
      model: 'haiku',
    }),
    /boom/,
  )
})
