import { describe, expect, it } from 'vitest'
import { canPour, isWon, pour, pourAmount, topRun } from './rules'
import { createGame, tap, undo } from './state'
import type { ColorId, Tube } from './types'

/** Build a Tube for the pure rule helpers. */
const tube = (...colors: ColorId[]): Tube => ({ colors })

/** Build a board of color arrays for createGame. */
const board = (...tubes: ColorId[][]): ColorId[][] => tubes

describe('topRun', () => {
  it('counts equal colors at the top only', () => {
    expect(topRun(tube(1, 2, 2))).toBe(2)
    expect(topRun(tube(1, 1, 2))).toBe(1)
    expect(topRun(tube())).toBe(0)
  })
})

describe('canPour', () => {
  it('rejects pouring into a full tube', () => {
    expect(canPour([tube(1), tube(1, 1, 1, 1)], 0, 1, 4)).toBe(false)
  })

  it('rejects pouring onto a different color', () => {
    expect(canPour([tube(1), tube(2)], 0, 1, 4)).toBe(false)
  })

  it('allows pouring onto an empty tube', () => {
    expect(canPour([tube(1), tube()], 0, 1, 4)).toBe(true)
  })

  it('rejects pouring from an empty tube', () => {
    expect(canPour([tube(), tube()], 0, 1, 4)).toBe(false)
  })

  it('rejects pouring a tube into itself', () => {
    expect(canPour([tube(1, 1)], 0, 0, 4)).toBe(false)
  })
})

describe('pourAmount', () => {
  it('moves the whole top run when there is room', () => {
    expect(pourAmount([tube(1, 2, 2, 2), tube()], 0, 1, 4)).toBe(3)
  })

  it('moves only as many units as fit', () => {
    expect(pourAmount([tube(2, 2, 2), tube(2, 2)], 0, 1, 4)).toBe(2)
  })
})

describe('pour', () => {
  it('is immutable and records history', () => {
    const state = createGame(board([1, 1], []))
    const next = pour(state, 0, 1)

    expect(state.tubes[0].colors).toEqual([1, 1])
    expect(next.tubes[0].colors).toEqual([])
    expect(next.tubes[1].colors).toEqual([1, 1])
    expect(next.moves).toBe(1)
    expect(next.history).toEqual([{ from: 0, to: 1, amount: 2 }])
  })

  it('detects a win', () => {
    const state = createGame(board([1, 1], [1, 1]))
    expect(isWon(state)).toBe(false)

    const next = pour(state, 0, 1)
    expect(next.tubes[1].colors).toEqual([1, 1, 1, 1])
    expect(next.won).toBe(true)
  })

  it('ignores illegal pours', () => {
    const state = createGame(board([1], [2]))
    expect(pour(state, 0, 1)).toBe(state)
  })
})

describe('tap', () => {
  it('selects a tube, then pours on the next tap', () => {
    let state = createGame(board([1, 1], []))
    state = tap(state, 0)
    expect(state.selected).toBe(0)

    state = tap(state, 1)
    expect(state.selected).toBeNull()
    expect(state.tubes[1].colors).toEqual([1, 1])
  })

  it('deselects when tapping the selected tube again', () => {
    let state = createGame(board([1], []))
    state = tap(state, 0)
    state = tap(state, 0)
    expect(state.selected).toBeNull()
  })

  it('ignores taps on empty tubes', () => {
    const state = createGame(board([], []))
    expect(tap(state, 0)).toBe(state)
  })
})

describe('undo', () => {
  it('reverses the most recent pour', () => {
    let state = createGame(board([1, 1], []))
    state = tap(state, 0)
    state = tap(state, 1)
    state = undo(state)

    expect(state.tubes[0].colors).toEqual([1, 1])
    expect(state.tubes[1].colors).toEqual([])
    expect(state.moves).toBe(0)
    expect(state.history).toEqual([])
  })

  it('is a no-op when there is nothing to undo', () => {
    const state = createGame(board([1], []))
    expect(undo(state)).toBe(state)
  })
})
