/**
 * Pure geometry helpers for the water stage: where a tilted tube's spout is,
 * and how a tube's pose maps local points into canvas space.
 *
 * Kept free of DOM access so the choreography math is testable and reusable.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Pose {
  dx: number
  dy: number
  rot: number
  scale: number
}

export const REST_POSE: Pose = { dx: 0, dy: 0, rot: 0, scale: 1 }

/** Map a point in a tube's untransformed local space through its pose. */
export function localToCanvas(rect: Rect, pose: Pose, px: number, py: number): { x: number; y: number } {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const sx = (px - cx) * pose.scale
  const sy = (py - cy) * pose.scale
  const cos = Math.cos(pose.rot)
  const sin = Math.sin(pose.rot)
  return {
    x: cx + pose.dx + sx * cos - sy * sin,
    y: cy + pose.dy + sx * sin + sy * cos,
  }
}

/**
 * The pouring lip: the top corner of the tube that sits lower once the tube is
 * tilted by `rot` (positive rotation swings the right side down).
 */
export function spoutLocal(rect: Rect, rot: number): { x: number; y: number } {
  return rot > 0 ? { x: rect.x + rect.w, y: rect.y } : { x: rect.x, y: rect.y }
}

/**
 * Y offsets from the top of the glass, one per internal slot boundary.
 *
 * These are the same boundaries the renderer fills liquid to: liquid is laid
 * out from the bottom (`bottom - units * unit`), so a guide struck at
 * `top + height * i / capacity` meets a resting liquid edge exactly. Kept
 * capacity-agnostic because the slot count will change; a capacity below two
 * has no internal boundary, and a height that is not finite cannot be split.
 */
export function unitBoundaryYs(height: number, capacity: number): number[] {
  if (!Number.isFinite(height) || height < 0 || capacity < 2) return []
  const boundaries: number[] = []
  for (let i = 1; i < capacity; i++) boundaries.push((height * i) / capacity)
  return boundaries
}

/**
 * Pose that hovers `rect` above `target` so its spout pours into `target`:
 * the tube is lifted until the spout is `gap` px above the target's top edge,
 * and tilted by `tiltDeg` toward the board centre so the body stays on screen.
 */
export function hoverPose(
  rect: Rect,
  target: Rect,
  boardCenterX: number,
  tiltDeg: number,
  gap: number,
): Pose {
  const dir = target.x + target.w / 2 >= boardCenterX ? 1 : -1
  const rot = ((tiltDeg * dir) * Math.PI) / 180
  const spout = spoutLocal(rect, rot)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const sx = spout.x - cx
  const sy = spout.y - cy
  const rotatedX = sx * cos - sy * sin
  const rotatedY = sx * sin + sy * cos

  const targetX = target.x + target.w / 2
  const targetY = target.y - gap
  return {
    dx: targetX - cx - rotatedX,
    dy: targetY - cy - rotatedY,
    rot,
    scale: 1,
  }
}
