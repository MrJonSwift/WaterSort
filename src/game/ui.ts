/**
 * DOM chrome: HUD, board with glass tubes, controls, toggles, and banner.
 *
 * This layer owns *static* presentation only — text, ARIA state, and visual
 * classes. All motion and liquid live in the water stage (`water/stage.ts`),
 * which is the single writer of tube transforms.
 */
import type { Settings } from './settings'
import { isComplete } from './rules'
import type { GameState } from './types'

export interface UIHandlers {
  onTap(index: number): void
  onNew(): void
  onUndo(): void
  onToggleSound(): void
  onTogglePourFx(): void
}

export interface UI {
  update(state: GameState, prefs: Settings): void
}

interface Toggle {
  root: HTMLButtonElement
  set(on: boolean): void
}

function makeToggle(label: string, onClick: () => void): Toggle {
  const root = document.createElement('button')
  root.type = 'button'
  root.className = 'toggle'
  root.setAttribute('aria-pressed', 'false')
  const dot = document.createElement('span')
  dot.className = 'toggle__dot'
  const text = document.createElement('span')
  text.className = 'toggle__label'
  text.textContent = label
  root.append(dot, text)
  root.addEventListener('click', onClick)
  return {
    root,
    set(on) {
      root.classList.toggle('is-on', on)
      root.setAttribute('aria-pressed', String(on))
    },
  }
}

export function createUI(root: HTMLElement, handlers: UIHandlers): UI {
  root.classList.add('game')

  const hud = document.createElement('header')
  hud.className = 'hud'
  const title = document.createElement('h1')
  title.className = 'title'
  title.textContent = 'WaterSort'
  const moves = document.createElement('p')
  moves.className = 'moves'
  hud.append(title, moves)

  const board = document.createElement('div')
  board.className = 'board'
  board.setAttribute('role', 'group')
  board.setAttribute('aria-label', 'Tubes')

  const controls = document.createElement('div')
  controls.className = 'controls'
  const undoBtn = document.createElement('button')
  undoBtn.type = 'button'
  undoBtn.className = 'btn'
  undoBtn.textContent = 'Undo'
  undoBtn.addEventListener('click', () => handlers.onUndo())
  const newBtn = document.createElement('button')
  newBtn.type = 'button'
  newBtn.className = 'btn btn--primary'
  newBtn.textContent = 'New game'
  newBtn.addEventListener('click', () => handlers.onNew())
  controls.append(undoBtn, newBtn)

  const toggles = document.createElement('div')
  toggles.className = 'toggles'
  const soundToggle = makeToggle('Sound', handlers.onToggleSound)
  const pourToggle = makeToggle('Pour FX', handlers.onTogglePourFx)
  toggles.append(soundToggle.root, pourToggle.root)

  const banner = document.createElement('p')
  banner.className = 'banner'
  banner.setAttribute('role', 'status')
  banner.hidden = true

  root.append(hud, board, controls, toggles, banner)

  function ensureTubes(count: number): HTMLButtonElement[] {
    const existing = board.querySelectorAll<HTMLButtonElement>('.tube')
    if (existing.length === count) return Array.from(existing)

    board.replaceChildren()
    const tubes: HTMLButtonElement[] = []
    for (let i = 0; i < count; i++) {
      const tube = document.createElement('button')
      tube.type = 'button'
      tube.className = 'tube'
      tube.dataset.index = String(i)
      const glass = document.createElement('span')
      glass.className = 'glass'
      tube.append(glass)
      tube.addEventListener('click', () => handlers.onTap(i))
      board.append(tube)
      tubes.push(tube)
    }
    return tubes
  }

  return {
    update(state: GameState, prefs: Settings) {
      const tubes = ensureTubes(state.tubes.length)

      moves.textContent = `${state.moves} ${state.moves === 1 ? 'move' : 'moves'}`
      undoBtn.disabled = state.history.length === 0
      soundToggle.set(prefs.sound)
      pourToggle.set(prefs.pourFx)

      tubes.forEach((tube, i) => {
        const colors = state.tubes[i].colors
        tube.setAttribute('aria-label', `Tube ${i + 1}, ${colors.length} of ${state.capacity} filled`)
        tube.classList.toggle('is-selected', state.selected === i)
        tube.classList.toggle('is-complete', isComplete(state.tubes[i], state.capacity))
      })

      banner.hidden = !state.won
      if (state.won) {
        banner.textContent = `Solved in ${state.moves} ${state.moves === 1 ? 'move' : 'moves'}!`
      }
    },
  }
}
