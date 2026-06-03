import type { Activity, Liveness } from '../shared/types.js'

interface Input {
  status: string | undefined
  waitingFor: string | null
  latestTool: string | null
  liveness: Liveness
}

const TOOL_ROOMS: Record<string, Activity> = {
  WebSearch: 'researching_web',
  WebFetch: 'researching_web',
  Task: 'meeting',
  Agent: 'meeting',
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  Edit: 'working',
  Write: 'working',
  Bash: 'working',
  NotebookEdit: 'working',
}

export function classifyActivity(i: Input): Activity {
  if (i.liveness === 'dead') return 'done'
  if (i.status === 'waiting') {
    return i.waitingFor && /permission/i.test(i.waitingFor)
      ? 'waiting_permission'
      : 'waiting_question'
  }
  if (i.liveness === 'stale' || i.status === 'idle') return 'idle'
  if (i.latestTool && TOOL_ROOMS[i.latestTool]) return TOOL_ROOMS[i.latestTool]
  if (i.status === 'busy') return 'working'
  return 'unknown'
}
