/**
 * DOM chrome: HUD, board with glass tubes, controls, toggles, and banner.
 *
 * This layer owns *static* presentation only — text, ARIA state, and visual
 * classes. All motion and liquid live in the water stage (`water/stage.ts`),
 * which is the single writer of tube transforms.
 */
import type { PrimaryAction, UIView } from './controller'
import type { Settings } from './settings'
import { isComplete } from './rules'
import type { GameState } from './types'

export interface UIHandlers {
  onTap(index: number): void
  onPrimary(): void
  onUndo(): void
  onToggleSound(): void
  onTogglePourFx(): void
}

export interface UI {
  update(state: GameState, settings: Settings, view: UIView): void
}

interface Toggle {
  root: HTMLButtonElement
  set(on: boolean): void
}

const PRIMARY_COPY: Record<PrimaryAction, string> = {
  restart: 'Restart',
  next: 'Next level',
  'play-again': 'Play again',
}

function movesCopy(count: number): string {
  return `${count} ${count === 1 ? 'move' : 'moves'}`
}

/** Banner text for a finished board: the last level reads as the end of the run. */
export function bannerCopy(level: number, maxLevel: number, moves: number): string {
  return level >= maxLevel
    ? `All ${maxLevel} levels complete!`
    : `Level ${level} solved in ${movesCopy(moves)}`
}

/**
 * How many grid columns the board uses for `count` tubes.
 *
 * Up to five tubes sit in one row. Above that the board splits into two rows
 * with a balanced split: 3+3, 4+3, 4+4, 5+4, 5+5. Fixed columns keep the row
 * split independent of viewport width, so tubes never change width.
 */
export function tubeColumns(count: number): number {
  if (count <= 5) return Math.max(1, count)
  return Math.min(5, Math.ceil(count / 2))
}

/**
 * Place the tubes on the grid, pushing the first tube of a short last row
 * sideways so that row is centred as closely as whole columns allow.
 */
function placeTubes(tubes: HTMLButtonElement[], columns: number): void {
  const count = tubes.length
  const rows = Math.ceil(count / columns)
  const lastRow = count - (rows - 1) * columns
  const offset = rows > 1 && lastRow < columns ? Math.ceil((columns - lastRow) / 2) : 0

  for (const tube of tubes) tube.style.gridColumnStart = ''
  if (offset > 0) tubes[count - lastRow].style.gridColumnStart = String(offset + 1)
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
  const identity = document.createElement('div')
  identity.className = 'hud__identity'
  const title = document.createElement('h1')
  title.className = 'title'
  title.textContent = 'WaterSort'
  const levelLine = document.createElement('p')
  levelLine.className = 'level'
  levelLine.setAttribute('aria-live', 'polite')
  identity.append(title, levelLine)
  const moves = document.createElement('p')
  moves.className = 'moves'
  hud.append(identity, moves)

  const board = document.createElement('div')
  board.className = 'board'
  board.setAttribute('role', 'group')
  board.setAttribute('aria-label', 'Tubes')

  // The banner lives inside the board so it can overlay the empty "sky" above
  // the tubes without adding page height. It is out of the grid flow.
  const banner = document.createElement('p')
  banner.className = 'banner'
  banner.setAttribute('role', 'status')
  banner.hidden = true
  board.append(banner)

  const controls = document.createElement('div')
  controls.className = 'controls'
  const undoBtn = document.createElement('button')
  undoBtn.type = 'button'
  undoBtn.className = 'btn'
  undoBtn.textContent = 'Undo'
  undoBtn.addEventListener('click', () => handlers.onUndo())
  const primaryBtn = document.createElement('button')
  primaryBtn.type = 'button'
  primaryBtn.className = 'btn btn--primary'
  primaryBtn.addEventListener('click', () => handlers.onPrimary())
  controls.append(undoBtn, primaryBtn)

  const toggles = document.createElement('div')
  toggles.className = 'toggles'
  const soundToggle = makeToggle('Sound', handlers.onToggleSound)
  const pourToggle = makeToggle('Pour FX', handlers.onTogglePourFx)
  toggles.append(soundToggle.root, pourToggle.root)

  root.append(hud, board, controls, toggles)

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
    // `replaceChildren()` above also removed the banner; keep it across a
    // tube-count change (level 3 to level 4 is 5 to 6 tubes).
    board.append(banner)
    return tubes
  }

  return {
    update(state: GameState, settings: Settings, view: UIView) {
      const tubes = ensureTubes(state.tubes.length)
      const columns = tubeColumns(state.tubes.length)
      board.style.setProperty('--cols', String(columns))
      placeTubes(tubes, columns)

      levelLine.textContent = `Level ${view.level}`
      moves.textContent = movesCopy(state.moves)
      primaryBtn.textContent = PRIMARY_COPY[view.primary]
      undoBtn.disabled = state.history.length === 0
      soundToggle.set(settings.sound)
      pourToggle.set(settings.pourFx)

      tubes.forEach((tube, i) => {
        const colors = state.tubes[i].colors
        tube.setAttribute('aria-label', `Tube ${i + 1}, ${colors.length} of ${state.capacity} filled`)
        tube.classList.toggle('is-selected', state.selected === i)
        tube.classList.toggle('is-complete', isComplete(state.tubes[i], state.capacity))
      })

      banner.hidden = !state.won
      if (state.won) {
        banner.textContent = bannerCopy(view.level, view.maxLevel, state.moves)
      }
    },
  }
}
