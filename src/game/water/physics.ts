/**
 * Pure water simulation. No DOM, no canvas — just numbers.
 *
 * Three things live here:
 *   1. `layers`  — the liquid column. Each layer is one contiguous colour run
 *                  (see `colorRuns`) with a spring-animated height in units.
 *                  Heights overshoot and settle, which is what sells "level".
 *   2. `heights` — a 1-D wave field across the tube: surface displacement per
 *                  sample with velocity, integrated with the wave equation and
 *                  reflecting at the tube walls. This is the sloshing.
 *   3. `particles` — droplets, sparks, and confetti under gravity.
 *
 * Everything is stepped by `step(sim, dt)` with fixed sub-steps so the
 * integration cannot blow up on a stalled frame.
 */
import { colorRuns } from '../bands'
import type { ColorId } from '../types'

/* ------------------------------------------------------------ constants ---- */

/** Wave samples across one tube. More samples = smoother surface, more cost. */
export const WAVE_SAMPLES = 20
/** Max surface displacement, px. */
export const MAX_WAVE = 9

const FIXED_DT = 1 / 240
const MAX_DT = 0.05
/** Wave speed squared, in sample units. Tuned for stability at FIXED_DT. */
const WAVE_C2 = 130
/** Gravity restoring the surface to flat (1/s²). Without this, a uniform
 *  displacement would be conserved forever by the wave equation. */
const WAVE_RESTORE = 70
/** Wave amplitude decay per second. High enough that a splash is over in
 *  well under a second, rather than sloshing while the player moves on. */
const WAVE_DAMPING = 11
/** Layer height spring stiffness (1/s²) and damping (1/s). */
const SPRING_K = 240
const SPRING_DAMPING = 20
/** Particle gravity by kind, px/s². */
const GRAVITY: Record<ParticleKind, number> = {
  droplet: 1500,
  spark: 320,
  confetti: 240,
}

/**
 * Sleep thresholds. Chosen to be visually invisible — a quarter pixel of
 * surface and a layer off its target by 1/100 of a unit cannot be seen — so
 * the render loop can stop repainting well within the post-pour budget.
 */
const SETTLE_WAVE = 0.25
const SETTLE_VEL = 0.6
const SETTLE_LAYER = 0.01

/* --------------------------------------------------------------- types ---- */

export type ParticleKind = 'droplet' | 'spark' | 'confetti'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  /** Radius for droplets/sparks, edge length for confetti. */
  size: number
  color: ColorId
  rot: number
  spin: number
  age: number
  ttl: number
}

export interface Layer {
  color: ColorId
  /** Current height in units (fractional while transitioning). */
  height: number
  velocity: number
  /** Rest height in units (integer, from game state). */
  target: number
  /** True while a layer drains to zero and waits to be removed. */
  dying: boolean
}

export interface SimTube {
  capacity: number
  layers: Layer[]
  heights: Float32Array
  velocities: Float32Array
}

export interface Sim {
  tubes: SimTube[]
  particles: Particle[]
}

/* ----------------------------------------------------------- lifecycle ---- */

export function createSim(): Sim {
  return { tubes: [], particles: [] }
}

function createTube(capacity: number): SimTube {
  return {
    capacity,
    layers: [],
    heights: new Float32Array(WAVE_SAMPLES),
    velocities: new Float32Array(WAVE_SAMPLES),
  }
}

function ensureTubes(sim: Sim, count: number, capacity: number): void {
  // Grow only. Syncing a single tube must never drop the others.
  while (sim.tubes.length < count) sim.tubes.push(createTube(capacity))
  for (const tube of sim.tubes) tube.capacity = capacity
}

/* --------------------------------------------------------------- state ---- */

/** Liquid height of a tube in units (sum of layer heights). */
export function fillUnits(tube: SimTube): number {
  let sum = 0
  for (const layer of tube.layers) sum += layer.height
  return sum
}

/**
 * Point the simulation at the game state for one tube.
 *
 * Layers are reconciled by index and colour so that a shrinking top layer
 * keeps draining while a growing one rises; `snap` jumps straight to the
 * target layout (used for undo and new game, where no pour is animating).
 */
export function syncTube(
  sim: Sim,
  index: number,
  capacity: number,
  units: readonly ColorId[],
  snap = false,
): void {
  ensureTubes(sim, index + 1, capacity)
  const tube = sim.tubes[index]
  tube.capacity = capacity

  const target = colorRuns(units)
  if (snap) {
    tube.layers = target.map((run) => ({
      color: run.color,
      height: run.units,
      velocity: 0,
      target: run.units,
      dying: false,
    }))
    tube.heights.fill(0)
    tube.velocities.fill(0)
    return
  }

  const layers: Layer[] = []
  for (let i = 0; i < target.length; i++) {
    const run = target[i]
    const current = tube.layers[i]
    if (current && current.color === run.color && !current.dying) {
      layers.push({ ...current, target: run.units })
    } else {
      layers.push({
        color: run.color,
        height: 0,
        velocity: 0,
        target: run.units,
        dying: false,
      })
    }
  }
  // Layers beyond the new layout drain to zero and are pruned when empty.
  for (let i = target.length; i < tube.layers.length; i++) {
    layers.push({ ...tube.layers[i], target: 0, dying: true })
  }
  tube.layers = layers
}

/** Drop every tube straight to its target layout and stop all motion. */
export function snapAll(sim: Sim): void {
  for (const tube of sim.tubes) {
    for (const layer of tube.layers) {
      layer.height = layer.target
      layer.velocity = 0
    }
    tube.layers = tube.layers.filter((layer) => layer.target > 0)
    tube.heights.fill(0)
    tube.velocities.fill(0)
  }
}

