import './style.css'
import { createAudio } from './game/audio'
import { haptic, preventDoubleTapZoom } from './game/input'
import { isComplete } from './game/rules'
import { applyPaletteToCss } from './game/palette'
import { loadSettings, saveSettings } from './game/settings'
import type { Settings } from './game/settings'
import { createGame, generatePuzzle, tap, undo } from './game/state'
import type { GameEvent, GameState } from './game/types'
import { createUI } from './game/ui'
import { createStage } from './game/water/stage'

const COLOR_COUNT = 5
const EMPTY_TUBES = 2

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

applyPaletteToCss()

const app = requireElement('#app')
const audio = createAudio()
let settings: Settings = loadSettings()

function newPuzzle(): GameState {
  return createGame(generatePuzzle(COLOR_COUNT, EMPTY_TUBES))
}

let state: GameState = newPuzzle()

/** Describe what a tap did so presentation can react to it. */
function describeTap(before: GameState, after: GameState, index: number): GameEvent {
  if (after.moves > before.moves) {
    const to = after.tubes[index]
    const move = after.history[after.history.length - 1]
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

function playFeedback(before: GameState, after: GameState, event: GameEvent): void {
  if (event.type === 'pour') {
    audio.play('pour')
    haptic(12)
  } else if (event.type === 'select') {
    audio.play('select')
    haptic(6)
  }

  if (after.won && !before.won) {
    audio.play('win')
    haptic([14, 40, 14, 40, 22])
  } else if (completedCount(after) > completedCount(before)) {
    audio.play('complete')
  }
}

function commit(before: GameState, next: GameState, event: GameEvent): void {
  audio.unlock()
  playFeedback(before, next, event)
  ui.update(next, settings)
  stage.dispatch(event, next)
  state = next
}

const stage = createStage(app)

const ui = createUI(app, {
  onTap(index) {
    if (stage.isAnimating()) return
    const before = state
    const next = tap(state, index)
    if (next === before) {
      if (before.tubes[index]?.colors.length === 0) {
        audio.play('invalid')
        stage.dispatch({ type: 'invalid', index }, before)
      }
      return
    }
    commit(before, next, describeTap(before, next, index))
  },

  onUndo() {
    if (stage.isAnimating()) return
    const before = state
    const next = undo(state)
    if (next === before) return
    commit(before, next, { type: 'undo' })
  },

  onNew() {
    if (stage.isAnimating()) return
    commit(state, newPuzzle(), { type: 'new' })
  },

  onToggleSound() {
    settings = { ...settings, sound: !settings.sound }
    saveSettings(settings)
    audio.setEnabled(settings.sound)
    if (settings.sound) {
      audio.unlock()
      audio.play('select')
    }
    ui.update(state, settings)
  },

  onTogglePourFx() {
    settings = { ...settings, pourFx: !settings.pourFx }
    saveSettings(settings)
    stage.setPrefs({ pourFx: settings.pourFx })
    ui.update(state, settings)
  },
})

stage.setPrefs({ pourFx: settings.pourFx })
audio.setEnabled(settings.sound)
preventDoubleTapZoom(app)
// The UI must build the tubes before the stage can measure them.
ui.update(state, settings)
stage.dispatch({ type: 'new' }, state)
