import fs from 'node:fs'
import path from 'node:path'
import type { SessionEvent } from './session-model.js'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function hms(d: Date): string {
  return d.toISOString().slice(11, 19)
}
function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}
function append(file: string, text: string) {
  ensureDir(path.dirname(file))
  fs.appendFileSync(file, text)
}

export class EventLog {
  constructor(
    private vault: string,
    private nowFn: () => Date = () => new Date(),
  ) {}

  record(ev: SessionEvent): void {
    try {
      this.write(ev)
    } catch {
      /* never let logging crash the app */
    }
  }

  private write(ev: SessionEvent): void {
    const s = ev.session
    const now = this.nowFn()
    const verb =
      ev.kind === 'created'
        ? 'appeared'
        : ev.kind === 'ended'
          ? 'ended'
          : `→ ${s.activity}`

    // Daily timeline
    append(
      path.join(this.vault, 'Daily', `${ymd(now)}.md`),
      `- ${hms(now)} **${s.project.name}** [[${s.sessionId}]] ${verb}` +
        (s.title ? ` — ${s.title}` : '') +
        '\n',
    )

    // Project rollup (create once with frontmatter)
    const projFile = path.join(this.vault, 'Projects', `${s.project.name}.md`)
    if (!fs.existsSync(projFile)) {
      append(
        projFile,
        `---\ntype: project\nname: ${s.project.name}\n---\n\n` +
          `# ${s.project.name}\n\n`,
      )
    }
    append(projFile, `- [[${s.sessionId}]] ${s.title ?? ''} (${verb})\n`)

    // Session page (create once)
    const sessFile = path.join(this.vault, 'Sessions', `${s.sessionId}.md`)
    if (!fs.existsSync(sessFile)) {
      append(
        sessFile,
        `---\ntype: session\nproject: ${s.project.name}\n` +
          `model: ${s.model}\nsession: ${s.sessionId}\n---\n\n` +
          `# ${s.title ?? s.sessionId}\n\nProject: [[${s.project.name}]]\n\n` +
          `## Timeline\n`,
      )
    }
    append(sessFile, `- ${ymd(now)} ${hms(now)} ${verb}\n`)
  }
}
