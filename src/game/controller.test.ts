import { describe, expect, it } from 'vitest'
import { createController, describeTap, type ControllerPorts, type ControllerStage } from './controller'
import { pour } from './rules'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { createGame } from './state'
import type { SoundName } from './audio'
import type { GameEvent, GameState } from './types'
import type { StagePrefs } from './water/stage'

/* --------------------------------------------------------------- fakes ---- */

interface Harness {
  controller: ReturnType<typeof createController>
  events: GameEvent[]
  dispatched: GameState[]
  prefs: StagePrefs[]
  sounds: SoundName[]
  haptics: Array<number | number[]>
  saved: Settings[]
  updates: Array<{ state: GameState; settings: Settings }>
  unlocks: () => number
}

/**
 * Build a controller over recording fakes.
 *
 * The stage fake is a proxy that throws on any property it does not have. That
 * is the tripwire: the moment a controller asks the stage whether it is busy,
 * every test fails with a clear message rather than the gate quietly returning.
 */
function harness(board: number[][], settings: Partial<Settings> = {}): Harness {
  const events: GameEvent[] = []
  const dispatched: GameState[] = []
  const prefs: StagePrefs[] = []
  const sounds: SoundName[] = []
  const haptics: Array<number | number[]> = []
  const saved: Settings[] = []
  const updates: Array<{ state: GameState; settings: Settings }> = []
  let unlocks = 0

  const stage = new Proxy(
    {
      dispatch(event: GameEvent, state: GameState) {
        events.push(event)
        dispatched.push(state)
      },
      setPrefs(next: StagePrefs) {
        prefs.push(next)
      },
    },
    {
      get(target, key, receiver) {
        if (typeof key === 'symbol' || key in target) return Reflect.get(target, key, receiver)
        throw new Error(
          `the controller reached for stage.${String(key)}; the stage port exposes no animation state`,
        )
      },
    },
  ) as ControllerStage

  const ports: ControllerPorts = {
    ui: {
      update(state, next) {
        updates.push({ state, settings: next })
      },
    },
    stage,
    audio: {
      play(name) {
        sounds.push(name)
      },
      unlock() {
        unlocks++
      },
      setEnabled() {},
    },
    haptic(pattern) {
      haptics.push(pattern)
    },
    settings: {
      load: () => ({ ...DEFAULT_SETTINGS, ...settings }),
      save(next) {
        saved.push(next)
      },
    },
    newBoard: () => createGame(board.map((colors) => [...colors])),
  }

  return {
    controller: createController(ports),
    events,
    dispatched,
    prefs,
    sounds,
    haptics,
    saved,
    updates,
    unlocks: () => unlocks,
  }
}

const pourEvents = (events: GameEvent[]) => events.filter((event) => event.type === 'pour')

/* --------------------------------------------------------------- suite ---- */

describe('describeTap', () => {
  const board = [[1, 1], [2, 2], []]

  it('describes a pour with the source, destination, amount and colour', () => {
    const before = createGame(board)
    const after = pour(before, 0, 2)
    expect(describeTap(before, after, 2)).toEqual({
      type: 'pour',
      from: 0,
      to: 2,
      amount: 2,
      color: 1,
    })
  })

  it('describes a fresh selection', () => {
    const before = createGame(board)
    const after = { ...before, selected: 1 }
    expect(describeTap(before, after, 1)).toEqual({ type: 'select', index: 1 })
  })

  it('describes a deselection', () => {
    const before = { ...createGame(board), selected: 1 }
    const after = { ...before, selected: null }
    expect(describeTap(before, after, 1)).toEqual({ type: 'deselect' })
  })
})

describe('rapid input', () => {
  it('applies every tapped move with no animation to wait for', () => {
    // Both pours are legal from the start and independent of each other.
    const h = harness([
      [1, 1], // 0
      [], // 1
      [2, 2, 2, 2], // 2
      [1, 1], // 3
      [], // 4
    ])
    h.controller.start()

    // All four taps in one synchronous burst: no timers, no frames, no waiting.
    h.controller.tap(3) // select 3
    h.controller.tap(1) // pour 3 -> 1
    h.controller.tap(0) // select 0
    h.controller.tap(4) // pour 0 -> 4

    expect(h.controller.state.moves).toBe(2)
    expect(h.controller.state.tubes[1].colors).toEqual([1, 1])
    expect(h.controller.state.tubes[4].colors).toEqual([1, 1])
    expect(h.controller.state.tubes[3].colors).toEqual([])
    expect(h.controller.state.tubes[0].colors).toEqual([])

    const pours = pourEvents(h.events)
    expect(pours).toEqual([
      { type: 'pour', from: 3, to: 1, amount: 2, color: 1 },
      { type: 'pour', from: 0, to: 4, amount: 2, color: 1 },
    ])
    // Every event reached the stage, in tap order, and each carried the state
    // as it stood at that moment.
    // `new` is the opening board from start(), then the four taps in order.
    expect(h.events.map((event) => event.type)).toEqual(['new', 'select', 'pour', 'select', 'pour'])
    expect(h.dispatched[2].moves).toBe(1)
    expect(h.dispatched[4].moves).toBe(2)
  })

  it('does not need the stage to report anything', () => {
    const h = harness([[1, 1], []])
    h.controller.start()
    // The proxy stage throws on any property access beyond dispatch/setPrefs.
    expect(() => {
      h.controller.tap(0) // select
      h.controller.tap(1) // pour, while a pour would still be playing
      h.controller.tap(0) // rejected: the tube is now empty
      h.controller.tap(1) // select
    }).not.toThrow()
    // Every tap was still handled, in order, with no animation check anywhere.
    expect(h.events.map((event) => event.type)).toEqual([
      'new',
      'select',
      'pour',
      'invalid',
      'select',
    ])
    expect(h.controller.state.moves).toBe(1)
    expect(h.controller.state.selected).toBe(1)
  })
})