/* ------------------------------------------------------------ impulses ---- */

/** Kick the surface around `xFrac` (0 = left wall, 1 = right wall). */
export function waveImpulse(sim: Sim, index: number, xFrac: number, strength: number): void {
  const tube = sim.tubes[index]
  if (!tube) return
  const n = tube.heights.length
  for (let i = 0; i < n; i++) {
    const d = i / (n - 1) - xFrac
    tube.velocities[i] += strength * Math.exp(-(d * d) / 0.02)
  }
}

/* ------------------------------------------------------------ particles ---- */

function spawn(
  sim: Sim,
  kind: ParticleKind,
  x: number,
  y: number,
  color: ColorId,
  size: number,
  vx: number,
  vy: number,
  ttl: number,
): void {
  sim.particles.push({
    kind,
    x,
    y,
    vx,
    vy,
    size,
    color,
    rot: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 8,
    age: 0,
    ttl,
  })
}

export interface DropletOptions {
  spread?: number
  speed?: number
  size?: number
}

export function spawnDroplets(
  sim: Sim,
  x: number,
  y: number,
  color: ColorId,
  count: number,
  options: DropletOptions = {},
): void {
  const spread = options.spread ?? 70
  const speed = options.speed ?? 150
  const size = options.size ?? 3.2
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1
    const velocity = speed * (0.5 + Math.random() * 0.8)
    spawn(
      sim,
      'droplet',
      x + (Math.random() - 0.5) * spread * 0.4,
      y,
      color,
      size * (0.7 + Math.random() * 0.7),
      Math.cos(angle) * velocity,
      Math.sin(angle) * velocity,
      0.5 + Math.random() * 0.5,
    )
  }
}

export function spawnSparks(sim: Sim, x: number, y: number, color: ColorId, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const velocity = 30 + Math.random() * 90
    spawn(
      sim,
      'spark',
      x,
      y,
      color,
      2.5 + Math.random() * 3,
      Math.cos(angle) * velocity,
      Math.sin(angle) * velocity - 30,
      0.5 + Math.random() * 0.35,
    )
  }
}

export function spawnConfetti(
  sim: Sim,
  x: number,
  y: number,
  count: number,
  spreadX = 40,
): void {
  for (let i = 0; i < count; i++) {
    spawn(
      sim,
      'confetti',
      x + (Math.random() - 0.5) * spreadX,
      y + (Math.random() - 0.5) * 40,
      i % 8,
      6 + Math.random() * 5,
      (Math.random() - 0.5) * 70,
      40 + Math.random() * 90,
      1.4 + Math.random() * 1.2,
    )
  }
}

/* --------------------------------------------------------------- step ---- */

function integrate(sim: Sim, dt: number): void {
  for (const tube of sim.tubes) {
    for (const layer of tube.layers) {
      const accel = (layer.target - layer.height) * SPRING_K - layer.velocity * SPRING_DAMPING
      layer.velocity += accel * dt
      layer.height += layer.velocity * dt
    }
    // Prune fully drained layers.
    tube.layers = tube.layers.filter(
      (layer) => !(layer.dying && layer.target === 0 && layer.height < 0.002 && Math.abs(layer.velocity) < 0.01),
    )

    const heights = tube.heights
    const velocities = tube.velocities
    const n = heights.length
    const decay = Math.exp(-WAVE_DAMPING * dt)
    for (let i = 0; i < n; i++) {
      // Neumann boundaries (clamp at the edges) make waves reflect off walls;
      // the restore term pulls the surface back to level like gravity.
      const left = heights[i > 0 ? i - 1 : 0]
      const right = heights[i < n - 1 ? i + 1 : n - 1]
      const laplacian = left + right - 2 * heights[i]
      velocities[i] += (laplacian * WAVE_C2 - heights[i] * WAVE_RESTORE) * dt
      velocities[i] *= decay
    }
    for (let i = 0; i < n; i++) {
      heights[i] += velocities[i] * dt
      if (heights[i] > MAX_WAVE) {
        heights[i] = MAX_WAVE
        velocities[i] = 0
      } else if (heights[i] < -MAX_WAVE) {
        heights[i] = -MAX_WAVE
        velocities[i] = 0
      }
    }
  }

  const alive: Particle[] = []
  for (const particle of sim.particles) {
    particle.age += dt
    if (particle.age >= particle.ttl) continue
    particle.vy += GRAVITY[particle.kind] * dt
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.rot += particle.spin * dt
    alive.push(particle)
  }
  sim.particles = alive
}

/** Advance the simulation. `dt` is clamped and split into stable sub-steps. */
export function step(sim: Sim, dt: number): void {
  let remaining = Math.min(Math.max(dt, 0), MAX_DT)
  while (remaining > 0) {
    const slice = Math.min(remaining, FIXED_DT)
    integrate(sim, slice)
    remaining -= slice
  }
}

/** True when all motion has decayed — lets the render loop go to sleep. */
export function isSettled(sim: Sim): boolean {
  if (sim.particles.length > 0) return false
  for (const tube of sim.tubes) {
    for (const layer of tube.layers) {
      if (Math.abs(layer.height - layer.target) > SETTLE_LAYER) return false
      if (Math.abs(layer.velocity) > SETTLE_VEL) return false
    }
    for (let i = 0; i < tube.heights.length; i++) {
      if (Math.abs(tube.heights[i]) > SETTLE_WAVE) return false
      if (Math.abs(tube.velocities[i]) > SETTLE_VEL) return false
    }
  }
  return true
}
