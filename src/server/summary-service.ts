import type { Config, Session, SummaryResult } from '../shared/types.js'
import { discover } from './discovery.js'
import { findTranscriptPath } from './transcript-reader.js'
import { distillTranscript } from './transcript-distiller.js'
import { summarize, type SummaryRunner } from './summarizer.js'
import { hasSummary, writeSummary } from './summary-writer.js'
import type { SettingsStore } from './settings.js'

function tldrOf(summary: string): string | undefined {
  const m = summary.match(/\*\*TL;DR:\*\*\s*(.+)/)
  return m ? m[1].trim() : undefined
}

export class SummaryService {
  constructor(
    private cfg: Config,
    private settings: SettingsStore,
    private run: SummaryRunner,
  ) {}

  async maybeSummarize(
    session: Session,
    opts: { force?: boolean } = {},
  ): Promise<SummaryResult> {
    try {
      if (!this.settings.get().summaries) return { ok: true, status: 'disabled' }
      if (!opts.force && hasSummary(this.cfg.vaultPath, session.sessionId))
        return { ok: true, status: 'skipped' }

      const d = discover(this.cfg.claudeHome)
      if (!d.ok) return { ok: true, status: 'skipped' }

      const tpath = findTranscriptPath(d.projectsDir, session.sessionId)
      const source = tpath ? await distillTranscript(tpath) : ''
      if (!source.trim()) return { ok: true, status: 'skipped' }

      const summary = await summarize(source, {
        run: this.run,
        model: this.cfg.summaryModel,
      })
      if (!summary) return { ok: true, status: 'skipped' }

      writeSummary(this.cfg.vaultPath, session.sessionId, summary)
      return { ok: true, status: 'written', tldr: tldrOf(summary) }
    } catch (e) {
      return {
        ok: false,
        status: 'error',
        error: String((e as Error)?.message ?? e),
      }
    }
  }
}
