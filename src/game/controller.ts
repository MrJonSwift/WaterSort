/**
 * The session controller: the only place that decides what a tap means.
 *
 * It owns the game state and drives presentation through ports — UI text,
 * the water stage, audio, haptics, saved settings. The stage port exposes no
 * way to ask whether an animation is running, on purpose: input is never
 * conditional on animation, so a move lands the instant it is tapped and the
 * stage catches up or preempts. If a "busy" check is ever added here, the
 * design has regressed.
 *
 * No DOM and no canvas imports: every effect arrives through a port, which is
 * what makes a whole session testable with fakes.
 */
import { isComplete } from './rules'
import type { SoundName } from './audio'
import type { Settings } from './settings'
import { tap as applyTap, undo as applyUndo } from './state'
import type { GameEvent, GameState } from './types'
import type { StagePrefs } from './water/stage'

export interface ControllerUI {
  update(state: GameState, settings: Settings): void
}

/**
 * The stage port. Note what is missing: no `isAnimating`, no animation state
 * of any kind. The controller cannot gate input on the stage being idle.
 */
export interface ControllerStage {
  dispatch(event: GameEvent, state: GameState): void
  setPrefs(prefs: StagePrefs): void
}

export interface ControllerAudio {
  play(name: SoundName): void
  unlock(): void
  setEnabled(enabled: boolean): void
}

export interface ControllerSettings {
  load(): Settings
  save(settings: Settings): void
}

export interface ControllerPorts {
  ui: ControllerUI
  stage: ControllerStage
  audio: ControllerAudio
  haptic(pattern: number | number[]): void
  settings: ControllerSettings
  /** Build a fresh board. Level selection replaces this in a later ticket. */
  newBoard(): GameState
}

export interface Controller {
  /** First paint: build the DOM tubes, then tell the stage the board exists. */
  start(): void
  tap(index: number): void
  undo(): void
  newGame(): void
  toggleSound(): void
  togglePourFx(): void
  readonly state: GameState
  readonly settings: Settings
}

/**
 * Describe what a tap did so presentation can react to it.
 *
 * `index` is the tube the player tapped, which for a pour is the destination.
 */
export function describeTap(before: GameState, after: GameState, index: number): GameEvent {
  if (after.moves > before.moves) {
    const move = after.history[after.history.length - 1]
    const to = after.tubes[index]
    return {
      type: 'pour',
      from: move.from,
      to: index,
      amount: move.amount,
      color: to.colors[to.colors.length - 1] ?? 0,
    }
  }
  return after.selected === index ? { type: 'select', index } : { type: 'deselect' }
}

function completedCount(game: GameState): number {
  return game.tubes.filter((tube) => isComplete(tube, game.capacity)).length
}

export function createController(ports: ControllerPorts): Controller {
  let state: GameState = ports.newBoard()
  let settings: Settings = ports.settings.load()

  function playFeedback(before: GameState, after: GameState, event: GameEvent): void {
    if (event.type === 'pour') {
      ports.audio.play('pour')
      ports.haptic(12)
    } else if (event.type === 'select') {
      ports.audio.play('select')
      ports.haptic(6)
    }

    if (after.won && !before.won) {
      ports.audio.play('win')
      ports.haptic([14, 40, 14, 40, 22])
    } else if (completedCount(after) > completedCount(before)) {
      ports.audio.play('complete')
    }
  }

  /** Apply a state change: sound and UI first, then the stage, then commit. */
  function commit(before: GameState, next: GameState, event: GameEvent): void {
    ports.audio.unlock()
    playFeedback(before, next, event)
    ports.ui.update(next, settings)
    ports.stage.dispatch(event, next)
    state = next
  }

  return {
    get state() {
      return state
    },
    get settings() {
      return settings
    },

    start() {
      // The UI must build the tubes before the stage can measure them.
      ports.ui.update(state, settings)
      ports.stage.setPrefs({ pourFx: settings.pourFx })
      ports.audio.setEnabled(settings.sound)
      ports.stage.dispatch({ type: 'new' }, state)
    },

    tap(index) {
      const before = state
      const next = applyTap(before, index)
      if (next === before) {
        // Tapping an empty tube is the one rejected move worth answering.
        if (before.tubes[index]?.colors.length === 0) {
          ports.audio.play('invalid')
          ports.stage.dispatch({ type: 'invalid', index }, before)
        }
        return
      }
      commit(before, next, describeTap(before, next, index))
    },

    undo() {
      const before = state
      const next = applyUndo(before)
      if (next === before) return
      commit(before, next, { type: 'undo' })
    },

    newGame() {
      commit(state, ports.newBoard(), { type: 'new' })
    },

    toggleSound() {
      settings = { ...settings, sound: !settings.sound }
      ports.settings.save(settings)
      ports.audio.setEnabled(settings.sound)
      if (settings.sound) {
        ports.audio.unlock()
        ports.audio.play('select')
      }
      ports.ui.update(state, settings)
    },

    togglePourFx() {
      settings = { ...settings, pourFx: !settings.pourFx }
      ports.settings.save(settings)
      ports.stage.setPrefs({ pourFx: settings.pourFx })
      ports.ui.update(state, settings)
    },
  }
}
