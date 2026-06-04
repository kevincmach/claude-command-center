import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import { createServer } from '../src/server/server.js'
import { SessionStore } from '../src/server/session-model.js'
import { Hub } from '../src/server/watcher.js'
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
  summaryModel: 'haiku',
  claudeBin: 'claude',
  settingsPath: '/tmp/ccc-test-settings.json',
}

test('GET /api/state returns the current sessions', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const hub = new Hub(store)
  const app = createServer(store, hub, here) // serve test dir as static root
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/api/state`)
  const body = (await res.json()) as unknown[]
  assert.equal(res.status, 200)
  assert.equal(body.length, 2)
  srv.close()
})
