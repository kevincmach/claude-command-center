import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SummaryService } from '../src/server/summary-service.js'
import { SettingsStore } from '../src/server/settings.js'
import type { Config, Session } from '../src/shared/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const claudeHome = path.join(here, 'fixtures/claude-home') // has projects/-tmp-Demo/aaaa1111.jsonl

function makeCfg(vault: string): Config {
  return {
    claudeHome,
    host: '127.0.0.1',
    port: 0,
    vaultPath: vault,
    pollIntervalMs: 1000,
    staleIdleMs: 5 * 60_000,
    logContent: false,
    summaryModel: 'haiku',
    claudeBin: 'claude',
    settingsPath: '/tmp/ccc-test-settings.json',
  }
}

function seededVault(): string {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-svc-'))
  fs.mkdirSync(path.join(vault, 'Sessions'), { recursive: true })
  fs.writeFileSync(
    path.join(vault, 'Sessions', 'aaaa1111.md'),
    '---\ntype: session\n---\n\n# T\n\n## Timeline\n- 10:00 appeared\n',
  )
  return vault
}

const session = {
  sessionId: 'aaaa1111',
  project: { name: 'Demo', cwd: '/tmp/Demo' },
} as Session

const okRun = async () => '**TL;DR:** Did the thing.\n\n**What got done**\n- stuff'

test('disabled when the toggle is off', async () => {
  const vault = seededVault()
  const settings = new SettingsStore('/tmp/none.json', { summaries: false })
  const svc = new SummaryService(makeCfg(vault), settings, okRun)
  assert.deepEqual(await svc.maybeSummarize(session), {
    ok: true,
    status: 'disabled',
  })
})

test('writes a summary when on, then skips on the auto path, regenerates on force', async () => {
  const vault = seededVault()
  const settings = new SettingsStore('/tmp/none.json', { summaries: true })
  const svc = new SummaryService(makeCfg(vault), settings, okRun)

  const first = await svc.maybeSummarize(session)
  assert.equal(first.status, 'written')
  assert.equal(first.tldr, 'Did the thing.')
  assert.match(first.path!, /Sessions[/\\]aaaa1111\.md$/)
  assert.match(
    fs.readFileSync(path.join(vault, 'Sessions', 'aaaa1111.md'), 'utf8'),
    /## Summary[\s\S]*Did the thing\./,
  )

  const auto = await svc.maybeSummarize(session) // already summarized
  assert.equal(auto.status, 'skipped')

  const forced = await svc.maybeSummarize(session, { force: true })
  assert.equal(forced.status, 'written')
})

test('a throwing runner yields an error result, not a crash', async () => {
  const vault = seededVault()
  const settings = new SettingsStore('/tmp/none.json', { summaries: true })
  const svc = new SummaryService(makeCfg(vault), settings, async () => {
    throw new Error('boom')
  })
  const r = await svc.maybeSummarize(session, { force: true })
  assert.equal(r.ok, false)
  assert.equal(r.status, 'error')
  assert.match(r.error!, /boom/)
})
