/**
 * Seeded level generator.
 *
 * A board is built by starting from the solved position and applying legal
 * *reverse* moves. Every reverse move is recorded as its forward inverse, so
 * replaying that list in reverse order solves the board by construction; no
 * search or solver runs at runtime.
 *
 * Everything here is pure: no DOM, no storage, no clock and no `Math.random`.
 * The same level number yields the same board on every device.
 */
import { clampLevel, levelConfig, type LevelConfig } from './levels'
import {
  DEFAULT_CAPACITY,
  isComplete,
  isWon,
  pour,
  topColor,
  topRun,
} from './rules'
import { createGame } from './state'
import type { ColorId, Move, Tube } from './types'

export interface Level {
  /** Starting tubes, bottom-first within each tube. */
  board: ColorId[][]
  /** Forward moves that solve the board, in order. */
  solution: Move[]
}

/** Attempts per config before easing the scramble. */
const ATTEMPTS = 64
/** How much easier the single fallback pass is. */
const EASIER_STEP = 2

/** Deterministic, tiny PRNG (mulberry32). Same output on every platform. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mix the level, its scramble and the attempt number into an attempt seed. */
function seedFor(level: number, scramble: number, attempt: number): number {
  let hash = Math.imul(Math.trunc(level) + 1, 0x9e3779b1)
  hash = Math.imul(hash ^ (Math.trunc(scramble) + 1), 0x85ebca6b)
  hash = Math.imul(hash ^ (attempt + 1), 0xc2b2ae35)
  return hash >>> 0
}

interface ReverseMove {
  from: number
  to: number
  amount: number
}

/**
 * Every legal reverse move: `amount` units of the top colour move from `from`
 * to `to`, and the forward inverse (`to` -> `from`) stays legal afterwards.
 *
 * The forward pour is legal only if the source keeps that colour on top after
 * the removal, or becomes empty. The destination must be empty or carry a
 * different top colour, and must have room for the whole run.
 */
function reverseMoves(tubes: readonly Tube[], capacity: number): ReverseMove[] {
  const moves: ReverseMove[] = []
  for (let from = 0; from < tubes.length; from++) {
    const source = tubes[from]
    const color = topColor(source)
    if (color === null) continue
    const run = topRun(source)
    for (let to = 0; to < tubes.length; to++) {
      if (to === from) continue
      const room = capacity - tubes[to].colors.length
      if (room <= 0) continue
      if (topColor(tubes[to]) === color) continue
      for (let amount = 1; amount <= run && amount <= room; amount++) {
        if (amount < run || amount === source.colors.length) {
          moves.push({ from, to, amount })
        }
      }
    }
  }
  return moves
}

/** Apply one reverse move in place. */
function applyReverse(tubes: Tube[], move: ReverseMove): void {
  for (let i = 0; i < move.amount; i++) {
    tubes[move.to].colors.push(tubes[move.from].colors.pop() as ColorId)
  }
}

function runCount(board: readonly (readonly ColorId[])[]): number {
  let runs = 0
  for (const tube of board) {
    for (let i = 0; i < tube.length; i++) {
      if (i === 0 || tube[i] !== tube[i - 1]) runs++
    }
  }
  return runs
}

/**
 * The quality gate: a finished, legal scramble must actually look mixed.
 *
 * No tube may start complete, the board must not already be won, and the
 * colour runs must reach `min(colors * capacity, colors + ceil(scramble / 3))`.
 */
function passesQuality(
  board: ColorId[][],
  colors: number,
  scramble: number,
  capacity: number,
): boolean {
  const state = createGame(board, capacity)
  if (isWon(state)) return false
  if (state.tubes.some((tube) => isComplete(tube, capacity))) return false
  const threshold = Math.min(colors * capacity, colors + Math.ceil(scramble / 3))
  return runCount(board) >= threshold
}

interface Attempt {
  level: Level
  /** Passed the quality gate; a legal board always exists either way. */
  mixed: boolean
}

