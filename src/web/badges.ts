// Single source of truth for the small visual signals derived from a Session.
// Pure functions, unit-tested — Character.tsx and CharacterDetail.tsx consume these.

const FAMILIES = ['Opus', 'Sonnet', 'Haiku'] as const

/** Friendly short label for a model id, e.g. `claude-opus-4-8` → "Opus".
 *  Unknown model → the raw string (don't hide info). null/empty → "—". */
export function modelLabel(model: string | null): string {
  if (!model) return '—'
  const lower = model.toLowerCase()
  for (const fam of FAMILIES) {
    if (lower.includes(fam.toLowerCase())) return fam
  }
  return model
}

export interface PermissionBadge {
  icon: string
  label: string
}

/** Corner-badge for a permission mode. bypass → ⚠️ YOLO, plan → 📋 Plan.
 *  normal / acceptEdits / null → null (nothing shown on the character). */
export function permissionBadge(mode: string | null): PermissionBadge | null {
  if (mode === 'bypassPermissions') return { icon: '⚠️', label: 'YOLO' }
  if (mode === 'plan') return { icon: '📋', label: 'Plan' }
  return null
}
