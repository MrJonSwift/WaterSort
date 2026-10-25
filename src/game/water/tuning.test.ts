import { describe, expect, it } from 'vitest'
import {
  LIFT_MS,
  POUR_BUDGET_MS,
  RETURN_MS,
  STREAM_BASE_MS,
  pourTotalMs,
  streamMs,
} from './tuning'

describe('pour timing', () => {
  it('has every phase of the choreography', () => {
    expect(LIFT_MS).toBeGreaterThan(0)
    expect(STREAM_BASE_MS).toBeGreaterThan(0)
    expect(RETURN_MS).toBeGreaterThan(0)
  })

  it('keeps the longest pour inside the budget', () => {
    expect(pourTotalMs(4)).toBeLessThanOrEqual(POUR_BUDGET_MS)
  })

  it('takes longer for more units without stretching the pour', () => {
    expect(streamMs(4)).toBeGreaterThan(streamMs(1))
    expect(pourTotalMs(1)).toBeLessThan(pourTotalMs(4))
    expect(pourTotalMs(4) - pourTotalMs(1)).toBeLessThan(100)
  })

  it('is exactly lift plus stream plus return', () => {
    expect(pourTotalMs(4)).toBe(LIFT_MS + streamMs(4) + RETURN_MS)
  })

  it('never returns a negative stream for a nonsense amount', () => {
    expect(streamMs(-3)).toBeGreaterThan(0)
  })
})
