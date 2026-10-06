'use client'

/**
 * Perpindahan navigasi Sidebar/Tab bar ↔ Dock.
 *
 * Jalur utama memakai View Transitions API: browser memotret keadaan lama dan
 * baru, lalu menganimasikan selisihnya di GPU — tanpa reflow per frame. Ikon
 * yang sama di kedua keadaan diberi nama `nav-<id>` sehingga terbang dari
 * posisinya di sidebar/tab bar ke petak Dock (dan sebaliknya), bertahap satu
 * per satu. Panel sidebar keluar searah datangnya, rak Dock naik dari bawah,
 * konten bergeser ke posisi barunya. Kurva & durasi ada di mk-modules.css.
 *
 * Tanpa dukungan View Transitions, data-nav berganti dan transisi CSS biasa
 * (berkurva pegas) yang mengerjakannya.
 */

import { flushSync } from 'react-dom'
import { setPrefs, type NavMode } from '@/lib/tampilan'

type ViewTransition = { finished: Promise<void>; ready: Promise<void>; skipTransition: () => void }
type DocWithVT = Document & { startViewTransition?: (cb: () => void | Promise<void>) => ViewTransition }

const STAGGER_MS = 16
let running: ViewTransition | null = null
let transitioning = false

/** Benar selama perpindahan berjalan; komponen memakainya untuk melewati animasi masuk sendiri. */
export function isNavTransitioning() {
  return transitioning
}

/**
 * @param next  mode tujuan
 * @param order urutan id ikon (atas→bawah / kiri→kanan) untuk jeda bertahap
 */
export function switchNav(next: NavMode, order: string[] = []) {
  const doc = document as DocWithVT
  const root = document.documentElement
  if (root.dataset.nav === next) return

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition) {
    setPrefs({ nav: next })
    return
  }

  // Jeda bertahap per ikon: yang paling atas/kiri berangkat lebih dulu.
  const style = document.createElement('style')
  style.id = 'mk-vt-stagger'
  style.textContent = reduce
    ? ''
    : order
        .map((id, i) => {
          const d = `${Math.min(i, 14) * STAGGER_MS}ms`
          return `::view-transition-group(nav-${id}),::view-transition-old(nav-${id}),::view-transition-new(nav-${id}){animation-delay:${d}}`
        })
        .join('')
  document.getElementById('mk-vt-stagger')?.remove()
  document.head.appendChild(style)

  running?.skipTransition()
  root.classList.remove('mk-vt--to-dock', 'mk-vt--to-bar', 'mk-vt--reduce')
  root.classList.add('mk-vt', next === 'dock' ? 'mk-vt--to-dock' : 'mk-vt--to-bar')
  if (reduce) root.classList.add('mk-vt--reduce')
  transitioning = true

  const t = doc.startViewTransition(() => {
    flushSync(() => setPrefs({ nav: next }))
  })
  running = t
  t.finished.finally(() => {
    if (running !== t) return
    running = null
    transitioning = false
    root.classList.remove('mk-vt', 'mk-vt--to-dock', 'mk-vt--to-bar', 'mk-vt--reduce')
    style.remove()
  })
}
