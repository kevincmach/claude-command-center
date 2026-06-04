// Resolve a semantic prop name (e.g. "desk") to its built image URL.
import names from './assets/props/names.json' with { type: 'json' }

const files = import.meta.glob('./assets/props/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const PROP_URL: Record<string, string> = {}
for (const [filePath, url] of Object.entries(files)) {
  const base = filePath.split('/').pop()!.replace('.png', '') // "prop_00"
  const semantic = (names as Record<string, string>)[base]
  if (semantic) PROP_URL[semantic] = url
}
