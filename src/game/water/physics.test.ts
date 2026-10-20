import { describe, expect, it } from 'vitest'
import {
  createSim,
  fillUnits,
  isSettled,
  snapAll,
  slosh,
  spawnConfetti,
  spawnDroplets,
  spawnSparks,
  step,
  syncTube,
  waveImpulse,
} from './physics'

function makeSim(): ReturnType<typeof createSim> {
  const sim = createSim()
  syncTube(sim, 0, 4, [1, 1, 2, 2], true)
  return sim
}

describe('syncTube', () => {
  it('snap builds layers per colour run', () => {
    const sim = createSim()
    syncTube(sim, 0, 4, [1, 1, 2, 2], true)
    expect(sim.tubes[0].layers.map((l) => [l.color, l.height])).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('grows a new top layer from zero when liquid arrives', () => {
    const sim = createSim()
    syncTube(sim, 0, 4, [1, 1], true)
    syncTube(sim, 0, 4, [1, 1, 2, 2])
    const layers = sim.tubes[0].layers
    expect(layers).toHaveLength(2)
    expect(layers[1]).toMatchObject({ color: 2, height: 0, target: 2, dying: false })
  })

  it('drains a removed top layer to zero and prunes it', () => {
    const sim = createSim()
    syncTube(sim, 0, 4, [1, 1, 2, 2], true)
    syncTube(sim, 0, 4, [1, 1])

    for (let i = 0; i < 600; i++) step(sim, 1 / 60)
    const layers = sim.tubes[0].layers
    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({ color: 1, target: 2 })
  })

  it('snapAll jumps to target layout immediately', () => {
    const sim = createSim()
    syncTube(sim, 0, 4, [1, 1, 2, 2])
    snapAll(sim)
    expect(fillUnits(sim.tubes[0])).toBeCloseTo(4, 5)
    expect(isSettled(sim)).toBe(true)
  })

  it('keeps other tubes intact when syncing one tube', () => {
    const sim = createSim()
    for (let i = 0; i < 7; i++) syncTube(sim, i, 4, [1, 1, 2, 2], true)
    syncTube(sim, 0, 4, [1, 1])
    expect(sim.tubes).toHaveLength(7)
    expect(sim.tubes[5].layers).toHaveLength(2)
    expect(fillUnits(sim.tubes[5])).toBeCloseTo(4, 5)
  })
})

describe('springs', () => {
  it('layer heights converge on their targets', () => {
    const sim = createSim()
    syncTube(sim, 0, 4, [1, 1], true)
    syncTube(sim, 0, 4, [1, 1, 2, 2])
    for (let i = 0; i < 600; i++) step(sim, 1 / 60)
    expect(fillUnits(sim.tubes[0])).toBeCloseTo(4, 2)
  })
})

describe('waves', () => {
  it('an impulse creates motion that damps out', () => {
    const sim = makeSim()
    waveImpulse(sim, 0, 0.5, 400)
    let peak = 0
    for (let i = 0; i < 240; i++) {
      step(sim, 1 / 60)
      for (const h of sim.tubes[0].heights) peak = Math.max(peak, Math.abs(h))
    }
    expect(peak).toBeGreaterThan(0.1)
    expect(peak).toBeLessThanOrEqual(16)
    for (let i = 0; i < 1200; i++) step(sim, 1 / 60)
    for (const h of sim.tubes[0].heights) expect(Math.abs(h)).toBeLessThan(0.05)
    expect(isSettled(sim)).toBe(true)
  })

  it('waves reflect without blowing up or going non-finite', () => {
    const sim = makeSim()
    waveImpulse(sim, 0, 0, 6000)
    slosh(sim, 0, 2000)
    for (let i = 0; i < 300; i++) step(sim, 1 / 60)
    for (const h of sim.tubes[0].heights) {
      expect(Number.isFinite(h)).toBe(true)
      expect(Math.abs(h)).toBeLessThanOrEqual(16)
    }
  })

  it('survives a huge dt without producing NaN', () => {
    const sim = makeSim()
    waveImpulse(sim, 0, 0.3, 800)
    step(sim, 5)
    for (const h of sim.tubes[0].heights) expect(Number.isFinite(h)).toBe(true)
  })
})

describe('particles', () => {
  it('expire after their ttl', () => {
    const sim = makeSim()
    spawnDroplets(sim, 100, 100, 1, 12)
    spawnSparks(sim, 100, 100, 2, 8)
    spawnConfetti(sim, 100, 0, 10)
    expect(sim.particles.length).toBe(30)
    expect(isSettled(sim)).toBe(false)
    for (let i = 0; i < 300; i++) step(sim, 1 / 60)
    expect(sim.particles.length).toBe(0)
    expect(isSettled(sim)).toBe(true)
  })

  it('gravity pulls droplets downward', () => {
    const sim = makeSim()
    spawnDroplets(sim, 100, 100, 1, 1, { speed: 0 })
    const before = sim.particles[0].y
    step(sim, 1 / 30)
    expect(sim.particles[0].y).toBeGreaterThan(before)
  })
})
