// Minimal, zero-dependency markdown → HTML renderer for the bounded subset our
// summary digests + session pages use (headings, bold, inline code, bullets,
// checkboxes, wiki-links). All text is HTML-escaped first, so rendering
// LLM/transcript-derived content cannot inject markup.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string): string {
  // operates on already-escaped text
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="wl">$1</span>')
}

export function renderMarkdown(md: string): string {
  let src = md
  if (src.startsWith('---\n')) {
    const fmEnd = src.indexOf('\n---', 4)
    if (fmEnd !== -1) src = src.slice(src.indexOf('\n', fmEnd + 1) + 1)
  }

  const lines = escapeHtml(src).split('\n')
  const out: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^#\s+(.*)$/))) {
      closeList()
      out.push(`<h1>${inline(m[1])}</h1>`)
    } else if ((m = line.match(/^##\s+(.*)$/))) {
      closeList()
      out.push(`<h2>${inline(m[1])}</h2>`)
    } else if ((m = line.match(/^-\s+\[([ xX])\]\s+(.*)$/))) {
      if (!inList) {
        out.push('<ul class="todo">')
        inList = true
      }
      const checked = m[1].toLowerCase() === 'x'
      out.push(`<li>${checked ? '☑' : '☐'} ${inline(m[2])}</li>`)
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(m[1])}</li>`)
    } else {
      closeList()
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  closeList()
  return out.join('\n')
}

export function renderHtmlPage(title: string, md: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto;
         padding: 24px; background: #0f0f12; color: #e8dcc8; line-height: 1.5; }
  h1 { font-size: 22px; }
  h2 { font-size: 16px; margin-top: 22px; color: #caa987; }
  code { background: #1c1822; padding: 1px 5px; border-radius: 4px; font-size: 90%; }
  ul { padding-left: 20px; }
  ul.todo { list-style: none; padding-left: 4px; }
  a, .wl { color: #6fd3a0; }
</style></head>
<body>${renderMarkdown(md)}</body></html>`
}
