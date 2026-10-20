/** Index into the color palette; renders as the CSS variable `--c-<id>`. */
export type ColorId = number

export interface Tube {
  /** Colors stacked bottom-first. Index 0 is the bottom of the tube. */
  colors: ColorId[]
}

export interface Move {
  from: number
  to: number
  /** Number of color units moved. */
  amount: number
}

export interface GameState {
  tubes: Tube[]
  /** How many units a single tube can hold. */
  capacity: number
  /** Index of the currently selected tube, or null when nothing is selected. */
  selected: number | null
  moves: number
  history: Move[]
  won: boolean
}

/**
 * A user or game action, used to drive presentation (animation, sound).
 * `main.ts` builds these; the water stage and UI consume them.
 */
export type GameEvent =
  | { type: 'pour'; from: number; to: number; amount: number; color: ColorId }
  | { type: 'select'; index: number }
  | { type: 'deselect' }
  | { type: 'invalid'; index: number }
  | { type: 'undo' }
  | { type: 'new' }
  | { type: 'none' }