describe('taps', () => {
  it('rejects a tap on an empty tube without changing state', () => {
    const h = harness([[1, 1], []])
    h.controller.start()
    const before = h.controller.state
    h.controller.tap(1)
    expect(h.controller.state).toBe(before)
    expect(h.sounds).toContain('invalid')
    expect(h.events).toContainEqual({ type: 'invalid', index: 1 })
    expect(pourEvents(h.events)).toEqual([])
  })

  it('says nothing when tapping a full tube with nothing selected', () => {
    const h = harness([[2, 2, 2, 2]])
    h.controller.start()
    h.controller.tap(0)
    expect(h.controller.state.selected).toBe(0)
    expect(h.sounds).not.toContain('invalid')
  })

  it('switches selection when the pour is illegal', () => {
    const h = harness([
      [1, 2], // 0
      [3, 3], // 1
    ])
    h.controller.start()
    h.controller.tap(0)
    expect(h.controller.state.selected).toBe(0)
    h.controller.tap(1) // top colours differ, so this is a selection change
    expect(h.controller.state.selected).toBe(1)
    expect(h.controller.state.moves).toBe(0)
  })

  it('deselects when the selected tube is tapped again', () => {
    const h = harness([[1, 1]])
    h.controller.start()
    h.controller.tap(0)
    h.controller.tap(0)
    expect(h.controller.state.selected).toBeNull()
    expect(h.events.map((event) => event.type)).toEqual(['new', 'select', 'deselect'])
  })
})

describe('undo and new game', () => {
  it('restores the previous board and tells the stage', () => {
    const h = harness([[1, 1], []])
    h.controller.start()
    h.controller.tap(0)
    h.controller.tap(1)
    expect(h.controller.state.moves).toBe(1)

    h.controller.undo()
    expect(h.controller.state.moves).toBe(0)
    expect(h.controller.state.tubes[0].colors).toEqual([1, 1])
    expect(h.controller.state.tubes[1].colors).toEqual([])
    expect(h.events[h.events.length - 1]).toEqual({ type: 'undo' })
  })

  it('does nothing when there is no history', () => {
    const h = harness([[1, 1], []])
    h.controller.start()
    const stageCalls = h.events.length
    h.controller.undo()
    expect(h.events).toHaveLength(stageCalls)
    expect(h.controller.state.moves).toBe(0)
  })

  it('new game replaces the board and dispatches a fresh start', () => {
    const h = harness([[1, 1], []])
    h.controller.start()
    h.controller.tap(0)
    h.controller.newGame()
    expect(h.controller.state.moves).toBe(0)
    expect(h.events[h.events.length - 1]).toEqual({ type: 'new' })
  })
})

describe('feedback', () => {
  it('completes a tube with a chime, but does not call it a win', () => {
    const h = harness([
      [1, 1, 1], // 0
      [1], // 1
      [2, 2], // 2: unfinished, so the game is not won
    ])
    h.controller.start()
    h.controller.tap(1)
    h.controller.tap(0)
    expect(h.sounds).toContain('complete')
    expect(h.sounds).not.toContain('win')
  })

  it('plays the win fanfare and a haptic pattern on the last tube', () => {
    const h = harness([
      [1, 1, 1], // 0
      [1], // 1
      [2, 2, 2, 2], // 2
    ])
    h.controller.start()
    h.controller.tap(1)
    h.controller.tap(0)
    expect(h.controller.state.won).toBe(true)
    expect(h.sounds).toContain('win')
    expect(h.haptics).toContainEqual([14, 40, 14, 40, 22])
  })

  it('unlocks audio before every committed move', () => {
    const h = harness([[1, 1], []])
    h.controller.start()
    expect(h.unlocks()).toBe(0)
    h.controller.tap(0)
    h.controller.tap(1)
    expect(h.unlocks()).toBe(2)
  })
})

describe('toggles', () => {
  it('persists the sound setting and applies it', () => {
    const h = harness([[1, 1]], { sound: false })
    h.controller.start()
    h.controller.toggleSound()
    expect(h.controller.settings.sound).toBe(true)
    expect(h.saved[h.saved.length - 1].sound).toBe(true)
    expect(h.sounds).toContain('select')
  })

  it('persists the pour effect setting and tells the stage', () => {
    const h = harness([[1, 1]], { pourFx: true })
    h.controller.start()
    h.controller.togglePourFx()
    expect(h.saved[h.saved.length - 1].pourFx).toBe(false)
    expect(h.prefs[h.prefs.length - 1]).toEqual({ pourFx: false })
  })
})

describe('start', () => {
  it('paints the UI before the stage, so the stage can measure', () => {
    const h = harness([[1, 1], []], { sound: false, pourFx: true })
    h.controller.start()
    expect(h.updates).toHaveLength(1)
    expect(h.prefs).toEqual([{ pourFx: true }])
    expect(h.events).toEqual([{ type: 'new' }])
    expect(h.sounds).toEqual([])
  })
})
