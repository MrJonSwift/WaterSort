/**
 * The water stage: owns the canvas, the animation clock, and the pour
 * choreography.
 *
 * Responsibilities:
 *   - one canvas overlaid on the game, sized for devicePixelRatio;
 *   - measuring tube geometry from the DOM (the DOM owns chrome shapes);
 *   - per-tube pose springs (lift, tilt, selection, shake, pop, entrance),
 *     written to the DOM so glass and liquid always move together;
 *   - the pour timeline: lift → tilt → stream + level transfer + droplets →
 *     return;
 *   - a render loop that sleeps once the simulation settles.
 *
 * It adapts between the pure layers: `physics` (simulation state) and
 * `renderer` (painting a `Scene`).
 */
import { prefersReducedMotion } from '../input'
import { isComplete } from '../rules'
import type { ColorId, GameEvent, GameState } from '../types'
import { hoverPose, localToCanvas, REST_POSE, spoutLocal, type Pose, type Rect } from './geometry'
import {
  createSim,
  fillUnits,
  isSettled,
  slosh,
  snapAll,
  spawnConfetti,
  spawnDroplets,
  spawnSparks,
  step,
  syncTube,
  waveImpulse,
  type Sim,
} from './physics'
import { drawScene, type LayerView, type Scene, type StreamView, type TubeView } from './renderer'

/* ----------------------------------------------------------- timings ---- */

const LIFT_MS = 220
const RETURN_MS = 200
const TILT_DEG = 30
const SPOUT_GAP = 26
const DROPLET_INTERVAL_MS = 55
const SHAKE_MS = 420
const POP_MS = 620
const SPRING_K = 170
const SPRING_DAMPING = 17

const pourMs = (amount: number): number => 240 + amount * 40

/* --------------------------------------------------------------- API ---- */

export interface StagePrefs {
  pourFx: boolean
}

export interface Stage {
  /** Drive presentation from a game event and the resulting state. */
  dispatch(event: GameEvent, state: GameState): void
  setPrefs(prefs: StagePrefs): void
  /** True while the pour choreography is playing (input should be ignored). */
  isAnimating(): boolean
}

/* ----------------------------------------------------------- internals ---- */

interface TubeNode {
  tube: HTMLElement
  glass: HTMLElement
  rect: Rect
  radii: [number, number, number, number]
  pose: Pose
  vel: { dx: number; dy: number; rot: number; scale: number }
  target: Pose
  wakeAt: number
  shakeUntil: number
  shakeAmp: number
  popUntil: number
}

interface PourAnim {
  from: number
  to: number
  amount: number
  color: ColorId
  capacity: number
  fromUnits: ColorId[]
  toUnits: ColorId[]
  hover: Pose
  start: number
  liftEnd: number
  pourEnd: number
  end: number
  streaming: boolean
  lastDropAt: number
}

interface PendingEffect {
  at: number
  run: () => void
}

function readRadii(element: Element): [number, number, number, number] {
  const style = getComputedStyle(element)
  return [
    parseFloat(style.borderTopLeftRadius) || 0,
    parseFloat(style.borderTopRightRadius) || 0,
    parseFloat(style.borderBottomRightRadius) || 0,
    parseFloat(style.borderBottomLeftRadius) || 0,
  ]
}

