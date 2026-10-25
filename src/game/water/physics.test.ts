import { describe, expect, it } from 'vitest'
import {
  MAX_WAVE,
  createSim,
  fillUnits,
  isSettled,
  snapAll,
  spawnConfetti,
  spawnDroplets,
  spawnSparks,
  step,
  syncTube,
  waveImpulse,
} from './physics'
import { IMPACT_IMPULSE } from './tuning'

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
    expect(peak).toBeLessThanOrEqual(MAX_WAVE)
    for (let i = 0; i < 1200; i++) step(sim, 1 / 60)
    for (const h of sim.tubes[0].heights) expect(Math.abs(h)).toBeLessThan(0.05)
    expect(isSettled(sim)).toBe(true)
  })

  it('waves reflect without blowing up or going non-finite', () => {
    const sim = makeSim()
    waveImpulse(sim, 0, 0, 6000)
    waveImpulse(sim, 0, 1, -6000)
    for (let i = 0; i < 300; i++) step(sim, 1 / 60)
    for (const h of sim.tubes[0].heights) {
      expect(Number.isFinite(h)).toBe(true)
      expect(Math.abs(h)).toBeLessThanOrEqual(MAX_WAVE)
    }
  })

  /*
   * The post-pour budget. A 4-unit transfer is what the stage does at the
   * moment the stream starts: the source drains, the destination fills, and
   * the stream lands with the same impulse the stage uses. The player must be
   * able to move on straight away, so the surface has to be flat and the
   * simulation asleep within the budget, not merely quiet.
   */
  it('a 4-unit pour is invisible within 1s and settled within 1.2s', () => {
    const sim = createSim()
    syncTube(sim, 0, 4, [1, 1, 1, 1], true)
    syncTube(sim, 1, 4, [], true)
    syncTube(sim, 0, 4, [])
    syncTube(sim, 1, 4, [1, 1, 1, 1])
    waveImpulse(sim, 1, 0.5, IMPACT_IMPULSE)

    let atOneSecond = 0
    let settledAt = Number.POSITIVE_INFINITY
    for (let frame = 1; frame <= 120; frame++) {
      step(sim, 1 / 60)
      if (frame === 60) {
        for (const h of sim.tubes[1].heights) atOneSecond = Math.max(atOneSecond, Math.abs(h))
      }
      if (settledAt === Number.POSITIVE_INFINITY && isSettled(sim)) settledAt = frame / 60
    }

    expect(atOneSecond).toBeLessThan(0.4)
    expect(settledAt).toBeLessThanOrEqual(1.2)
    expect(isSettled(sim)).toBe(true)
  })

  it('the impulse still makes a visible splash', () => {
    const sim = makeSim()
    waveImpulse(sim, 0, 0.5, IMPACT_IMPULSE)
    let peak = 0
    for (let i = 0; i < 60; i++) {
      step(sim, 1 / 60)
      for (const h of sim.tubes[0].heights) peak = Math.max(peak, Math.abs(h))
    }
    // Big enough to read as water being hit, well under a unit of height.
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(MAX_WAVE)
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
