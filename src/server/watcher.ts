import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { discover } from './discovery.js'
import type { SessionStore, SessionEvent } from './session-model.js'

type Listener = (ev: SessionEvent) => void

/** Holds subscribers and a refresh trigger. start() adds real fs/timer wiring. */
export class Hub {
  private listeners = new Set<Listener>()
  private watcher?: FSWatcher
  private timer?: NodeJS.Timeout

  constructor(private store: SessionStore) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  async tick(): Promise<void> {
    const events = await this.store.refresh()
    for (const ev of events) for (const fn of this.listeners) fn(ev)
  }

  start(claudeHome: string, pollIntervalMs: number): void {
    const d = discover(claudeHome)
    if (d.ok) {
      this.watcher = chokidar.watch([d.sessionsDir, d.projectsDir], {
        ignoreInitial: true,
        depth: 2,
      })
      this.watcher.on('all', () => {
        void this.tick()
      })
    }
    this.timer = setInterval(() => {
      void this.tick()
    }, pollIntervalMs)
    void this.tick() // initial snapshot
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    if (this.watcher) await this.watcher.close()
  }
}