export function createStage(host: HTMLElement): Stage {
  const canvas = document.createElement('canvas')
  canvas.className = 'stage'
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)
  const ctx: CanvasRenderingContext2D =
    canvas.getContext('2d') ??
    ((): never => {
      throw new Error('2D canvas is not supported')
    })()

  const sim: Sim = createSim()
  const pending: PendingEffect[] = []
  let prefs: StagePrefs = { pourFx: true }
  let state: GameState | null = null
  let pour: PourAnim | null = null
  let nodes: TubeNode[] = []
  let complete: boolean[] = []
  let won = false
  let boardCenterX = 0
  let running = false
  let lastFrame = 0

  /* ------------------------------------------------------- measurement ---- */

  function measure(): void {
    const tubes = Array.from(host.querySelectorAll<HTMLElement>('.tube'))
    if (tubes.length !== nodes.length) {
      nodes = tubes.map((tube) => ({
        tube,
        glass: tube.querySelector('.glass') ?? tube,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        radii: [0, 0, 0, 0],
        pose: { ...REST_POSE },
        vel: { dx: 0, dy: 0, rot: 0, scale: 0 },
        target: { ...REST_POSE },
        wakeAt: 0,
        shakeUntil: 0,
        shakeAmp: 0,
        popUntil: 0,
      }))
    }

    // Measure with transforms cleared so poses never leak into geometry.
    const saved = nodes.map((node) => node.tube.style.transform)
    nodes.forEach((node) => {
      node.tube.style.transform = 'none'
    })
    const hostRect = host.getBoundingClientRect()
    for (const node of nodes) {
      const rect = node.glass.getBoundingClientRect()
      node.rect = {
        x: rect.left - hostRect.left,
        y: rect.top - hostRect.top,
        w: rect.width,
        h: rect.height,
      }
      node.radii = readRadii(node.glass)
    }
    nodes.forEach((node, i) => {
      node.tube.style.transform = saved[i]
    })

    const board = host.querySelector('.board')
    if (board) {
      const rect = board.getBoundingClientRect()
      boardCenterX = rect.left - hostRect.left + rect.width / 2
    }

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(host.clientWidth * dpr))
    canvas.height = Math.max(1, Math.round(host.clientHeight * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /* ---------------------------------------------------------- loop ------- */

  function needsFrame(): boolean {
    if (pour || pending.length > 0) return true
    if (!isSettled(sim)) return true
    for (const node of nodes) {
      const t = node.target
      const c = node.pose
      if (
        Math.abs(c.dx - t.dx) > 0.05 ||
        Math.abs(c.dy - t.dy) > 0.05 ||
        Math.abs(c.rot - t.rot) > 0.002 ||
        Math.abs(c.scale - t.scale) > 0.002
      ) {
        return true
      }
    }
    return false
  }

  function requestFrame(): void {
    if (running || document.hidden) return
    running = true
    lastFrame = 0
    requestAnimationFrame(frame)
  }

  function frame(now: number): void {
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60
    lastFrame = now

    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at > now) continue
      pending[i].run()
      pending.splice(i, 1)
    }
    advancePour(now)
    advancePoses(now, dt)
    step(sim, dt)
    draw(now)

    if (needsFrame()) {
      requestAnimationFrame(frame)
    } else {
      running = false
    }
  }

  function draw(now: number): void {
    // Clear every frame: stale liquid/particles would otherwise ghost.
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const scene: Scene = {
      tubes: nodes.map((node, i): TubeView => {
        const tube = sim.tubes[i]
        const layers: LayerView[] = tube
          ? tube.layers.map((layer, index) => ({
              color: layer.color,
              height: layer.height,
              isSurface: index === tube.layers.length - 1,
            }))
          : []
        return {
          rect: node.rect,
          radii: node.radii,
          pose: node.pose,
          layers,
          wave: tube ? tube.heights : new Float32Array(0),
          capacity: tube ? tube.capacity : 4,
          opacity: 1,
        }
      }),
      stream: streamView(now),
      particles: sim.particles,
      time: now / 1000,
    }
    drawScene(ctx, scene)
  }

  /* --------------------------------------------------------- choreography ---- */

  function advancePour(now: number): void {
    const anim = pour
    if (!anim) return

    if (!anim.streaming && now >= anim.liftEnd) {
      anim.streaming = true
      const toNode = nodes[anim.to]
      if (toNode && state) {
        syncTube(sim, anim.from, anim.capacity, anim.fromUnits)
        syncTube(sim, anim.to, anim.capacity, anim.toUnits)
        const xFrac = 0.5 // impact lands mid-tube
        waveImpulse(sim, anim.to, xFrac, 520)
        slosh(sim, anim.from, 240)
      }
    }

    if (anim.streaming && now >= anim.pourEnd) {
      anim.streaming = false
      const impact = impactPoint(anim)
      if (impact) spawnDroplets(sim, impact.x, impact.y, anim.color, 6, { speed: 160 })
      nodes[anim.from].target = { ...REST_POSE }
    }

    if (anim.streaming && now - anim.lastDropAt >= DROPLET_INTERVAL_MS) {
      anim.lastDropAt = now
      const impact = impactPoint(anim)
      if (impact) spawnDroplets(sim, impact.x, impact.y, anim.color, 2, { spread: 14, speed: 130, size: 2.6 })
    }

    if (now >= anim.end) pour = null
  }

  function impactPoint(anim: PourAnim): { x: number; y: number } | null {
    const dest = nodes[anim.to]
    const tube = sim.tubes[anim.to]
    if (!dest || !tube) return null
    const x = dest.rect.x + dest.rect.w / 2
    const fill = Math.min(1, Math.max(0, fillUnits(tube) / tube.capacity))
    const y = dest.rect.y + dest.rect.h - fill * dest.rect.h
    return { x, y }
  }

  function streamView(now: number): StreamView | null {
    const anim = pour
    if (!anim || !anim.streaming || now >= anim.pourEnd) return null
    const from = nodes[anim.from]
    const impact = impactPoint(anim)
    if (!from || !impact) return null

    const spout = spoutLocal(from.rect, from.pose.rot)
    const lip = localToCanvas(from.rect, from.pose, spout.x, spout.y)
    return {
      fromX: lip.x,
      fromY: lip.y,
      toX: impact.x,
      toY: impact.y,
      width: from.rect.w * 0.38,
      color: anim.color,
      time: now / 1000,
    }
  }

  /* ------------------------------------------------------------- poses ---- */

  function advancePoses(now: number, dt: number): void {
    nodes.forEach((node, index) => {
      applyPoseTarget(node, index, now)
      if (now < node.wakeAt) return

      const springs: Array<keyof Pose> = ['dx', 'dy', 'rot', 'scale']
      for (const key of springs) {
        const target = node.target[key]
        const velocity = node.vel[key]
        const accel = (target - node.pose[key]) * SPRING_K - velocity * SPRING_DAMPING
        node.vel[key] = velocity + accel * dt
        node.pose[key] = node.pose[key] + node.vel[key] * dt
      }

      const { pose } = node
      node.tube.style.transform = `translate(${pose.dx}px, ${pose.dy}px) rotate(${pose.rot}rad) scale(${pose.scale})`
    })
  }

  function applyPoseTarget(node: TubeNode, index: number, now: number): void {
    const selected = state?.selected === index
    const target: Pose = {
      dx: 0,
      dy: selected ? -7 : 0,
      rot: 0,
      scale: selected ? 1.05 : 1,
    }

    if (pour && pour.from === index && now < pour.pourEnd) {
      target.dx = pour.hover.dx
      target.dy = pour.hover.dy
      target.rot = pour.hover.rot
      target.scale = pour.hover.scale
    }

    if (now < node.shakeUntil) {
      const elapsed = SHAKE_MS - (node.shakeUntil - now)
      target.dx += Math.sin(elapsed * 0.055) * node.shakeAmp * (1 - elapsed / SHAKE_MS)
    }
    if (now < node.popUntil) {
      const progress = 1 - (node.popUntil - now) / POP_MS
      target.scale *= 1 + 0.07 * Math.sin(Math.PI * progress)
    }

    node.target = target
  }

  /* -------------------------------------------------------------- events ---- */

  function dispatch(event: GameEvent, next: GameState): void {
    const previous = state
    state = next

    if (nodes.length !== next.tubes.length) measure()

    // Sync the simulation to the new game state.
    const animatePourFx = prefs.pourFx && !prefersReducedMotion()
    const animate = !prefersReducedMotion()

    switch (event.type) {
      case 'pour': {
        const fromNode = nodes[event.from]
        const toNode = nodes[event.to]
        if (!fromNode || !toNode) break

        if (animatePourFx) {
          const hover = hoverPose(fromNode.rect, toNode.rect, boardCenterX, TILT_DEG, SPOUT_GAP)
          const start = performance.now()
          pour = {
            from: event.from,
            to: event.to,
            amount: event.amount,
            color: event.color,
            capacity: next.capacity,
            fromUnits: next.tubes[event.from].colors,
            toUnits: next.tubes[event.to].colors,
            hover,
            start,
            liftEnd: start + LIFT_MS,
            pourEnd: start + LIFT_MS + pourMs(event.amount),
            end: start + LIFT_MS + pourMs(event.amount) + RETURN_MS,
            streaming: false,
            lastDropAt: 0,
          }
          fromNode.target = hover
          if (animate) slosh(sim, event.from, 120)
        } else {
          syncTube(sim, event.from, next.capacity, next.tubes[event.from].colors, true)
          syncTube(sim, event.to, next.capacity, next.tubes[event.to].colors, true)
        }
        break
      }

      case 'select':
        if (animate) slosh(sim, event.index, 90)
        break

      case 'invalid': {
        const node = nodes[event.index]
        if (node && animate) {
          node.shakeUntil = performance.now() + SHAKE_MS
          node.shakeAmp = 7
        }
        break
      }

      case 'undo':
      case 'new': {
        snapAll(sim)
        next.tubes.forEach((tube, i) => syncTube(sim, i, next.capacity, tube.colors, true))
        pour = null
        if (event.type === 'new' && animate) {
          nodes.forEach((node, i) => {
            node.pose = { dx: 0, dy: 22 + i * 4, rot: 0, scale: 0.88 }
            node.vel = { dx: 0, dy: 0, rot: 0, scale: 0 }
            node.wakeAt = performance.now() + i * 35
          })
        }
        break
      }

      case 'deselect':
      case 'none':
        break
    }

    // Completion sparks and win confetti, delayed until a pour has landed.
    const effectAt = pour ? pour.pourEnd + 40 : performance.now()
    if (animate) {
      next.tubes.forEach((tube, i) => {
        const done = isComplete(tube, next.capacity)
        if (done && !complete[i]) {
          pending.push({
            at: effectAt,
            run: () => {
              const node = nodes[i]
              if (!node) return
              node.popUntil = performance.now() + POP_MS
              const color = tube.colors[tube.colors.length - 1] ?? 0
              spawnSparks(sim, node.rect.x + node.rect.w / 2, node.rect.y + node.rect.h * 0.18, color, 8)
            },
          })
        }
      })
      if (next.won && !won && previous) {
        pending.push({
          at: effectAt + 120,
          run: () => spawnConfetti(sim, host.clientWidth / 2, 10, 64, host.clientWidth),
        })
      }
    }
    complete = next.tubes.map((tube) => isComplete(tube, next.capacity))
    won = next.won

    requestFrame()
  }

  /* ---------------------------------------------------------- wiring ---- */

  measure()
  const observer = new ResizeObserver(() => {
    measure()
    requestFrame()
  })
  observer.observe(host)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestFrame()
  })

  return {
    dispatch,
    setPrefs(next) {
      prefs = next
    },
    isAnimating: () => pour !== null,
  }
}
