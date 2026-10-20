/**
 * Canvas painting for the water stage. Pure drawing: it receives a `Scene`
 * (geometry + simulation snapshot) and paints it. It never reads the DOM and
 * never mutates the simulation.
 */
import type { ColorId } from '../types'
import { darken, lighten, rgbCss, rgbOf, type RGB } from '../palette'
import type { ParticleKind } from './physics'
import type { Pose, Rect } from './geometry'

export interface LayerView {
  color: ColorId
  /** Height in units (fractional while animating). */
  height: number
  isSurface: boolean
}

export interface TubeView {
  /** Interior glass rect in canvas coordinates (untransformed). */
  rect: Rect
  /** Border radii of the interior: top-left, top-right, bottom-right, bottom-left. */
  radii: readonly [number, number, number, number]
  pose: Pose
  layers: readonly LayerView[]
  /** Surface displacement per wave sample, px. */
  wave: ArrayLike<number>
  capacity: number
  opacity: number
}

export interface StreamView {
  fromX: number
  fromY: number
  toX: number
  toY: number
  width: number
  color: ColorId
  time: number
}

export interface ParticleView {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: ColorId
  rot: number
  age: number
  ttl: number
}

export interface Scene {
  tubes: readonly TubeView[]
  stream: StreamView | null
  particles: readonly ParticleView[]
  time: number
}

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const tube of scene.tubes) drawTube(ctx, tube)
  if (scene.stream) drawStream(ctx, scene.stream)
  for (const particle of scene.particles) drawParticle(ctx, particle)
}

/* ---------------------------------------------------------------- tube ---- */

function roundedPath(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  radii: readonly [number, number, number, number],
): void {
  const [tl, tr, br, bl] = radii
  const { x, y, w, h } = rect
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}

