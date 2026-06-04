import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../src/server/config.js'

test('defaults: localhost bind, sensible numbers', () => {
  const c = resolveConfig({ argv: [], env: {}, home: '/home/u' })
  assert.equal(c.host, '127.0.0.1')
  assert.equal(c.claudeHome, '/home/u/.claude')
  assert.equal(c.logContent, false)
  assert.ok(c.port > 0)
})

test('--lan flips bind to 0.0.0.0', () => {
  const c = resolveConfig({ argv: ['--lan'], env: {}, home: '/home/u' })
  assert.equal(c.host, '0.0.0.0')
})

test('env + flags override (flags win)', () => {
  const c = resolveConfig({
    argv: ['--port', '9000'],
    env: { CCC_PORT: '8000' },
    home: '/home/u',
  })
  assert.equal(c.port, 9000)
})

test('summary defaults: haiku model, claude bin, settings path under home', () => {
  const c = resolveConfig({ argv: [], env: {}, home: '/home/u' })
  assert.equal(c.summaryModel, 'haiku')
  assert.equal(c.claudeBin, 'claude')
  assert.equal(c.settingsPath, '/home/u/.claude-command-center/settings.json')
})

test('summary config overrides via flags + env', () => {
  const c = resolveConfig({
    argv: ['--summary-model', 'sonnet', '--claude-bin', '/opt/claude'],
    env: { CCC_SETTINGS: '/tmp/s.json' },
    home: '/home/u',
  })
  assert.equal(c.summaryModel, 'sonnet')
  assert.equal(c.claudeBin, '/opt/claude')
  assert.equal(c.settingsPath, '/tmp/s.json')
})
