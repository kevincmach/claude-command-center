import os from 'node:os'
import path from 'node:path'
import type { Config } from '../shared/types.js'

export const SUMMARIZER_CWD = path.join(os.tmpdir(), 'ccc-summarizer')

interface Inputs {
  argv: string[]
  env: Record<string, string | undefined>
  home: string
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export function resolveConfig({ argv, env, home }: Inputs): Config {
  const has = (n: string) => argv.includes(n)
  const claudeHome =
    flag(argv, '--claude-home') ??
    env.CCC_CLAUDE_HOME ??
    path.join(home, '.claude')
  return {
    claudeHome,
    host: has('--lan') ? '0.0.0.0' : flag(argv, '--host') ?? '127.0.0.1',
    port: Number(flag(argv, '--port') ?? env.CCC_PORT ?? 4317),
    vaultPath:
      flag(argv, '--vault') ?? env.CCC_VAULT ?? path.join(home, 'ClaudeVault'),
    pollIntervalMs: Number(env.CCC_POLL_MS ?? 2000),
    staleIdleMs: Number(env.CCC_STALE_MS ?? 5 * 60 * 1000),
    logContent: has('--log-content'),
    summaryModel: flag(argv, '--summary-model') ?? env.CCC_SUMMARY_MODEL ?? 'haiku',
    claudeBin: flag(argv, '--claude-bin') ?? env.CCC_CLAUDE_BIN ?? 'claude',
    settingsPath:
      flag(argv, '--settings') ??
      env.CCC_SETTINGS ??
      path.join(home, '.claude-command-center', 'settings.json'),
  }
}
