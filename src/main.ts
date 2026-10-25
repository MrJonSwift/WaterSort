/**
 * Wiring only: build the ports, hand them to the controller, start it.
 *
 * Everything that decides anything lives in `game/controller.ts`. If this file
 * grows a game rule, a state variable or a check on whether something is
 * animating, the logic has leaked out of the controller.
 */
import './style.css'
import { createAudio } from './game/audio'
import { createController } from './game/controller'
import { generateLevel } from './game/generator'
import { haptic, preventDoubleTapZoom } from './game/input'
import { applyPaletteToCss } from './game/palette'
import { loadProgress, saveProgress } from './game/progress'
import { loadSettings, saveSettings } from './game/settings'
import { createGame } from './game/state'
import { createUI } from './game/ui'
import { createStage } from './game/water/stage'

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

applyPaletteToCss()

const app = requireElement('#app')
const audio = createAudio()
const stage = createStage(app)

// The UI needs its handlers up front and the handlers need the controller, so
// the controller is assigned just below, before anything can be clicked.
let controller: ReturnType<typeof createController>

const ui = createUI(app, {
  onTap: (index) => controller.tap(index),
  onUndo: () => controller.undo(),
  onPrimary: () => controller.primary(),
  onToggleSound: () => controller.toggleSound(),
  onTogglePourFx: () => controller.togglePourFx(),
})

controller = createController({
  ui,
  stage,
  audio,
  haptic,
  settings: { load: loadSettings, save: saveSettings },
  progress: { load: loadProgress, save: saveProgress },
  board: (level) => createGame(generateLevel(level).board),
})

preventDoubleTapZoom(app)
controller.start()
