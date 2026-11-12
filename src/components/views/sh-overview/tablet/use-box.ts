'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { fillHeight } from './logic'

export type Box = {
  w: number
  h: number
  /**
   * Untuk tata letak selebar layar: geser kiri (px, ≤ 0) dan lebar area konten
   * shell (`main`, tanpa padding & batas lebar isi). Diukur dari induk, jadi
   * memakainya sebagai margin/lebar tidak mengubah ukurannya sendiri.
   */
  edge: { left: number; width: number } | null
  /** Padding bawah konten shell (ruang dock/tab bar bawah), px. */
  pad: number
}

/** Ukur lebar kontainer + tinggi tersisa di bawahnya (dikurangi padding bawah konten shell). */
export function useBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Box | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const main = el.closest('main')
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      const w = Math.round(el.getBoundingClientRect().width)
      const h = fillHeight(window.innerHeight, top, pad)
      const mr = main?.getBoundingClientRect()
      const pr = el.parentElement?.getBoundingClientRect()
      const edge = mr && pr ? { left: Math.round(mr.left - pr.left), width: Math.round(mr.width) } : null
      setBox((b) =>
        b && b.w === w && b.h === h && b.pad === pad && b.edge?.left === edge?.left && b.edge?.width === edge?.width
          ? b
          : { w, h, edge, pad }
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // border-box: padding bawah shell berubah (dock disembunyikan otomatis, transisi) ikut terukur.
    if (main) ro.observe(main, { box: 'border-box' })
    main?.addEventListener('transitionend', measure)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      main?.removeEventListener('transitionend', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])
  return { ref, box }
}
