/**
 * Tube pose springs: the pure maths behind lift, tilt, selection and slump.
 *
 * A tube's pose is four independent springs (x, y, rotation, scale) chasing a
 * target. Keeping this out of the stage means the *timing* of a pour can be
 * tested without a browser: the budget test integrates exactly the spring the
 * stage runs, so a retune that makes the tube arrive late fails the suite
 * instead of only looking slow on a phone.
 */
import { REST_POSE, type Pose } from './geometry'
import { POSE_MAX_DT, POSE_SPRING_DAMPING, POSE_SPRING_K } from './tuning'

export interface PoseVelocity {
  dx: number
  dy: number
  rot: number
  scale: number
}

/** A pose's four channels, in the order the springs integrate them. */
export const POSE_KEYS = ['dx', 'dy', 'rot', 'scale'] as const

/**
 * Below these differences a tube is visually at rest, so the render loop is
 * allowed to stop. They are deliberately far tighter than the eye: the loop
 * should sleep before anyone could notice motion, not after.
 */
export const POSE_EPS_PX = 0.05
export const POSE_EPS_ROT = 0.002
export const POSE_EPS_SCALE = 0.002

export function zeroVelocity(): PoseVelocity {
  return { dx: 0, dy: 0, rot: 0, scale: 0 }
}

/**
 * Advance the springs by `dt` seconds, in slices no longer than `POSE_MAX_DT`.
 *
 * The spring is stiff enough that a single step on a stalled frame (a tab
 * returning to the foreground, say) would diverge, so this must never be a
 * one-shot integration.
 */
export function stepPose(pose: Pose, vel: PoseVelocity, target: Pose, dt: number): void {
  let remaining = Math.min(Math.max(dt, 0), 0.1)
  while (remaining > 0) {
    const slice = Math.min(remaining, POSE_MAX_DT)
    for (const key of POSE_KEYS) {
      const accel = (target[key] - pose[key]) * POSE_SPRING_K - vel[key] * POSE_SPRING_DAMPING
      vel[key] += accel * slice
      pose[key] += vel[key] * slice
    }
    remaining -= slice
  }
}

/** True when the pose has reached its target to within an invisible margin. */
export function poseReached(pose: Pose, target: Pose = REST_POSE): boolean {
  return (
    Math.abs(pose.dx - target.dx) <= POSE_EPS_PX &&
    Math.abs(pose.dy - target.dy) <= POSE_EPS_PX &&
    Math.abs(pose.rot - target.rot) <= POSE_EPS_ROT &&
    Math.abs(pose.scale - target.scale) <= POSE_EPS_SCALE
  )
}

/**
 * A tube is *at rest* to the player well before the render loop is allowed to
 * sleep — half a pixel is already invisible on a phone. This is the threshold
 * the post-pour budget is measured against, because the budget is about what
 * the player sees, not about when repainting can stop.
 */
export const VISIBLE_EPS_PX = 0.5
export const VISIBLE_EPS_ROT = 0.01

export function poseVisuallyAtRest(pose: Pose, target: Pose = REST_POSE): boolean {
  return (
    Math.abs(pose.dx - target.dx) <= VISIBLE_EPS_PX &&
    Math.abs(pose.dy - target.dy) <= VISIBLE_EPS_PX &&
    Math.abs(pose.rot - target.rot) <= VISIBLE_EPS_ROT &&
    Math.abs(pose.scale - target.scale) <= 0.005
  )
}
