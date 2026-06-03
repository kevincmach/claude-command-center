import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from './config.js'
import { discover } from './discovery.js'
import { SessionStore } from './session-model.js'
import { Hub } from './watcher.js'
import { EventLog } from './event-log.js'
import { createServer } from './server.js'

export function main(argv = process.argv.slice(2)): void {
  const cfg = resolveConfig({ argv, env: process.env, home: os.homedir() })
  const d = discover(cfg.claudeHome)
  if (!d.ok) {
    console.error(`\n  ⚠  ${d.message}\n`)
    process.exit(1)
  }

  const store = new SessionStore(cfg)
  const hub = new Hub(store)
  const log = new EventLog(cfg.vaultPath)
  hub.subscribe((ev) => log.record(ev))

  const webRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public', // built frontend lives in dist/public after `npm run build`
  )
  const app = createServer(store, hub, webRoot)

  hub.start(cfg.claudeHome, cfg.pollIntervalMs)
  app.listen(cfg.port, cfg.host, () => {
    const shown = cfg.host === '0.0.0.0' ? 'your-LAN-IP' : cfg.host
    console.log(`\n  🎮 Claude Command Center → http://${shown}:${cfg.port}`)
    if (cfg.host === '0.0.0.0') {
      console.log('  ⚠  LAN mode: trusted networks only.\n')
    }
  })
}

main()
