import { describe, expect, it } from 'vitest'
import { colorRuns } from './bands'

describe('colorRuns', () => {
  it('returns nothing for an empty tube', () => {
    expect(colorRuns([])).toEqual([])
  })

  it('collapses a single run into one band', () => {
    expect(colorRuns([1, 1, 1, 1])).toEqual([{ color: 1, units: 4 }])
  })

  it('keeps distinct colors as separate bands', () => {
    expect(colorRuns([1, 2, 3])).toEqual([
      { color: 1, units: 1 },
      { color: 2, units: 1 },
      { color: 3, units: 1 },
    ])
  })

  it('merges adjacent runs but not repeated non-adjacent colors', () => {
    expect(colorRuns([2, 2, 1, 1, 2])).toEqual([
      { color: 2, units: 2 },
      { color: 1, units: 2 },
      { color: 2, units: 1 },
    ])
  })

  it('preserves total unit count', () => {
    const colors = [0, 0, 1, 2, 2, 2, 0]
    const total = colorRuns(colors).reduce((sum, band) => sum + band.units, 0)
    expect(total).toBe(colors.length)
  })
})
