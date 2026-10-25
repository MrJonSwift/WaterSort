import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_LEVEL } from './levels'
import { DEFAULT_PROGRESS, loadProgress, saveProgress } from './progress'

function createStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

const KEY = 'watersort:progress'

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage())
})

describe('loadProgress', () => {
  it('starts at level 1 with nothing saved', () => {
    expect(loadProgress()).toEqual({ level: 1, highest: 1 })
    expect(DEFAULT_PROGRESS).toEqual({ level: 1, highest: 1 })
  })

  it('round-trips saved progress', () => {
    saveProgress({ level: 3, highest: 4 })
    expect(loadProgress()).toEqual({ level: 3, highest: 4 })
  })

  it('falls back to defaults for corrupt data', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadProgress()).toEqual(DEFAULT_PROGRESS)
  })

  it('defaults fields that are missing or the wrong type', () => {
    localStorage.setItem(KEY, JSON.stringify({ level: '2', highest: true }))
    expect(loadProgress()).toEqual(DEFAULT_PROGRESS)

    localStorage.setItem(KEY, JSON.stringify({ level: 3 }))
    expect(loadProgress()).toEqual({ level: 3, highest: 3 })

    localStorage.setItem(KEY, JSON.stringify({ highest: 4 }))
    expect(loadProgress()).toEqual({ level: 1, highest: 4 })
  })

  it('clamps both fields into the level range', () => {
    localStorage.setItem(KEY, JSON.stringify({ level: 0, highest: -5 }))
    expect(loadProgress()).toEqual({ level: 1, highest: 1 })

    localStorage.setItem(KEY, JSON.stringify({ level: MAX_LEVEL + 10, highest: 99 }))
    expect(loadProgress()).toEqual({ level: MAX_LEVEL, highest: MAX_LEVEL })
  })

  it('repairs a highest below the current level', () => {
    localStorage.setItem(KEY, JSON.stringify({ level: 3, highest: 1 }))
    expect(loadProgress()).toEqual({ level: 3, highest: 3 })
  })

  it('ignores storage that throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
    })
    expect(loadProgress()).toEqual(DEFAULT_PROGRESS)
  })
})

describe('saveProgress', () => {
  it('ignores storage that throws on write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem() {
        throw new Error('quota')
      },
    })
    expect(() => saveProgress({ level: 2, highest: 2 })).not.toThrow()
  })
})
