import fs from 'node:fs'
import path from 'node:path'

/** Pure: replace an existing `## Summary` block, else insert one before
 *  `## Timeline` (else append). Preserves frontmatter and other sections. */
export function upsertSummarySection(md: string, summary: string): string {
  const block = `## Summary\n\n${summary.trim()}`
  const lines = md.split('\n')

  const start = lines.findIndex((l) => l.trim() === '## Summary')
  if (start !== -1) {
    let end = start + 1
    while (end < lines.length && !lines[end].startsWith('## ')) end++
    const next = [...lines.slice(0, start), block, '', ...lines.slice(end)]
    return next.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  const tl = lines.findIndex((l) => l.trim() === '## Timeline')
  if (tl !== -1) {
    const next = [...lines.slice(0, tl), block, '', ...lines.slice(tl)]
    return next.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  return md.replace(/\n+$/, '') + '\n\n' + block + '\n'
}

function sessionFile(vault: string, sessionId: string): string {
  return path.join(vault, 'Sessions', `${sessionId}.md`)
}

export function hasSummary(vault: string, sessionId: string): boolean {
  try {
    return /^## Summary\s*$/m.test(
      fs.readFileSync(sessionFile(vault, sessionId), 'utf8'),
    )
  } catch {
    return false
  }
}

export function writeSummary(
  vault: string,
  sessionId: string,
  summary: string,
): void {
  const f = sessionFile(vault, sessionId)
  let md: string
  try {
    md = fs.readFileSync(f, 'utf8')
  } catch {
    return // no page to anchor the section onto
  }
  fs.writeFileSync(f, upsertSummarySection(md, summary))
}
