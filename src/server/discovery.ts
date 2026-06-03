import fs from 'node:fs'
import path from 'node:path'

export type Discovery =
  | { ok: true; sessionsDir: string; projectsDir: string }
  | { ok: false; message: string }

export function discover(claudeHome: string): Discovery {
  if (!fs.existsSync(claudeHome)) {
    return {
      ok: false,
      message:
        `Claude home not found at ${claudeHome}. ` +
        `Is Claude Code installed? Set --claude-home to override.`,
    }
  }
  const sessionsDir = path.join(claudeHome, 'sessions')
  const projectsDir = path.join(claudeHome, 'projects')
  if (!fs.existsSync(sessionsDir)) {
    return { ok: false, message: `No sessions/ dir in ${claudeHome}.` }
  }
  return { ok: true, sessionsDir, projectsDir }
}
