import path from 'node:path'
import type { Config, RegistryRecord, Session, Status } from '../shared/types.js'
import { readRegistry } from './registry-reader.js'
import { discover } from './discovery.js'
import { classifyLiveness, isProcessAlive } from './liveness.js'
import { findTranscriptPath, readTranscriptInfo } from './transcript-reader.js'
import { classifyActivity } from './activity-classifier.js'
import { contextLimit, computeContext, estimateCost } from './cost-model.js'

export type SessionEvent =
  | { kind: 'created'; session: Session }
  | { kind: 'updated'; session: Session; prev: Session }
  | { kind: 'ended'; session: Session }

function projectName(cwd: string): string {
  return path.basename(cwd) || cwd
}

function normalizeStatus(s: string | undefined): Status {
  return s === 'busy' || s === 'waiting' || s === 'idle' ? s : 'unknown'
}

async function buildSession(
  rec: RegistryRecord,
  projectsDir: string,
  now: number,
  staleIdleMs: number,
): Promise<Session> {
  const alive = isProcessAlive(rec.pid)
  const liveness = classifyLiveness(alive, rec.updatedAt ?? 0, now, staleIdleMs)
  const tpath = findTranscriptPath(projectsDir, rec.sessionId)
  const info = await readTranscriptInfo(tpath ?? '/none')
  const model = rec.model ?? info.model
  const limit = contextLimit(model)
  return {
    sessionId: rec.sessionId,
    pid: rec.pid,
    alive,
    project: { name: projectName(rec.cwd), cwd: rec.cwd },
    status: normalizeStatus(rec.status),
    activity: classifyActivity({
      status: rec.status,
      waitingFor: rec.waitingFor ?? null,
      latestTool: info.latestTool,
      liveness,
    }),
    waitingFor: rec.waitingFor ?? null,
    model: model ?? null,
    version: rec.version ?? null,
    entrypoint: rec.entrypoint ?? null,
    title: info.title,
    context: computeContext(info.contextTokens, limit),
    cost: { usd: estimateCost(model, info.cost) },
    subAgents: info.subAgents,
    queuedCount: info.queuedCount,
    startedAt: rec.startedAt ?? 0,
    updatedAt: rec.updatedAt ?? 0,
  }
}

export class SessionStore {
  private map = new Map<string, Session>()

  constructor(
    private cfg: Config,
    private nowFn: () => number = Date.now,
  ) {}

  all(): Session[] {
    return [...this.map.values()]
  }

  async refresh(): Promise<SessionEvent[]> {
    const d = discover(this.cfg.claudeHome)
    if (!d.ok) return []
    const now = this.nowFn()
    const recs = readRegistry(d.sessionsDir)
    const seen = new Set<string>()
    const events: SessionEvent[] = []

    for (const rec of recs) {
      seen.add(rec.sessionId)
      const next = await buildSession(
        rec,
        d.projectsDir,
        now,
        this.cfg.staleIdleMs,
      )
      const prev = this.map.get(rec.sessionId)
      this.map.set(rec.sessionId, next)
      if (!prev) {
        events.push({ kind: 'created', session: next })
      } else if (JSON.stringify(prev) !== JSON.stringify(next)) {
        events.push({ kind: 'updated', session: next, prev })
      }
    }
    for (const [id, s] of this.map) {
      if (!seen.has(id)) {
        this.map.delete(id)
        events.push({ kind: 'ended', session: s })
      }
    }
    return events
  }
}
