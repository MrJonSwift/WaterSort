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
