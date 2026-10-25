/**
 * The stage's animation constants: pour choreography, effect strengths,
 * reaction timings and the pose spring.
 *
 * Pure data, no DOM: the stage animates from these numbers and the tests
 * measure against the same ones, so the budget cannot drift away from the
 * animation it is supposed to describe. The stage keeps no timings or
 * strengths of its own — if a number changes how the water moves, it is here.
 */

/**
 * Time the source tube takes to lift from rest into the pour pose. Matched to
 * the pose spring: at this point the tube has arrived, so the stream starts
 * when the tube is in place rather than while it is still flying.
 */
export const LIFT_MS = 100
/** Stream duration floor, before per-unit time is added. */
export const STREAM_BASE_MS = 85
/** Extra stream time per unit poured. */
export const STREAM_PER_UNIT_MS = 15
/** Time the source tube takes to travel back to rest once the stream stops. */
export const RETURN_MS = 150

/** Longest acceptable pour: event to source back at rest, in ms. */
export const POUR_BUDGET_MS = 420

/** Tilt of the source tube while pouring, in degrees. */
export const TILT_DEG = 30
/** Gap between the spout and the destination rim, in px. */
export const SPOUT_GAP = 26

/**
 * Where the stream lands across the destination, 0 = left wall, 1 = right
 * wall. Mid-tube keeps the splash centred however full the tube is.
 */
export const IMPACT_X_FRAC = 0.5
/** Surface kick where the stream lands, px/s. */
export const IMPACT_IMPULSE = 260
/** Droplets thrown when the stream stops. */
export const IMPACT_DROPLETS = 3
/** How often a droplet falls while streaming, ms. */
export const TRICKLE_MS = 70
/** Droplets per trickle. */
export const TRICKLE_DROPLETS = 1

/** Rejected-tap shake length, ms, and amplitude, px. */
export const SHAKE_MS = 420
export const SHAKE_AMP = 7
/** Completed-tube pop length, ms. */
export const POP_MS = 620

/** New board: tubes drop in, each one `ENTRANCE_STAGGER_MS` after the last. */
export const ENTRANCE_STAGGER_MS = 35
/** Where a tube starts its drop-in: px below its home, and how small. */
export const ENTRANCE_DROP_PX = 22
export const ENTRANCE_DROP_STEP_PX = 4
export const ENTRANCE_SCALE = 0.88

/**
 * Tube pose spring stiffness (1/s²) and damping (1/s). Critically damped, and
 * stiff enough that the source is back at rest inside the pour budget rather
 * than gliding on after the choreography has ended.
 */
export const POSE_SPRING_K = 4400
export const POSE_SPRING_DAMPING = 132
/** Longest slice the pose spring is integrated over, s. Stability, not taste. */
export const POSE_MAX_DT = 1 / 240

/** How long the stream runs for a pour of `amount` units. */
export function streamMs(amount: number): number {
  return STREAM_BASE_MS + Math.max(0, amount) * STREAM_PER_UNIT_MS
}

/** Whole choreography for a pour: lift, stream, return. */
export function pourTotalMs(amount: number): number {
  return LIFT_MS + streamMs(amount) + RETURN_MS
}
