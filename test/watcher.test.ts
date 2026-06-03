import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hub } from '../src/server/watcher.js'
import { SessionStore } from '../src/server/session-model.js'
import type { Config } from '../src/shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'fixtures/claude-home')
const cfg: Config = {
  claudeHome: home,
  host: '127.0.0.1',
  port: 0,
  vaultPath: '/tmp/v',
  pollIntervalMs: 9999,
  staleIdleMs: 5 * 60_000,
  logContent: false,
}

test('tick() refreshes and broadcasts events to subscribers', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  const hub = new Hub(store)
  const got: string[] = []
  hub.subscribe((ev) => got.push(ev.kind))
  await hub.tick()
  assert.ok(got.includes('created'))
})
