/**
 * The single source of truth for game colours.
 *
 * The CSS custom properties `--c-<n>` are generated from this table at boot
 * (`applyPaletteToCss`), so DOM styling and canvas painting can never drift.
 */
export type RGB = readonly [number, number, number]

export const PALETTE: readonly RGB[] = [
  [255, 77, 94], // 0 red
  [61, 139, 255], // 1 blue
  [23, 217, 158], // 2 teal
  [255, 210, 63], // 3 yellow
  [176, 108, 240], // 4 purple
  [255, 127, 176], // 5 pink
  [126, 217, 87], // 6 green
  [255, 154, 61], // 7 orange
] as const

export function rgbOf(id: number): RGB {
  return PALETTE[Math.abs(Math.trunc(id)) % PALETTE.length]
}

export function rgbCss([r, g, b]: RGB, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

/** Lighter variant of a palette colour (used for crests and highlights). */
export function lighten(color: RGB, t: number): RGB {
  return mix(color, WHITE, t)
}

/** Darker variant of a palette colour (used for depth shading). */
export function darken(color: RGB, t: number): RGB {
  return mix(color, BLACK, t)
}

/** Publish the palette as CSS custom properties `--c-0 … --c-7`. */
export function applyPaletteToCss(root: HTMLElement = document.documentElement): void {
  PALETTE.forEach((color, id) => {
    root.style.setProperty(`--c-${id}`, rgbCss(color))
  })
}