/**
 * Cut dead weight off the end of a solution.
 *
 * A reverse move may lift a whole single-colour run onto an empty tube: its
 * inverse then relocates an already-complete tube and is never needed, because
 * the board is won before it can be played. Replaying the inverses and stopping
 * at the first win keeps the recorded solution honest without changing the
 * board or the reverse-move rules.
 */
function trimSolution(board: ColorId[][], solution: Move[], capacity: number): Move[] {
  let state = createGame(board, capacity)
  for (let i = 0; i < solution.length; i++) {
    state = pour(state, solution[i].from, solution[i].to)
    if (isWon(state)) return solution.slice(0, i + 1)
  }
  return solution
}

/** One scramble attempt. Always returns a legal, solvable board when possible. */
function attempt(config: LevelConfig, seed: number): Attempt {
  const capacity = DEFAULT_CAPACITY
  const colors = Math.max(0, Math.trunc(config.colors))
  const emptyTubes = Math.max(0, Math.trunc(config.emptyTubes))
  const scramble = Math.max(0, Math.trunc(config.scramble))

  const tubes: Tube[] = []
  for (let color = 0; color < colors; color++) {
    tubes.push({ colors: Array.from({ length: capacity }, () => color) })
  }
  for (let i = 0; i < emptyTubes; i++) tubes.push({ colors: [] })

  const inverses: Move[] = []
  const rng = mulberry32(seed)
  let completed = true
  for (let step = 0; step < scramble; step++) {
    const moves = reverseMoves(tubes, capacity)
    if (moves.length === 0) {
      completed = false
      break
    }
    const pick = Math.min(moves.length - 1, Math.floor(rng() * moves.length))
    const move = moves[pick]
    applyReverse(tubes, move)
    inverses.push({ from: move.to, to: move.from, amount: move.amount })
  }

  const board = tubes.map((tube) => [...tube.colors])
  const solution = trimSolution(board, inverses.reverse(), capacity)
  return {
    level: { board, solution },
    mixed: completed && passesQuality(board, colors, scramble, capacity),
  }
}

/**
 * One seeded attempt at a scrambled, solvable board.
 *
 * Returns `null` when the attempt fails the quality gate (including a scramble
 * that ran out of legal reverse moves), so the caller can retry with a new seed.
 */
export function generateBoard(config: LevelConfig, seed: number): Level | null {
  const result = attempt(config, seed)
  return result.mixed ? result.level : null
}

interface Search {
  found: Level | null
  /** Last legal, solvable board seen, whether or not it was mixed enough. */
  last: Level | null
}

/** Up to `ATTEMPTS` seeds for one config. */
function search(config: LevelConfig, level: number): Search {
  let last: Level | null = null
  for (let index = 0; index < ATTEMPTS; index++) {
    const result = attempt(config, seedFor(level, config.scramble, index))
    if (result.level.board.length > 0) last = result.level
    if (result.mixed) return { found: result.level, last }
  }
  return { found: null, last }
}

/**
 * Build the board for a numbered level.
 *
 * Seeds are derived from the level number, so the same level is always the same
 * board. If no attempt passes the mixing gate, the whole search runs once more
 * with `scramble - 2`: a slightly easier level beats a hang. If that also
 * fails, the last legal, solvable board is returned rather than throwing —
 * solvability is a hard requirement, how well mixed a board looks is not.
 */
export function generateLevel(level: number): Level {
  const safeLevel = clampLevel(level)
  const config = levelConfig(safeLevel)

  const primary = search(config, safeLevel)
  if (primary.found) return primary.found

  const easier: LevelConfig = {
    ...config,
    scramble: Math.max(0, config.scramble - EASIER_STEP),
  }
  const secondary = search(easier, safeLevel)
  if (secondary.found) return secondary.found

  const fallback = secondary.last ?? primary.last
  if (fallback) return fallback

  // Degenerate config (no colours, no spare tubes): nothing can be built.
  return { board: [], solution: [] }
}
