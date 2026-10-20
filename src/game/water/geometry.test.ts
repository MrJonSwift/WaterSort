import { describe, expect, it } from 'vitest'
import { hoverPose, localToCanvas, spoutLocal } from './geometry'

const rect = { x: 100, y: 100, w: 50, h: 120 }
const target = { x: 300, y: 320, w: 50, h: 120 }

describe('localToCanvas', () => {
  it('is identity for a rest pose', () => {
    const p = localToCanvas(rect, { dx: 0, dy: 0, rot: 0, scale: 1 }, 110, 120)
    expect(p).toEqual({ x: 110, y: 120 })
  })

  it('applies translation', () => {
    const p = localToCanvas(rect, { dx: 5, dy: -3, rot: 0, scale: 1 }, 110, 120)
    expect(p).toEqual({ x: 115, y: 117 })
  })

  it('rotates around the rect centre', () => {
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
    const p = localToCanvas(rect, { dx: 0, dy: 0, rot: Math.PI / 2, scale: 1 }, center.x, center.y)
    expect(p.x).toBeCloseTo(center.x, 5)
    expect(p.y).toBeCloseTo(center.y, 5)
  })
})

describe('spoutLocal', () => {
  it('picks the right top corner when tilting right', () => {
    expect(spoutLocal(rect, 0.5)).toEqual({ x: rect.x + rect.w, y: rect.y })
  })

  it('picks the left top corner when tilting left', () => {
    expect(spoutLocal(rect, -0.5)).toEqual({ x: rect.x, y: rect.y })
  })
})

describe('hoverPose', () => {
  it('places the spout gap-px above the target top', () => {
    const pose = hoverPose(rect, target, 200, 30, 20)
    const spout = spoutLocal(rect, pose.rot)
    const at = localToCanvas(rect, pose, spout.x, spout.y)
    expect(at.x).toBeCloseTo(target.x + target.w / 2, 5)
    expect(at.y).toBeCloseTo(target.y - 20, 5)
  })

  it('tilts toward the board centre for a right-hand target', () => {
    const pose = hoverPose(rect, target, 200, 30, 20)
    expect(pose.rot).toBeGreaterThan(0)
  })

  it('tilts the other way for a left-hand target', () => {
    const leftTarget = { x: 10, y: 320, w: 50, h: 120 }
    const pose = hoverPose(rect, leftTarget, 200, 30, 20)
    expect(pose.rot).toBeLessThan(0)
  })
})
