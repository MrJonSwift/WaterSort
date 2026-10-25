import { describe, expect, it } from 'vitest'
import { REST_POSE, hoverPose, type Pose, type Rect } from './geometry'
import { poseReached, poseVisuallyAtRest, stepPose, zeroVelocity } from './pose'
import { LIFT_MS, POUR_BUDGET_MS, streamMs } from './tuning'

/**
 * Glass heights that actually ship: 154px inside a 10rem tube on a common
 * phone, 126px inside the 8.25rem tube on a short screen. The budget is proven
 * against these, because how far a tube has to travel depends on its height.
 */
const GLASS_HEIGHTS = [154, 126]
const BOARD_CENTER_X = 195

/**
 * A phone-sized tube and a destination in the next row — far enough away that
 * the lift is a real one, laid out the way the board lays tubes out.
 */
function rowPair(height: number): { source: Rect; target: Rect } {
  const source: Rect = { x: 36, y: 117, w: 44, h: height }
  return { source, target: { x: 250, y: source.y + height + 20, w: 44, h: height } }
}

/**
 * Replay a whole pour's pose at 60fps and report when the source comes back
 * to rest, in ms from the event.
 *
 * This is the acceptance criterion ("a 4-unit pour's choreography is ≤420ms
 * from event to source-at-rest") expressed against the spring that actually
 * moves the tube, not against the timeline constants it is built from.
 */
function pourToRest(
  amount: number,
  fps = 60,
  height = GLASS_HEIGHTS[0],
): { restAt: number; liftFraction: number } {
  const dt = 1 / fps
  const { source, target } = rowPair(height)
  const hover = hoverPose(source, target, BOARD_CENTER_X, 30, 26)
  const pourEnd = LIFT_MS + streamMs(amount)

  const pose: Pose = { ...REST_POSE }
  const vel = zeroVelocity()

  const travel =
    Math.hypot(hover.dx - REST_POSE.dx, hover.dy - REST_POSE.dy) +
    Math.abs(hover.rot - REST_POSE.rot) * 100

  let liftFraction = 0
  for (let elapsed = 0; elapsed < 5000; elapsed += dt * 1000) {
    const target = elapsed < pourEnd ? hover : REST_POSE
    stepPose(pose, vel, target, dt)

    if (Math.abs(elapsed - LIFT_MS) < dt * 500) {
      const got =
        Math.hypot(pose.dx - REST_POSE.dx, pose.dy - REST_POSE.dy) +
        Math.abs(pose.rot - REST_POSE.rot) * 100
      liftFraction = Math.min(1, got / travel)
    }
    if (elapsed >= pourEnd && poseVisuallyAtRest(pose)) {
      return { restAt: Math.round(elapsed), liftFraction }
    }
  }
  return { restAt: Number.POSITIVE_INFINITY, liftFraction }
}

describe('pour pose', () => {
  it('is back at rest inside the budget, even for the longest pour', () => {
    for (const height of GLASS_HEIGHTS) {
      expect(pourToRest(4, 60, height).restAt).toBeLessThanOrEqual(POUR_BUDGET_MS)
    }
  })

  it('is back at rest inside the budget on a 30fps phone', () => {
    for (const height of GLASS_HEIGHTS) {
      expect(pourToRest(4, 30, height).restAt).toBeLessThanOrEqual(POUR_BUDGET_MS)
    }
  })

  it('has arrived at the pour pose before the stream starts', () => {
    // Otherwise the stream begins from wherever the tube happens to be.
    for (const height of GLASS_HEIGHTS) {
      expect(pourToRest(4, 60, height).liftFraction).toBeGreaterThan(0.9)
    }
  })

  it('goes somewhere first — the lift is not a no-op', () => {
    for (const height of GLASS_HEIGHTS) {
      const { source, target } = rowPair(height)
      const hover = hoverPose(source, target, BOARD_CENTER_X, 30, 26)
      expect(Math.hypot(hover.dx, hover.dy)).toBeGreaterThan(40)
      expect(Math.abs(hover.rot)).toBeGreaterThan(0.3)
    }
  })

  it('survives a stalled frame without diverging', () => {
    const { source, target } = rowPair(GLASS_HEIGHTS[0])
    const hover = hoverPose(source, target, BOARD_CENTER_X, 30, 26)
    const pose: Pose = { ...REST_POSE }
    const vel = zeroVelocity()

    stepPose(pose, vel, hover, 0.2) // one very late frame
    for (let i = 0; i < 400; i++) stepPose(pose, vel, REST_POSE, 1 / 60)

    expect(Number.isFinite(pose.dx)).toBe(true)
    expect(Number.isFinite(pose.rot)).toBe(true)
    expect(poseReached(pose)).toBe(true)
  })
})
