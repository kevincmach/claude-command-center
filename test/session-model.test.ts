import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionStore, isSelfSummarizer } from '../src/server/session-model.js'
import { SUMMARIZER_CWD } from '../src/server/config.js'
import type { Config } from '../src/shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'fixtures/claude-home')
const cfg: Config = {
  claudeHome: home,
  host: '127.0.0.1',
  port: 0,
  vaultPath: '/tmp/v',
  pollIntervalMs: 1000,
  staleIdleMs: 5 * 60_000,
  logContent: false,
  summaryModel: 'haiku',
  claudeBin: 'claude',
  settingsPath: '/tmp/ccc-test-settings.json',
}

test('refresh builds normalized sessions from fixtures', async () => {
  const store = new SessionStore(cfg, () => 1780459165000) // fixed "now"
  const events = await store.refresh()
  const all = store.all()
  assert.equal(all.length, 2)
  const demo = all.find((s) => s.sessionId === 'aaaa1111')!
  assert.equal(demo.project.name, 'Demo')
  assert.equal(demo.activity, 'researching_web') // last tool was WebSearch
  assert.ok(demo.context.pct > 0)
  assert.equal(events.filter((e) => e.kind === 'created').length, 2)
})

test('permissionMode from the transcript appears on the built session', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const demo = store.all().find((s) => s.sessionId === 'aaaa1111')!
  assert.equal(demo.permissionMode, 'bypassPermissions')
})

test('isSelfSummarizer flags records in the summarizer cwd', () => {
  assert.equal(
    isSelfSummarizer({ pid: 1, sessionId: 'x', cwd: SUMMARIZER_CWD }),
    true,
  )
  assert.equal(
    isSelfSummarizer({ pid: 1, sessionId: 'x', cwd: '/home/u/proj' }),
    false,
  )
})

test('second refresh with no change emits nothing', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const events = await store.refresh()
  assert.equal(events.length, 0)
})
