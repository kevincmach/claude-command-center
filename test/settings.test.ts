import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SettingsStore } from '../src/server/settings.js'

test('missing file falls back to defaults', () => {
  const s = new SettingsStore('/no/such/dir/settings.json', { summaries: false })
  assert.equal(s.get().summaries, false)
})

test('patch persists; a fresh store reading the same file sees it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-set-'))
  const file = path.join(dir, 'settings.json')
  const s = new SettingsStore(file, { summaries: false })
  const next = s.patch({ summaries: true })
  assert.equal(next.summaries, true)
  const reloaded = new SettingsStore(file, { summaries: false })
  assert.equal(reloaded.get().summaries, true)
})

test('patch write failure is swallowed (no throw)', () => {
  // a path whose parent is a file, not a dir → mkdir/write fails internally
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-set-'))
  const asFile = path.join(dir, 'afile')
  fs.writeFileSync(asFile, 'x')
  const s = new SettingsStore(path.join(asFile, 'settings.json'), {
    summaries: false,
  })
  assert.equal(s.patch({ summaries: true }).summaries, true) // returns, no throw
})
