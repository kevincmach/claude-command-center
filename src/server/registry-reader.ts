import fs from 'node:fs'
import path from 'node:path'
import type { RegistryRecord } from '../shared/types.js'

export function readRegistry(sessionsDir: string): RegistryRecord[] {
  let files: string[] = []
  try {
    files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }

  const out: RegistryRecord[] = []
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(sessionsDir, f), 'utf8')
      const rec = JSON.parse(raw)
      if (
        rec &&
        typeof rec.pid === 'number' &&
        typeof rec.sessionId === 'string' &&
        typeof rec.cwd === 'string'
      ) {
        out.push(rec as RegistryRecord)
      }
    } catch {
      /* skip partially-written / junk files */
    }
  }
  return out
}
