import express from 'express'
import type { SessionStore } from './session-model.js'
import type { Hub } from './watcher.js'
import type { SettingsStore } from './settings.js'
import type { SummaryService } from './summary-service.js'
import { readSessionPage } from './summary-writer.js'

export interface ServerDeps {
  settings: SettingsStore
  summaryService: SummaryService
  claudeAvailable: boolean
  vaultPath: string
  onSummariesEnabled?: () => void
}

export function createServer(
  store: SessionStore,
  hub: Hub,
  webRoot: string,
  deps: ServerDeps,
) {
  const app = express()
  app.use(express.json())

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

  app.get('/api/settings', (_req, res) => {
    res.json({ ...deps.settings.get(), claudeAvailable: deps.claudeAvailable })
  })

  app.patch('/api/settings', (req, res) => {
    const wasOff = !deps.settings.get().summaries
    const patch =
      typeof req.body?.summaries === 'boolean'
        ? { summaries: req.body.summaries as boolean }
        : {}
    const next = deps.settings.patch(patch)
    if (wasOff && next.summaries) deps.onSummariesEnabled?.()
    res.json({ ...next, claudeAvailable: deps.claudeAvailable })
  })

  app.get('/api/sessions/:id/page', (req, res) => {
    const id = req.params.id
    if (!/^[\w-]+$/.test(id)) {
      res.status(400).type('text/plain').send('bad id')
      return
    }
    const md = readSessionPage(deps.vaultPath, id)
    if (md == null) {
      res.status(404).type('text/plain').send('no vault page yet')
      return
    }
    res.type('text/markdown; charset=utf-8').send(md)
  })

  app.post('/api/sessions/:id/summarize', async (req, res) => {
    const s = store.all().find((x) => x.sessionId === req.params.id)
    if (!s) {
      res.status(404).json({ ok: false, status: 'error', error: 'unknown session' })
      return
    }
    res.json(await deps.summaryService.maybeSummarize(s, { force: true }))
  })

  app.use(express.static(webRoot)) // serves the built React app
  return app
}
