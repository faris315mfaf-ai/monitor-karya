'use client'

/**
 * Preferensi tampilan per perangkat (14 · Implementasi): aksen, mode navigasi
 * desktop (sidebar atau Dock), dan Dock tersembunyi otomatis. Disimpan di
 * localStorage `mk-tampilan` dan dipasang ke <html> sebagai data-accent,
 * data-nav, data-dock-autohide — skrip di <head> memasangnya sebelum render
 * pertama supaya tidak berkedip.
 */

import { useSyncExternalStore } from 'react'

export type Accent = 'merah' | 'biru' | 'hijau' | 'ungu' | 'oranye' | 'grafit'
export type NavMode = 'sidebar' | 'dock'
export type Prefs = { accent: Accent; nav: NavMode; dockAutohide: boolean }

export const PREFS_KEY = 'mk-tampilan'
const ACCENTS: Accent[] = ['merah', 'biru', 'hijau', 'ungu', 'oranye', 'grafit']
export const DEFAULT_PREFS: Prefs = { accent: 'merah', nav: 'sidebar', dockAutohide: false }

function parse(raw: string | null): Prefs {
  try {
    const p = JSON.parse(raw || '{}') as Partial<Prefs>
    return {
      accent: ACCENTS.includes(p.accent as Accent) ? (p.accent as Accent) : 'merah',
      nav: p.nav === 'dock' ? 'dock' : 'sidebar',
      dockAutohide: p.dockAutohide === true,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

let cachedRaw: string | null | undefined
let cached: Prefs = DEFAULT_PREFS
const listeners = new Set<() => void>()

function snapshot(): Prefs {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PREFS_KEY)
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parse(raw)
  }
  return cached
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

export function applyPrefs(p: Prefs) {
  const el = document.documentElement
  el.dataset.accent = p.accent
  el.dataset.nav = p.nav
  el.dataset.dockAutohide = String(p.dockAutohide)
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...snapshot(), ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {}
  applyPrefs(next)
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS)
}

