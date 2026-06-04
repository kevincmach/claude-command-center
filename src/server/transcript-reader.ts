import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { TranscriptInfo } from '../shared/types.js'

export function findTranscriptPath(
  projectsDir: string,
  sessionId: string,
): string | null {
  let dirs: string[] = []
  try {
    dirs = fs.readdirSync(projectsDir)
  } catch {
    return null
  }
  for (const d of dirs) {
    const candidate = path.join(projectsDir, d, `${sessionId}.jsonl`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function empty(): TranscriptInfo {
  return {
    model: null,
    title: null,
    latestTool: null,
    contextTokens: 0,
    cost: {
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      outputTokens: 0,
    },
    subAgents: 0,
    queuedCount: 0,
    permissionMode: null,
  }
}

export async function readTranscriptInfo(file: string): Promise<TranscriptInfo> {
  const info = empty()
  let stream: fs.ReadStream
  try {
    stream = fs.createReadStream(file, { encoding: 'utf8' })
  } catch {
    return info
  }

  // A read error on a missing file surfaces as a stream 'error' event, which
  // would otherwise throw. Swallow it and return whatever we have.
  stream.on('error', () => {})

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      let d: any
      try {
        d = JSON.parse(line)
      } catch {
        continue // skip a partially-written final line
      }
      if (d.type === 'ai-title' && d.title) info.title = d.title
      if (d.type === 'queue-operation') {
        if (d.operation === 'enqueue') info.queuedCount++
        else if (d.operation === 'dequeue')
          info.queuedCount = Math.max(0, info.queuedCount - 1)
      }
      if (d.type === 'permission-mode' && d.permissionMode) {
        info.permissionMode = d.permissionMode
      }
      const msg = d.message
      if (d.type === 'assistant' && msg) {
        if (msg.model) info.model = msg.model
        const u = msg.usage
        if (u) {
          info.cost.inputTokens += u.input_tokens || 0
          info.cost.cacheReadTokens += u.cache_read_input_tokens || 0
          info.cost.cacheCreateTokens += u.cache_creation_input_tokens || 0
          info.cost.outputTokens += u.output_tokens || 0
          info.contextTokens =
            (u.input_tokens || 0) +
            (u.cache_read_input_tokens || 0) +
            (u.cache_creation_input_tokens || 0)
        }
        for (const c of msg.content || []) {
          if (c?.type === 'tool_use') {
            info.latestTool = c.name
            if (c.name === 'Task' || c.name === 'Agent') info.subAgents++
          }
        }
      }
    }
  } catch {
    /* read error mid-stream: return what we have */
  }
  return info
}
