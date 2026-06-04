export type Status = 'busy' | 'waiting' | 'idle' | 'unknown'
export type Liveness = 'live' | 'stale' | 'dead'
export type Activity =
  | 'working' | 'researching_web' | 'reading' | 'meeting' | 'planning'
  | 'waiting_permission' | 'waiting_question' | 'idle' | 'done' | 'unknown'

export interface RegistryRecord {
  pid: number
  sessionId: string
  cwd: string
  status?: string
  waitingFor?: string
  model?: string
  version?: string
  entrypoint?: string
  kind?: string
  startedAt?: number
  updatedAt?: number
  bridgeSessionId?: string
}

export interface CostTokens {
  inputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  outputTokens: number
}

export interface TranscriptInfo {
  model: string | null
  title: string | null
  latestTool: string | null
  contextTokens: number
  cost: CostTokens
  subAgents: number
  queuedCount: number
  permissionMode: string | null
}

export interface Session {
  sessionId: string
  pid: number
  alive: boolean
  project: { name: string; cwd: string }
  status: Status
  activity: Activity
  waitingFor: string | null
  model: string | null
  version: string | null
  entrypoint: string | null
  title: string | null
  context: { tokens: number; limit: number; pct: number }
  cost: { usd: number }
  subAgents: number
  queuedCount: number
  permissionMode: string | null
  startedAt: number
  updatedAt: number
}

export interface Config {
  claudeHome: string
  host: string
  port: number
  vaultPath: string
  pollIntervalMs: number
  staleIdleMs: number
  logContent: boolean
  summaryModel: string
  claudeBin: string
  settingsPath: string
}

export interface Settings {
  summaries: boolean
}

export type SummaryStatus = 'written' | 'skipped' | 'disabled' | 'error'

export interface SummaryResult {
  ok: boolean
  status: SummaryStatus
  tldr?: string
  path?: string
  error?: string
}
