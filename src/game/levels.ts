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

/**
 * The 30-level curve: 3 colours at level 1 up to 8 colours and 36 reverse
 * moves at level 30. Every level keeps two spare tubes; the ramp comes from
 * colours and scramble, never from taking a spare away.
 *
 * Each new colour tier starts below the previous tier's last scramble, so the
 * extra colour is the step rather than the colour plus a scramble jump.
 */
export const LEVELS: readonly LevelConfig[] = [
  { colors: 3, emptyTubes: 2, scramble: 6 },
  { colors: 3, emptyTubes: 2, scramble: 8 },
  { colors: 3, emptyTubes: 2, scramble: 10 },
  { colors: 4, emptyTubes: 2, scramble: 8 },
  { colors: 4, emptyTubes: 2, scramble: 10 },
  { colors: 4, emptyTubes: 2, scramble: 12 },
  { colors: 5, emptyTubes: 2, scramble: 10 },
  { colors: 5, emptyTubes: 2, scramble: 12 },
  { colors: 5, emptyTubes: 2, scramble: 14 },
  { colors: 5, emptyTubes: 2, scramble: 16 },
  { colors: 6, emptyTubes: 2, scramble: 12 },
  { colors: 6, emptyTubes: 2, scramble: 14 },
  { colors: 6, emptyTubes: 2, scramble: 16 },
  { colors: 6, emptyTubes: 2, scramble: 18 },
  { colors: 7, emptyTubes: 2, scramble: 14 },
  { colors: 7, emptyTubes: 2, scramble: 16 },
  { colors: 7, emptyTubes: 2, scramble: 18 },
  { colors: 7, emptyTubes: 2, scramble: 20 },
  { colors: 7, emptyTubes: 2, scramble: 22 },
  { colors: 8, emptyTubes: 2, scramble: 16 },
  { colors: 8, emptyTubes: 2, scramble: 18 },
  { colors: 8, emptyTubes: 2, scramble: 20 },
  { colors: 8, emptyTubes: 2, scramble: 22 },
  { colors: 8, emptyTubes: 2, scramble: 24 },
  { colors: 8, emptyTubes: 2, scramble: 26 },
  { colors: 8, emptyTubes: 2, scramble: 28 },
  { colors: 8, emptyTubes: 2, scramble: 30 },
  { colors: 8, emptyTubes: 2, scramble: 32 },
  { colors: 8, emptyTubes: 2, scramble: 34 },
  { colors: 8, emptyTubes: 2, scramble: 36 },
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
