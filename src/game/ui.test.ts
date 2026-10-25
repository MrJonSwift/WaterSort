import { describe, expect, it } from 'vitest'
import { tubeColumns } from './ui'

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
