import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../shared/types.js'

export class SettingsStore {
  private current: Settings

  constructor(
    private file: string,
    defaults: Settings,
  ) {
    this.current = { ...defaults }
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (raw && typeof raw === 'object') this.current = { ...defaults, ...raw }
    } catch {
      /* missing or corrupt → keep defaults */
    }
  }

  get(): Settings {
    return { ...this.current }
  }

  patch(partial: Partial<Settings>): Settings {
    this.current = { ...this.current, ...partial }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.current, null, 2))
    } catch {
      /* best-effort persistence — never throw */
    }
    return this.get()
  }
}
