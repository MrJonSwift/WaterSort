import { DEFAULT_CAPACITY, canPour, pour } from './rules'
import type { ColorId, GameState } from './types'

export function createGame(
  board: ColorId[][],
  capacity = DEFAULT_CAPACITY,
): GameState {
  return {
    tubes: board.map((colors) => ({ colors: [...colors] })),
    capacity,
    selected: null,
    moves: 0,
    history: [],
    won: false,
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Colours in a board. One colour fills one tube, so this is also the tube count. */
export const DEFAULT_COLOR_COUNT = 5
/** Spare tubes every board gets. Two is what makes a random deal usually solvable. */
export const DEFAULT_EMPTY_TUBES = 2

/**
 * Random puzzle: `colorCount` colors spread across that many tubes, plus
 * `emptyTubes` spare tubes.
 *
 * TODO: a random deal is not guaranteed to be solvable. Replace this with a
 * reverse-solve generator before shipping difficulty levels.
 */
export function generatePuzzle(
  colorCount = DEFAULT_COLOR_COUNT,
  emptyTubes = DEFAULT_EMPTY_TUBES,
  capacity = DEFAULT_CAPACITY,
): ColorId[][] {
  const pool: ColorId[] = []
  for (let color = 0; color < colorCount; color++) {
    for (let i = 0; i < capacity; i++) pool.push(color)
  }

  const shuffled = shuffle(pool)
  const board: ColorId[][] = []
  for (let i = 0; i < colorCount; i++) {
    board.push(shuffled.slice(i * capacity, (i + 1) * capacity))
  }
  for (let i = 0; i < emptyTubes; i++) board.push([])
  return board
}

/** Handle a tap on a tube: select it, deselect it, or pour. */
export function tap(state: GameState, index: number): GameState {
  if (state.won) return state
  const tube = state.tubes[index]
  if (!tube) return state

  if (state.selected === null) {
    return tube.colors.length > 0 ? { ...state, selected: index } : state
  }

  if (state.selected === index) return { ...state, selected: null }

  if (canPour(state.tubes, state.selected, index, state.capacity)) {
    return pour(state, state.selected, index)
  }

  // The move is illegal: switch the selection to the tapped tube, or clear it.
  return tube.colors.length > 0
    ? { ...state, selected: index }
    : { ...state, selected: null }
}

/** Undo the most recent pour. */
export function undo(state: GameState): GameState {
  const last = state.history[state.history.length - 1]
  if (!last) return state

  const tubes = state.tubes.map((tube) => ({ colors: [...tube.colors] }))
  for (let i = 0; i < last.amount; i++) {
    tubes[last.from].colors.push(tubes[last.to].colors.pop() as ColorId)
  }

  return {
    ...state,
    tubes,
    selected: null,
    moves: state.moves - 1,
    history: state.history.slice(0, -1),
    won: false,
  }
}
