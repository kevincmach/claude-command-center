// Minimal, zero-dependency markdown → HTML renderer for the bounded subset our
// summary digests + session pages use. It RE-INTERPRETS structure (a bold-only
// line is a section heading, a TL;DR line is a callout, a checkbox is a chip),
// not just maps tags 1:1 — so the HTML reads as a designed report. All text is
// HTML-escaped first, so rendering LLM/transcript-derived content cannot inject
// markup.

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
      const box = checked
        ? '<span class="box on">☑</span>'
        : '<span class="box">☐</span>'
      out.push(`<li>${box} ${inline(m[2])}</li>`)
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(m[1])}</li>`)
    } else {
      closeList()
      const t = line.trim()
      let sec: RegExpMatchArray | null
      if (/^\*\*TL;DR:\*\*/.test(t)) {
        out.push(`<p class="tldr">${inline(t)}</p>`)
      } else if ((sec = t.match(/^\*\*([^*]+?)\*\*:?$/))) {
        out.push(`<h3 class="sec">${inline(sec[1])}</h3>`)
      } else {
        out.push(`<p>${inline(t)}</p>`)
      }
    }
  }
  closeList()
  return out.join('\n')
}

export function renderHtmlPage(title: string, md: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · summary</title>
<style>
  :root {
    --bg: #14110d; --paper: #1f1810; --edge: #3a2c1c;
    --ink: #ece0cb; --muted: #a3927a;
    --gold: #ffc15e; --gold-dim: #c79a4f; --green: #6fd3a0;
    --code-bg: #2a2016;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px;
    background:
      radial-gradient(1200px 480px at 50% -10%, #241a10 0%, var(--bg) 60%);
    color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    max-width: 680px; margin: 0 auto; padding: 28px 30px 22px;
    background: var(--paper);
    border: 1px solid var(--edge); border-radius: 16px;
    box-shadow: 0 24px 60px -24px #000, inset 0 1px 0 #ffffff0a;
  }
  .eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--gold-dim);
    display: flex; align-items: center; gap: 7px;
    padding-bottom: 14px; margin-bottom: 6px;
    border-bottom: 1px solid var(--edge);
  }
  h1 {
    font-size: 26px; line-height: 1.25; font-weight: 800;
    letter-spacing: -0.02em; margin: 14px 0 4px;
  }
  h2 {
    font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--gold);
    margin: 30px 0 10px; padding-bottom: 6px;
    border-bottom: 1px dashed #4a3826;
  }
  h3.sec {
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--gold-dim);
    margin: 20px 0 6px;
  }
  p { margin: 8px 0; }
  p.tldr {
    font-size: 17px; line-height: 1.5; color: #fbeed3;
    background: #ffc15e14; border-left: 3px solid var(--gold);
    border-radius: 0 10px 10px 0; padding: 12px 16px; margin: 14px 0 4px;
  }
  p.tldr strong { color: var(--gold); }
  ul { margin: 6px 0; padding-left: 22px; }
  ul li { margin: 5px 0; }
  ul li::marker { color: var(--gold-dim); }
  ul.todo { list-style: none; padding-left: 2px; }
  ul.todo li { display: flex; gap: 9px; align-items: baseline; }
  .box { color: var(--gold-dim); font-size: 15px; }
  .box.on { color: var(--green); }
  code {
    background: var(--code-bg); color: #ffd596;
    padding: 1.5px 6px; border-radius: 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 88%;
  }
  .wl { color: var(--green); }
  .foot {
    margin-top: 26px; padding-top: 12px; border-top: 1px solid var(--edge);
    font-size: 11px; color: var(--muted);
  }
</style></head>
<body>
  <main class="card">
    <div class="eyebrow">🎮 Claude Command Center · Session summary</div>
    ${renderMarkdown(md)}
    <div class="foot">Generated locally from the session transcript · the source note lives in your vault.</div>
  </main>
</body></html>`
}
