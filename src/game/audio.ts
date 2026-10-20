export type SoundName = 'select' | 'pour' | 'complete' | 'win' | 'invalid'

export interface Audio {
  /** Current AudioContext state, or null before the context exists. */
  readonly state: AudioContextState | null
  setEnabled(enabled: boolean): void
  /** Create/resume the context from a user gesture (required by iOS). */
  unlock(): void
  play(name: SoundName): void
}

interface ToneOptions {
  freq: number
  to?: number
  duration: number
  type?: OscillatorType
  gain?: number
  delay?: number
}

interface NoiseOptions {
  duration: number
  freq: number
  to?: number
  q?: number
  gain?: number
}

type AudioContextCtor = typeof AudioContext

function resolveCtor(): AudioContextCtor | undefined {
  return (
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  )
}

function tone(ctx: AudioContext, dest: AudioNode, opts: ToneOptions): void {
  const t0 = ctx.currentTime + (opts.delay ?? 0)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.duration)
  const peak = opts.gain ?? 0.2
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  osc.connect(gain).connect(dest)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.05)
}

function noise(ctx: AudioContext, dest: AudioNode, opts: NoiseOptions): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * opts.duration))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(opts.freq, ctx.currentTime)
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, ctx.currentTime + opts.duration)
  filter.Q.value = opts.q ?? 5

  const gain = ctx.createGain()
  const t0 = ctx.currentTime
  const peak = opts.gain ?? 0.18
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)

  source.connect(filter).connect(gain).connect(dest)
  source.start(t0)
  source.stop(t0 + opts.duration + 0.05)
}

/** Synthesized sound effects; no audio assets required. */
export function createAudio(): Audio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let enabled = false

  function ensure(): AudioContext | null {
    if (!enabled) return null
    if (!ctx) {
      const Ctor = resolveCtor()
      if (!Ctor) return null
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.22
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }

  return {
    get state() {
      return ctx?.state ?? null
    },
    setEnabled(next) {
      enabled = next
      // Never create the context here: it must be constructed from a user
      // gesture. unlock()/play() do that.
      if (!enabled && ctx && ctx.state === 'running') void ctx.suspend()
    },
    unlock() {
      ensure()
    },
    play(name) {
      const c = ensure()
      const dest = master
      if (!c || !dest) return
      switch (name) {
        case 'select':
          tone(c, dest, { freq: 560, to: 760, duration: 0.09, gain: 0.15 })
          break
        case 'pour':
          noise(c, dest, { duration: 0.34, freq: 1400, to: 480, q: 4, gain: 0.15 })
          tone(c, dest, { freq: 300, to: 170, duration: 0.3, gain: 0.06 })
          break
        case 'complete':
          tone(c, dest, { freq: 660, duration: 0.12, type: 'triangle', gain: 0.17 })
          tone(c, dest, { freq: 990, duration: 0.16, type: 'triangle', gain: 0.14, delay: 0.09 })
          break
        case 'win':
          ;[523, 659, 784, 1047].forEach((freq, i) =>
            tone(c, dest, {
              freq,
              duration: 0.22,
              type: 'triangle',
              gain: 0.17,
              delay: i * 0.1,
            }),
          )
          break
        case 'invalid':
          tone(c, dest, { freq: 190, to: 110, duration: 0.18, type: 'square', gain: 0.1 })
          break
      }
    },
  }
}
