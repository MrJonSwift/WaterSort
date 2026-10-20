import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'

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

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage())
})

describe('loadSettings', () => {
  it('defaults sound to off and pourFx to on', () => {
    expect(loadSettings()).toEqual({ sound: false, pourFx: true })
    expect(DEFAULT_SETTINGS.sound).toBe(false)
  })

  it('round-trips saved settings', () => {
    saveSettings({ sound: true, pourFx: false })
    expect(loadSettings()).toEqual({ sound: true, pourFx: false })
  })

  it('falls back to defaults for corrupt data', () => {
    localStorage.setItem('watersort:settings', '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('fills in missing fields with defaults', () => {
    localStorage.setItem('watersort:settings', JSON.stringify({ sound: true }))
    expect(loadSettings()).toEqual({ sound: true, pourFx: true })
  })
})
