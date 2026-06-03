import type { Session } from '../../shared/types.js'
import { ProjectZone } from './ProjectZone.js'

export function Board({ sessions }: { sessions: Session[] }) {
  const byProject = new Map<string, Session[]>()
  for (const s of sessions) {
    const list = byProject.get(s.project.name) ?? []
    list.push(s)
    byProject.set(s.project.name, list)
  }
  if (sessions.length === 0)
    return <p style={{ opacity: 0.6 }}>No active Claude Code sessions.</p>
  return (
    <>
      {[...byProject].map(([name, list]) => (
        <ProjectZone key={name} name={name} sessions={list} />
      ))}
    </>
  )
}