function drawTube(ctx: CanvasRenderingContext2D, tube: TubeView): void {
  const { rect, pose, capacity } = tube
  const centerX = rect.x + rect.w / 2
  const centerY = rect.y + rect.h / 2

  ctx.save()
  ctx.globalAlpha = tube.opacity
  ctx.translate(centerX + pose.dx, centerY + pose.dy)
  ctx.rotate(pose.rot)
  ctx.scale(pose.scale, pose.scale)
  ctx.translate(-centerX, -centerY)

  roundedPath(ctx, rect, tube.radii)
  ctx.clip()

  const unit = rect.h / capacity
  const bottom = rect.y + rect.h
  const wave = tube.wave
  const n = wave.length

  // Displacement profile: full amplitude at the surface, attenuated at
  // deeper interfaces so colour layers move together like liquid.
  const surface = (i: number) => wave[i] ?? 0
  const interfaceOffset = (i: number, depth: number) => (wave[i] ?? 0) * 0.34 * (1 - depth * 0.5)

  let cumulative = 0
  tube.layers.forEach((layer, index) => {
    const below = cumulative
    cumulative += layer.height
    const topUnits = cumulative
    const yBottom = bottom - below * unit
    const yTop = bottom - topUnits * unit
    const isSurface = layer.isSurface
    const depth = index / Math.max(1, tube.layers.length - 1)

    // Build the top and bottom edge of this layer as displaced polylines.
    const topPoints: Array<[number, number]> = []
    const bottomPoints: Array<[number, number]> = []
    for (let i = 0; i < n; i++) {
      const x = rect.x + (rect.w * i) / (n - 1)
      topPoints.push([x, yTop + (isSurface ? surface(i) : interfaceOffset(i, depth))])
      bottomPoints.push([x, yBottom + (index === 0 ? 0 : interfaceOffset(i, depth + 1))])
    }

    ctx.beginPath()
    ctx.moveTo(topPoints[0][0], topPoints[0][1])
    for (let i = 1; i < topPoints.length; i++) ctx.lineTo(topPoints[i][0], topPoints[i][1])
    for (let i = bottomPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(bottomPoints[i][0], bottomPoints[i][1])
    }
    ctx.closePath()

    const base = rgbOf(layer.color)
    const gradient = ctx.createLinearGradient(0, yTop, 0, yBottom)
    gradient.addColorStop(0, rgbCss(lighten(base, isSurface ? 0.22 : 0.12)))
    gradient.addColorStop(0.45, rgbCss(base))
    gradient.addColorStop(1, rgbCss(darken(base, 0.3)))
    ctx.fillStyle = gradient
    ctx.fill()

    // A thin darker interface line where two colours meet.
    if (!isSurface && index > 0) {
      ctx.beginPath()
      ctx.moveTo(topPoints[0][0], topPoints[0][1])
      for (let i = 1; i < topPoints.length; i++) ctx.lineTo(topPoints[i][0], topPoints[i][1])
      ctx.strokeStyle = rgbCss(darken(base, 0.35), 0.35)
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (isSurface) {
      // Bright surface line + glints riding the wave crests.
      ctx.beginPath()
      ctx.moveTo(topPoints[0][0], topPoints[0][1])
      for (let i = 1; i < topPoints.length; i++) ctx.lineTo(topPoints[i][0], topPoints[i][1])
      ctx.strokeStyle = rgbCss(lighten(base, 0.55), 0.8)
      ctx.lineWidth = 1.6
      ctx.stroke()

      for (let i = 1; i < topPoints.length - 1; i++) {
        const crest = wave[i] > 1.2 && wave[i] >= wave[i - 1] && wave[i] >= wave[i + 1]
        if (!crest) continue
        const [gx, gy] = topPoints[i]
        ctx.beginPath()
        ctx.arc(gx, gy - 1, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = rgbCss(WHITE, 0.5)
        ctx.fill()
      }
    }
  })

  ctx.restore()
}

/* -------------------------------------------------------------- stream ---- */

function drawStream(ctx: CanvasRenderingContext2D, stream: StreamView): void {
  const { fromX, fromY, toX, toY, width, time } = stream
  const base = rgbOf(stream.color)
  const segments = 14

  const points: Array<[number, number, number]> = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Slight bow toward the impact and a gentle sway over time.
    const bow = Math.sin(t * Math.PI) * (toX - fromX) * 0.12
    const sway = Math.sin(time * 9 + t * 5) * 1.6 * (1 - t * 0.5)
    const x = fromX + (toX - fromX) * t + bow + sway
    const y = fromY + (toY - fromY) * t
    // Wide at the lip, narrower through the fall, a touch wider at impact.
    const w = width * (1 - 0.35 * t + 0.25 * t * t * t)
    points.push([x, y, w])
  }

  ctx.beginPath()
  ctx.moveTo(points[0][0] - points[0][2] / 2, points[0][1])
  for (const [x, y, w] of points) ctx.lineTo(x - w / 2, y)
  for (let i = points.length - 1; i >= 0; i--) {
    const [x, y, w] = points[i]
    ctx.lineTo(x + w / 2, y)
  }
  ctx.closePath()

  const gradient = ctx.createLinearGradient(0, fromY, 0, toY)
  gradient.addColorStop(0, rgbCss(lighten(base, 0.35)))
  gradient.addColorStop(0.6, rgbCss(base))
  gradient.addColorStop(1, rgbCss(lighten(base, 0.15)))
  ctx.fillStyle = gradient
  ctx.fill()

  // Highlight running down the stream.
  ctx.beginPath()
  ctx.moveTo(points[0][0] - points[0][2] * 0.18, points[0][1])
  for (const [x, y, w] of points) ctx.lineTo(x - w * 0.18, y)
  ctx.strokeStyle = rgbCss(WHITE, 0.28)
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/* ------------------------------------------------------------ particles ---- */

function drawParticle(ctx: CanvasRenderingContext2D, particle: ParticleView): void {
  const fade = 1 - Math.min(1, particle.age / particle.ttl)
  const base = rgbOf(particle.color)
  ctx.save()
  ctx.translate(particle.x, particle.y)

  if (particle.kind === 'droplet') {
    const speed = Math.hypot(particle.vx, particle.vy)
    ctx.rotate(Math.atan2(particle.vy, particle.vx) + Math.PI / 2)
    const stretch = 1 + Math.min(0.8, speed / 700)
    ctx.scale(1, stretch)
    ctx.beginPath()
    ctx.arc(0, 0, particle.size, 0, Math.PI * 2)
    ctx.fillStyle = rgbCss(lighten(base, 0.1), 0.85 * fade)
    ctx.fill()
  } else if (particle.kind === 'spark') {
    const radius = particle.size * (1 + (1 - fade) * 0.6)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2)
    glow.addColorStop(0, rgbCss(WHITE, 0.85 * fade))
    glow.addColorStop(0.5, rgbCss(base, 0.6 * fade))
    glow.addColorStop(1, rgbCss(base, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, radius * 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.rotate(particle.rot)
    const flutter = Math.cos(particle.age * 6 + particle.rot) * 0.5 + 0.5
    ctx.fillStyle = rgbCss(base, 0.9 * fade)
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size * (0.4 + flutter * 0.6), particle.size)
    ctx.strokeStyle = rgbCss(BLACK, 0.12 * fade)
    ctx.lineWidth = 1
    ctx.strokeRect(-particle.size / 2, -particle.size / 2, particle.size * (0.4 + flutter * 0.6), particle.size)
  }

  ctx.restore()
}
