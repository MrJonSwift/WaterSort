import { clampLevel } from './levels'

/** Device-local play position. */
export interface Progress {
  /** Level currently being played. */
  level: number
  /** Highest level ever reached; kept separately for a future level picker. */
  highest: number
}

const STORAGE_KEY = 'watersort:progress'

export const DEFAULT_PROGRESS: Progress = {
  level: 1,
  highest: 1,
}

function readLevel(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clampLevel(value) : fallback
}

/** Load saved progress, falling back to defaults for missing/invalid data. */
export function loadProgress(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PROGRESS }
    const parsed = JSON.parse(raw) as Partial<Progress> | null
    const level = readLevel(parsed?.level, DEFAULT_PROGRESS.level)
    const highest = readLevel(parsed?.highest, DEFAULT_PROGRESS.highest)
    // You cannot have reached a level you have not reached yet.
    return { level, highest: Math.max(level, highest) }
  } catch {
    return { ...DEFAULT_PROGRESS }
  }
}

/** Persist progress. Silently ignores storage failures (private mode, quota). */
export function saveProgress(progress: Progress): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    /* ignore */
  }
}
