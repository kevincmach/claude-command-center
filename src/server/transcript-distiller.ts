import fs from 'node:fs'
import readline from 'node:readline'

const DEFAULT_CAP = 24000 // ~6k tokens

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join(' ')
  }
  return ''
}

function briefArg(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const v = o.file_path ?? o.command ?? o.path ?? o.pattern ?? o.url
  if (typeof v !== 'string') return ''
  return v.length > 60 ? v.slice(0, 60) + '…' : v
}

/** Pure: distilled, labeled extract from parsed transcript entries.
 *  Keeps the most recent content when over `capChars`. */
export function buildDigestSource(entries: any[], capChars = DEFAULT_CAP): string {
  const lines: string[] = []
  for (const d of entries) {
    if (!d || typeof d !== 'object') continue
    if (d.type === 'ai-title' && d.title) {
      lines.push(`Title: ${d.title}`)
    } else if (d.type === 'user' && d.message) {
      const t = textOf(d.message.content).trim()
      if (t) lines.push(`User: ${t}`)
    } else if (d.type === 'assistant' && d.message) {
      for (const c of d.message.content || []) {
        if (c?.type === 'tool_use') {
          const arg = briefArg(c.input)
          lines.push(`Tool: ${c.name}${arg ? `(${arg})` : ''}`)
        } else if (
          c?.type === 'text' &&
          typeof c.text === 'string' &&
          c.text.trim()
        ) {
          lines.push(`Assistant: ${c.text.trim()}`)
        }
      }
    }
  }
  const joined = lines.join('\n')
  if (joined.length <= capChars) return joined
  return '…' + joined.slice(joined.length - capChars)
}

/** Stream-read a transcript .jsonl and distill it. Missing/empty → ''. */
export async function distillTranscript(file: string): Promise<string> {
  let stream: fs.ReadStream
  try {
    stream = fs.createReadStream(file, { encoding: 'utf8' })
  } catch {
    return ''
  }
  stream.on('error', () => {})
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  const entries: any[] = []
  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        /* skip partial line */
      }
    }
  } catch {
    /* return what we have */
  }
  return buildDigestSource(entries)
}
