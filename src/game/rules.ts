import type { ColorId, GameState, Tube } from './types'

/** How many units a tube holds by default. */
export const DEFAULT_CAPACITY = 4

export function topColor(tube: Tube): ColorId | null {
  return tube.colors.length > 0 ? tube.colors[tube.colors.length - 1] : null
}

/** Count of equal-colored units at the top of a tube. */
export function topRun(tube: Tube): number {
  const { colors } = tube
  if (colors.length === 0) return 0
  const color = colors[colors.length - 1]
  let run = 1
  for (let i = colors.length - 2; i >= 0 && colors[i] === color; i--) run++
  return run
}

export function isFull(tube: Tube, capacity: number): boolean {
  return tube.colors.length >= capacity
}

/** A tube is complete when it is full of a single color. */
export function isComplete(tube: Tube, capacity: number): boolean {
  return (
    tube.colors.length === capacity &&
    tube.colors.every((color) => color === tube.colors[0])
  )
}

/** Whether a pour from `from` into `to` is legal. */
export function canPour(
  tubes: readonly Tube[],
  from: number,
  to: number,
  capacity: number,
): boolean {
  if (from === to) return false
  const src = tubes[from]
  const dst = tubes[to]
  if (!src || !dst) return false
  if (src.colors.length === 0) return false
  if (isFull(dst, capacity)) return false
  const color = topColor(src)
  const dstTop = topColor(dst)
  return dstTop === null || dstTop === color
}

/** How many units a pour would move (0 when the pour is illegal). */
export function pourAmount(
  tubes: readonly Tube[],
  from: number,
  to: number,
  capacity: number,
): number {
  if (!canPour(tubes, from, to, capacity)) return 0
  return Math.min(topRun(tubes[from]), capacity - tubes[to].colors.length)
}

export function isWon(state: GameState): boolean {
  return state.tubes.every(
    (tube) => tube.colors.length === 0 || isComplete(tube, state.capacity),
  )
}

/** Apply a pour and return a new state. Returns the same state when illegal. */
export function pour(state: GameState, from: number, to: number): GameState {
  const amount = pourAmount(state.tubes, from, to, state.capacity)
  if (amount === 0) return state

  const tubes = state.tubes.map((tube) => ({ colors: [...tube.colors] }))
  for (let i = 0; i < amount; i++) {
    tubes[to].colors.push(tubes[from].colors.pop() as ColorId)
  }

  const next: GameState = {
    ...state,
    tubes,
    selected: null,
    moves: state.moves + 1,
    history: [...state.history, { from, to, amount }],
  }
  return { ...next, won: isWon(next) }
}
