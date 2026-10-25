/**
 * The session controller: the only place that decides what a tap means.
 *
 * It owns the game state and drives presentation through ports — UI text,
 * the water stage, audio, haptics, saved settings and saved progress. The stage
 * port exposes no way to ask whether an animation is running, on purpose:
 * input is never conditional on animation, so a move lands the instant it is
 * tapped and the stage catches up or preempts. If a "busy" check is ever added
 * here, the design has regressed.
 *
 * The controller never generates a board itself: `board(level)` is a port, so
 * the level table and seeded generator stay on the wiring side and this module
 * stays a pure session.
 *
 * No DOM and no canvas imports: every effect arrives through a port, which is
 * what makes a whole session testable with fakes.
 */
import { MAX_LEVEL } from './levels'
import type { Progress } from './progress'
import { isComplete } from './rules'
import type { SoundName } from './audio'
import type { Settings } from './settings'
import { tap as applyTap, undo as applyUndo } from './state'
import type { GameEvent, GameState } from './types'
import type { StagePrefs } from './water/stage'

/** What the single primary button does for the current session. */
export type PrimaryAction = 'restart' | 'next' | 'play-again'

/** Presentation-only view of the session, passed alongside the game state. */
export interface UIView {
  level: number
  maxLevel: number
  primary: PrimaryAction
}

export interface ControllerUI {
  update(state: GameState, settings: Settings, view: UIView): void
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

export interface ControllerProgress {
  load(): Progress
  save(progress: Progress): void
}

export interface ControllerPorts {
  ui: ControllerUI
  stage: ControllerStage
  audio: ControllerAudio
  haptic(pattern: number | number[]): void
  settings: ControllerSettings
  progress: ControllerProgress
  /** Build the deterministic board for a numbered level. */
  board(level: number): GameState
}

export interface Controller {
  /** First paint: build the DOM tubes, then tell the stage the board exists. */
  start(): void
  tap(index: number): void
  undo(): void
  /** Rebuild the current level; same board, zero moves. */
  restart(): void
  /** Move to the next level (or play again at the end) and save it. */
  nextLevel(): void
  /** Back to level 1, keeping the highest level reached. */
  playAgain(): void
  /** Run whatever the primary button currently means. */
  primary(): void
  toggleSound(): void
  togglePourFx(): void
  readonly state: GameState
  readonly settings: Settings
  readonly level: number
  readonly progress: Progress
}

/** What the primary button should do, given the state and current level. */
export function primaryAction(state: GameState, level: number): PrimaryAction {
  if (!state.won) return 'restart'
  return level < MAX_LEVEL ? 'next' : 'play-again'
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
  let progress: Progress = ports.progress.load()
  let level = progress.level
  let state: GameState = ports.board(level)
  let settings: Settings = ports.settings.load()

  function viewFor(next: GameState = state): UIView {
    return {
      level,
      maxLevel: MAX_LEVEL,
      primary: primaryAction(next, level),
    }
  }

  function playFeedback(before: GameState, after: GameState, event: GameEvent): void {
    if (event.type === 'pour') {
      ports.audio.play('pour')
      ports.haptic(12)
    } else if (event.type === 'select') {
      ports.audio.play('select')
      ports.haptic(6)
    }

    if (after.won && !before.won) {
      // One save per win: this transition can only fire once, and a won board
      // ignores further taps.
      progress = { ...progress, highest: Math.max(progress.highest, level) }
      ports.progress.save(progress)
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
    ports.ui.update(next, settings, viewFor(next))
    ports.stage.dispatch(event, next)
    state = next
  }

  function restart(): void {
    // Same level, same deterministic board: only moves and history reset.
    commit(state, ports.board(level), { type: 'new' })
  }

  function nextLevel(): void {
    if (level >= MAX_LEVEL) {
      playAgain()
      return
    }
    level += 1
    progress = { ...progress, level }
    ports.progress.save(progress)
    commit(state, ports.board(level), { type: 'new' })
  }

  function playAgain(): void {
    level = 1
    progress = { ...progress, level }
    ports.progress.save(progress)
    commit(state, ports.board(level), { type: 'new' })
  }

  function primary(): void {
    switch (primaryAction(state, level)) {
      case 'next':
        nextLevel()
        break
      case 'play-again':
        playAgain()
        break
      default:
        restart()
    }
  }

  return {
    get state() {
      return state
    },
    get settings() {
      return settings
    },
    get level() {
      return level
    },
    get progress() {
      return progress
    },

    start() {
      // The UI must build the tubes before the stage can measure them.
      ports.ui.update(state, settings, viewFor())
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

    restart,
    nextLevel,
    playAgain,
    primary,

    toggleSound() {
      settings = { ...settings, sound: !settings.sound }
      ports.settings.save(settings)
      ports.audio.setEnabled(settings.sound)
      if (settings.sound) {
        ports.audio.unlock()
        ports.audio.play('select')
      }
      ports.ui.update(state, settings, viewFor())
    },

    togglePourFx() {
      settings = { ...settings, pourFx: !settings.pourFx }
      ports.settings.save(settings)
      ports.stage.setPrefs({ pourFx: settings.pourFx })
      ports.ui.update(state, settings, viewFor())
    },
  }
}
