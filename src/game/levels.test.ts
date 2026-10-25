import { describe, expect, it } from 'vitest'
import { LEVELS, MAX_LEVEL, levelConfig } from './levels'

/**
 * The validated curve as `colours/spare/scramble`. This is the contract the
 * family plays: a change to any token is a difficulty change and belongs in
 * the ticket, not in a drive-by edit.
 */
const CURVE = [
  '3/2/6', '3/2/8', '3/2/10',
  '4/2/8', '4/2/10', '4/2/12',
  '5/2/10', '5/2/12', '5/2/14', '5/2/16',
  '6/2/12', '6/2/14', '6/2/16', '6/2/18',
  '7/2/14', '7/2/16', '7/2/18', '7/2/20', '7/2/22',
  '8/2/16', '8/2/18', '8/2/20', '8/2/22', '8/2/24', '8/2/26', '8/2/28',
  '8/2/30', '8/2/32', '8/2/34', '8/2/36',
]

/** The level that first adds a colour, and the tubes it starts with. */
const TIERS: Array<[level: number, tubes: number]> = [
  [1, 5],
  [4, 6],
  [7, 7],
  [11, 8],
  [15, 9],
  [20, 10],
]

describe('levels', () => {
  it('ships the validated 30-level curve', () => {
    expect(LEVELS.map((l) => `${l.colors}/${l.emptyTubes}/${l.scramble}`)).toEqual(CURVE)
    expect(MAX_LEVEL).toBe(LEVELS.length)
  })

  it('never removes a spare tube and never jumps backwards in colour', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      expect(LEVELS[i].emptyTubes).toBe(2)
      if (i > 0) expect(LEVELS[i].colors).toBeGreaterThanOrEqual(LEVELS[i - 1].colors)
    }
  })

  it('raises the scramble within a colour tier', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      if (LEVELS[i].colors === LEVELS[i - 1].colors) {
        expect(LEVELS[i].scramble).toBeGreaterThan(LEVELS[i - 1].scramble)
      }
    }
  })

  it('adds one colour at a time, below the previous tier end', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      if (LEVELS[i].colors > LEVELS[i - 1].colors) {
        expect(LEVELS[i].colors).toBe(LEVELS[i - 1].colors + 1)
        expect(LEVELS[i].scramble).toBeLessThan(LEVELS[i - 1].scramble)
      }
    }
  })

  it('grows the tube count on the documented levels', () => {
    for (const [level, tubes] of TIERS) {
      const config = LEVELS[level - 1]
      expect(config.colors + config.emptyTubes).toBe(tubes)
    }
  })

  it('clamps out-of-range levels into the table', () => {
    expect(levelConfig(0)).toBe(LEVELS[0])
    expect(levelConfig(-3)).toBe(LEVELS[0])
    expect(levelConfig(99)).toBe(LEVELS[MAX_LEVEL - 1])
  })

  it('truncates fractional levels', () => {
    expect(levelConfig(2.9)).toBe(LEVELS[1])
  })
})
