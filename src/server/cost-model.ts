import type { CostTokens } from '../shared/types.js'

const LIMITS: Record<string, number> = { 'claude-opus-4-8': 200_000 }
const DEFAULT_LIMIT = 200_000

// $ per 1M tokens (approximate; precise accounting lands in Tier 4)
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
}
const DEFAULT_PRICE = { in: 3, out: 15 }

export function contextLimit(model: string | null): number {
  return (model && LIMITS[model]) || DEFAULT_LIMIT
}

export function computeContext(tokens: number, limit: number) {
  return { tokens, limit, pct: Math.round((tokens / limit) * 100) }
}

export function estimateCost(model: string | null, t: CostTokens): number {
  const p = (model && PRICING[model]) || DEFAULT_PRICE
  const usd =
    (t.inputTokens * p.in +
      t.cacheCreateTokens * p.in * 1.25 + // cache writes ~1.25x input
      t.cacheReadTokens * p.in * 0.1 + // cache reads ~0.1x input
      t.outputTokens * p.out) /
    1_000_000
  return Math.round(usd * 100) / 100
}
