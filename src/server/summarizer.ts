import fs from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { SUMMARIZER_CWD } from './config.js'

export type SummaryRunner = (args: {
  source: string
  model: string
}) => Promise<string>

const SYSTEM_PROMPT = [
  'You summarize a Claude Code coding session from a distilled transcript.',
  'Reply with GitHub-flavored markdown using EXACTLY these sections, nothing else:',
  '',
  '**TL;DR:** <one sentence>',
  '',
  '**What got done**',
  '- <bullets>',
  '',
  '**Key decisions**',
  '- <bullets, or "- none">',
  '',
  '**Files touched**',
  '- `<path>` <or "- none">',
  '',
  '**Open / next steps**',
  '- [ ] <items, or "- none">',
  '',
  'Be concise. Do not invent anything not present in the transcript.',
].join('\n')

/** Pure-ish: empty source → ''. Otherwise run the injected runner, trimmed. */
export async function summarize(
  source: string,
  deps: { run: SummaryRunner; model: string },
): Promise<string> {
  if (!source.trim()) return ''
  const out = await deps.run({ source, model: deps.model })
  return out.trim()
}

/** True if the `claude` CLI is invokable. */
export function isClaudeAvailable(claudeBin: string): boolean {
  try {
    return spawnSync(claudeBin, ['--version'], { timeout: 5000 }).status === 0
  } catch {
    return false
  }
}

/** Real runner: headless `claude -p` in the dedicated summarizer cwd. */
export function spawnClaudeRunner(claudeBin: string): SummaryRunner {
  return ({ source, model }) =>
    new Promise<string>((resolve, reject) => {
      try {
        fs.mkdirSync(SUMMARIZER_CWD, { recursive: true })
      } catch {
        /* fall through; spawn surfaces a real error if cwd is unusable */
      }
      let out = ''
      let err = ''
      const child = spawn(
        claudeBin,
        [
          '-p',
          '--model',
          model,
          '--output-format',
          'text',
          '--disallowedTools',
          '*',
          '--append-system-prompt',
          SYSTEM_PROMPT,
        ],
        { cwd: SUMMARIZER_CWD },
      )
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('summary timed out'))
      }, 60_000)
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err += d))
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(out)
        else reject(new Error(`claude exited ${code}: ${err.slice(0, 200)}`))
      })
      child.stdin.end(source)
    })
}
