import type { ColorId } from './types'

/** A contiguous run of one color inside a tube. */
export interface Band {
  color: ColorId
  /** Number of units in this run. */
  units: number
}

/**
 * Collapse a bottom-first list of colors into contiguous same-color runs.
 *
 * This is what makes the liquid read as water rather than stacked blocks: a
 * tube of `[red, red, blue, blue]` becomes two bands, not four segments.
 */
export function colorRuns(colors: readonly ColorId[]): Band[] {
  const bands: Band[] = []
  for (const color of colors) {
    const last = bands[bands.length - 1]
    if (last && last.color === color) last.units++
    else bands.push({ color, units: 1 })
  }
  return bands
}
