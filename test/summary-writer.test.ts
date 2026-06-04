import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  upsertSummarySection,
  writeSummary,
  hasSummary,
} from '../src/server/summary-writer.js'

const PAGE =
  '---\ntype: session\n---\n\n# Title\n\nProject: [[Demo]]\n\n## Timeline\n- 10:00 appeared\n'

test('inserts ## Summary before ## Timeline when absent', () => {
  const out = upsertSummarySection(PAGE, 'TL;DR digest')
  assert.ok(out.includes('## Summary'))
  assert.ok(out.indexOf('## Summary') < out.indexOf('## Timeline'))
  assert.ok(out.includes('TL;DR digest'))
  assert.ok(out.includes('## Timeline')) // preserved
  assert.ok(out.startsWith('---\ntype: session')) // frontmatter preserved
})

test('replaces an existing ## Summary block, only one remains', () => {
  const withOld = upsertSummarySection(PAGE, 'OLD summary')
  const out = upsertSummarySection(withOld, 'NEW summary')
  assert.ok(out.includes('NEW summary'))
  assert.ok(!out.includes('OLD summary'))
  assert.equal(out.match(/## Summary/g)!.length, 1)
  assert.ok(out.includes('## Timeline'))
})

test('hasSummary + writeSummary round-trip on a real file; missing page is a no-op', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-vault-'))
  fs.mkdirSync(path.join(vault, 'Sessions'), { recursive: true })
  fs.writeFileSync(path.join(vault, 'Sessions', 's1.md'), PAGE)

  assert.equal(hasSummary(vault, 's1'), false)
  writeSummary(vault, 's1', 'the digest')
  assert.equal(hasSummary(vault, 's1'), true)
  assert.match(
    fs.readFileSync(path.join(vault, 'Sessions', 's1.md'), 'utf8'),
    /the digest/,
  )

  // missing page → no throw, no file created
  writeSummary(vault, 'ghost', 'x')
  assert.equal(fs.existsSync(path.join(vault, 'Sessions', 'ghost.md')), false)
})
