import { describe, expect, it } from 'vitest'
import { REST_POSE, hoverPose, type Pose, type Rect } from './geometry'
import { poseReached, poseVisuallyAtRest, stepPose, zeroVelocity } from './pose'
import { LIFT_MS, POUR_BUDGET_MS, streamMs } from './tuning'

/** A phone-sized tube, and a destination far enough away to be a real lift. */
const SOURCE: Rect = { x: 36, y: 117, w: 44, h: 122 }
const TARGET: Rect = { x: 250, y: 300, w: 44, h: 122 }
const BOARD_CENTER_X = 195

/**
 * Replay a whole pour's pose at 60fps and report when the source comes back
 * to rest, in ms from the event.
 *
 * This is the acceptance criterion ("a 4-unit pour's choreography is ≤420ms
 * from event to source-at-rest") expressed against the spring that actually
 * moves the tube, not against the timeline constants it is built from.
 */
function pourToRest(amount: number, fps = 60): { restAt: number; liftFraction: number } {
  const dt = 1 / fps
  const hover = hoverPose(SOURCE, TARGET, BOARD_CENTER_X, 30, 26)
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
    const { restAt } = pourToRest(4)
    expect(restAt).toBeLessThanOrEqual(POUR_BUDGET_MS)
  })

  it('is back at rest inside the budget on a 30fps phone', () => {
    const { restAt } = pourToRest(4, 30)
    expect(restAt).toBeLessThanOrEqual(POUR_BUDGET_MS)
  })

  it('has arrived at the pour pose before the stream starts', () => {
    // Otherwise the stream begins from wherever the tube happens to be.
    const { liftFraction } = pourToRest(4)
    expect(liftFraction).toBeGreaterThan(0.9)
  })

  it('goes somewhere first — the lift is not a no-op', () => {
    const hover = hoverPose(SOURCE, TARGET, BOARD_CENTER_X, 30, 26)
    expect(Math.hypot(hover.dx, hover.dy)).toBeGreaterThan(40)
    expect(Math.abs(hover.rot)).toBeGreaterThan(0.3)
  })

  it('survives a stalled frame without diverging', () => {
    const hover = hoverPose(SOURCE, TARGET, BOARD_CENTER_X, 30, 26)
    const pose: Pose = { ...REST_POSE }
    const vel = zeroVelocity()

    stepPose(pose, vel, hover, 0.2) // one very late frame
    for (let i = 0; i < 400; i++) stepPose(pose, vel, REST_POSE, 1 / 60)

    expect(Number.isFinite(pose.dx)).toBe(true)
    expect(Number.isFinite(pose.rot)).toBe(true)
    expect(poseReached(pose)).toBe(true)
  })
})
