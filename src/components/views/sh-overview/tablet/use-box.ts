'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { fillHeight } from './logic'

/** Warna panel: campuran token permukaan & latar (sisi lebih terang dari tengah di tema terang). */
export const PANE_VARS = {
  '--tab-side': 'color-mix(in srgb, var(--surface) 60%, var(--bg))',
  '--tab-mid': 'color-mix(in srgb, var(--surface) 30%, var(--bg))',
} as CSSProperties

/** Ukur lebar kontainer + tinggi tersisa di bawahnya (dikurangi padding bawah konten shell). */
export function useBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const main = el.closest('main')
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      const w = Math.round(el.getBoundingClientRect().width)
      const h = fillHeight(window.innerHeight, top, pad)
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (main) ro.observe(main)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return { ref, box }
}
