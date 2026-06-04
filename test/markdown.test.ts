import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, renderHtmlPage } from '../src/server/markdown.js'

test('renders headings, bold, bullets, checkboxes, inline code', () => {
  const html = renderMarkdown(
    '## Summary\n\n**TL;DR:** hi `x`\n\n- a\n- [ ] todo\n- [x] done',
  )
  assert.match(html, /<h2>Summary<\/h2>/)
  assert.match(html, /<strong>TL;DR:<\/strong> hi <code>x<\/code>/)
  assert.match(html, /<li>a<\/li>/)
  assert.match(html, /<span class="box">☐<\/span> todo/)
  assert.match(html, /<span class="box on">☑<\/span> done/)
})

test('a bold-only line becomes a section heading; TL;DR becomes a callout', () => {
  const html = renderMarkdown('**TL;DR:** done it\n\n**What got done**\n\n- a')
  assert.match(html, /<p class="tldr">/)
  assert.match(html, /<h3 class="sec">What got done<\/h3>/)
})

test('checkbox items render as styled chips', () => {
  const html = renderMarkdown('- [ ] todo\n- [x] done')
  assert.match(html, /<span class="box">☐<\/span>/)
  assert.match(html, /<span class="box on">☑<\/span>/)
})

test('escapes HTML to prevent injection', () => {
  const html = renderMarkdown('hi <script>alert(1)</script>')
  assert.ok(!html.includes('<script>'))
  assert.match(html, /&lt;script&gt;/)
})

test('strips frontmatter', () => {
  const html = renderMarkdown('---\ntype: session\n---\n\n# Title')
  assert.ok(!html.includes('type: session'))
  assert.match(html, /<h1>Title<\/h1>/)
})

test('renderHtmlPage wraps a full styled document', () => {
  const doc = renderHtmlPage('s1', '# Hi')
  assert.match(doc, /<!doctype html>/)
  assert.match(doc, /<h1>Hi<\/h1>/)
  assert.match(doc, /<style>/)
})
