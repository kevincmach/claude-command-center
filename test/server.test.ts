import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import fs from 'node:fs'
import { createServer } from '../src/server/server.js'
import { SessionStore } from '../src/server/session-model.js'
import { Hub } from '../src/server/watcher.js'
import { SettingsStore } from '../src/server/settings.js'
import { SummaryService } from '../src/server/summary-service.js'
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

function makeDeps(summaries: boolean, claudeAvailable = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-srv-'))
  const settings = new SettingsStore(path.join(dir, 's.json'), { summaries })
  const summaryService = new SummaryService(cfg, settings, async () => '**TL;DR:** x')
  const vaultPath = path.join(dir, 'vault')
  fs.mkdirSync(path.join(vaultPath, 'Sessions'), { recursive: true })
  fs.writeFileSync(
    path.join(vaultPath, 'Sessions', 'aaaa1111.md'),
    '# Session\n\n## Summary\n\nhello vault\n',
  )
  return { settings, summaryService, claudeAvailable, vaultPath }
}

test('GET /api/state returns the current sessions', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const hub = new Hub(store)
  const app = createServer(store, hub, here, makeDeps(false)) // serve test dir as static root
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/api/state`)
  const body = (await res.json()) as unknown[]
  assert.equal(res.status, 200)
  assert.equal(body.length, 2)
  srv.close()
})

test('GET /api/settings returns settings + claudeAvailable', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const app = createServer(store, new Hub(store), here, makeDeps(false, true))
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/api/settings`)
  const body = (await res.json()) as { summaries: boolean; claudeAvailable: boolean }
  assert.equal(body.summaries, false)
  assert.equal(body.claudeAvailable, true)
  srv.close()
})

test('GET /api/sessions/:id/page serves the vault markdown; 404 when missing', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const app = createServer(store, new Hub(store), here, makeDeps(false))
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const ok = await fetch(`http://127.0.0.1:${port}/api/sessions/aaaa1111/page`)
  assert.equal(ok.status, 200)
  assert.match(await ok.text(), /hello vault/)
  const missing = await fetch(`http://127.0.0.1:${port}/api/sessions/ghost/page`)
  assert.equal(missing.status, 404)
  srv.close()
})

test('PATCH /api/settings toggles summaries', async () => {
  const store = new SessionStore(cfg, () => 1780459165000)
  await store.refresh()
  const app = createServer(store, new Hub(store), here, makeDeps(false))
  const srv = app.listen(0)
  const { port } = srv.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries: true }),
  })
  const body = (await res.json()) as { summaries: boolean }
  assert.equal(body.summaries, true)
  srv.close()
})
