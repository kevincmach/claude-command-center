import express from 'express'
import type { SessionStore } from './session-model.js'
import type { Hub } from './watcher.js'

export function createServer(store: SessionStore, hub: Hub, webRoot: string) {
  const app = express()

  app.get('/api/state', (_req, res) => {
    res.json(store.all())
  })

  app.get('/api/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.flushHeaders()
    res.write(`event: snapshot\ndata: ${JSON.stringify(store.all())}\n\n`)
    const unsub = hub.subscribe((ev) => {
      res.write(`event: ${ev.kind}\ndata: ${JSON.stringify(ev.session)}\n\n`)
    })
    req.on('close', () => {
      unsub()
    })
  })

  app.use(express.static(webRoot)) // serves the built React app
  return app
}
