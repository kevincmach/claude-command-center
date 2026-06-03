import type { Liveness } from '../shared/types.js'

/** Pure: decide liveness from already-known facts. */
export function classifyLiveness(
  alive: boolean,
  updatedAt: number,
  now: number,
  staleIdleMs: number,
): Liveness {
  if (!alive) return 'dead'
  if (now - updatedAt > staleIdleMs) return 'stale'
  return 'live'
}

/** Impure: ask the OS whether a pid exists. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = existence check, sends nothing
    return true
  } catch (e: any) {
    return e?.code === 'EPERM' // EPERM = process exists but isn't ours
  }
}
