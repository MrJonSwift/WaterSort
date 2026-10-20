/**
 * Suppress iOS double-tap zoom inside the game area without blocking taps.
 * A tap sequence that repeats within 300ms is treated as a double tap.
 */
export function preventDoubleTapZoom(element: HTMLElement): void {
  let lastTouchEnd = 0
  element.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) event.preventDefault()
      lastTouchEnd = now
    },
    { passive: false },
  )
}

/** Fire a haptic pulse where the platform supports it (no-op elsewhere). */
export function haptic(pattern: number | number[] = 8): void {
  navigator.vibrate?.(pattern)
}

/** Whether the user has asked the platform to reduce motion. */
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
