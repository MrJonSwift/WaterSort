export interface Settings {
  /** Sound effects enabled. Defaults to off. */
  sound: boolean
  /** Animate pouring between tubes. Defaults to on. */
  pourFx: boolean
}

const STORAGE_KEY = 'watersort:settings'

export const DEFAULT_SETTINGS: Settings = {
  sound: false,
  pourFx: true,
}

/** Load persisted settings, falling back to defaults for missing/invalid data. */
export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_SETTINGS.sound,
      pourFx: typeof parsed.pourFx === 'boolean' ? parsed.pourFx : DEFAULT_SETTINGS.pourFx,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Persist settings. Silently ignores storage failures (private mode, quota). */
export function saveSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
