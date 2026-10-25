/**
 * The numbered difficulty curve.
 *
 * A level config describes one board: how many colours fill tubes, how many
 * spare tubes sit beside them, and how many reverse moves to scramble it with.
 * Capacity is not part of it — capacity is a rule (`rules.ts`), not difficulty.
 */
export interface LevelConfig {
  /** Distinct colours on the board, one full tube's worth each. */
  colors: number
  /** Spare tubes added after the full ones. */
  emptyTubes: number
  /** Reverse moves applied to the solved board while scrambling. */
  scramble: number
}

/** Rows 1–4 of the final curve; ticket 04 appends the rest. */
export const LEVELS: readonly LevelConfig[] = [
  { colors: 3, emptyTubes: 2, scramble: 6 },
  { colors: 3, emptyTubes: 2, scramble: 8 },
  { colors: 3, emptyTubes: 2, scramble: 10 },
  { colors: 4, emptyTubes: 2, scramble: 8 },
]

export const MAX_LEVEL = LEVELS.length

/** Clamp any input into the valid `1..MAX_LEVEL` range. */
export function clampLevel(level: number): number {
  const safe = Number.isFinite(level) ? Math.trunc(level) : 1
  return Math.min(MAX_LEVEL, Math.max(1, safe))
}

/**
 * Config for a level number, clamped into `1..MAX_LEVEL`.
 *
 * Clamping (rather than throwing) keeps a corrupt save or a bad call from
 * taking the app down. Progress is clamped independently on load.
 */
export function levelConfig(level: number): LevelConfig {
  return LEVELS[clampLevel(level) - 1]
}
