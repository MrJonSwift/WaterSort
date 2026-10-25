import { describe, expect, it } from 'vitest'
import { LEVELS, MAX_LEVEL, levelConfig } from './levels'

describe('levels', () => {
  it('ships the first four rows of the difficulty curve', () => {
    expect(LEVELS).toEqual([
      { colors: 3, emptyTubes: 2, scramble: 6 },
      { colors: 3, emptyTubes: 2, scramble: 8 },
      { colors: 3, emptyTubes: 2, scramble: 10 },
      { colors: 4, emptyTubes: 2, scramble: 8 },
    ])
    expect(MAX_LEVEL).toBe(LEVELS.length)
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
