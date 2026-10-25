import { describe, expect, it } from 'vitest'
import { MAX_LEVEL } from './levels'
import { bannerCopy, tubeColumns } from './ui'

describe('bannerCopy', () => {
  it('reports the moves for a mid-run win', () => {
    expect(bannerCopy(7, MAX_LEVEL, 1)).toBe('Level 7 solved in 1 move')
    expect(bannerCopy(7, MAX_LEVEL, 12)).toBe('Level 7 solved in 12 moves')
  })

  it('names the level count on the last level', () => {
    expect(bannerCopy(MAX_LEVEL, MAX_LEVEL, 24)).toBe(`All ${MAX_LEVEL} levels complete!`)
  })
})

describe('tubeColumns', () => {
  it('uses one row up to five tubes and at most two rows above that', () => {
    const table: Array<[number, number]> = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 3],
      [7, 4],
      [8, 4],
      [9, 5],
      [10, 5],
    ]
    for (const [count, columns] of table) {
      expect(tubeColumns(count)).toBe(columns)
    }
  })
})
