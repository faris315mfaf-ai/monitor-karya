'use client'

/**
 * Dock ala macOS/iPadOS, pengganti sidebar (desktop) atau tab bar (tablet &
 * ponsel) bila dipilih di panel Tampilan.
 *
 * Tiga tata letak, satu komponen:
 * - desktop (≥1024): ikon membesar mengikuti penunjuk (pegas hampir kritis,
 *   dihitung per frame lewat motion value tanpa render ulang React), label
 *   melayang di atas ikon, titik penanda modul aktif, sembunyi otomatis (⌥⌘D).
 * - tablet (600–1023): Dock mengambang ala iPadOS, ikon tetap 48 px + label.
 * - ponsel (<600): kapsul kaca selebar layar, 5 slot + label.
 * Di layar sentuh tidak ada magnifikasi; label selalu terlihat (tanpa hover).
 *
 * Tampil/sembunyi Dock digerakkan CSS lewat data-nav di <html>, sehingga
 * View Transitions (lib/nav-transition.ts) selalu memotret keadaan akhirnya;
 * transisi CSS menjadi cadangan untuk browser tanpa View Transitions.
 */

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  AnimatePresence, MotionConfig, motion, useAnimationControls, useMotionValue, useReducedMotion, useSpring, useTransform,
  type MotionValue,
} from 'framer-motion'
import { Icon, cx, type IconName } from '@/components/mk'

export type DockLayout = 'desktop' | 'tablet' | 'phone'

export type DockItem = {
  id: string
  label: string
  icon: IconName
  active?: boolean
  badge?: number | string
  /** Isi khusus (mis. avatar) sebagai pengganti ikon. */
  render?: React.ReactNode
  onSelect?: () => void
  /** Bungkus tombol (mis. Popover.Trigger asChild). */
  wrap?: (button: React.ReactElement) => React.ReactNode
}

// Pegas magnifikasi: hampir kritis (damping ratio ≈ 0.9) — menempel ke penunjuk tanpa goyang.
const SIZE_SPRING = { stiffness: 520, damping: 40, mass: 0.6 }

export function Dock({
  items,
  utilities = [],
  layout,
  magnify,
  base = 50,
  autohide,
  visible,
  label = 'Dock',
}: {
  items: DockItem[]
  utilities?: DockItem[]
  layout: DockLayout
  /** Magnifikasi hanya untuk penunjuk halus (mouse/trackpad) di desktop. */
  magnify: boolean
  /** Ukuran ikon diam di desktop; diperkecil otomatis bila layar sempit. */
  base?: number
  autohide: boolean
  /** false = mode Sidebar/Tab bar; Dock disimpan di bawah layar. */
  visible: boolean
  label?: string
}) {
  const reduce = useReducedMotion()
  const doMagnify = magnify && !reduce && layout === 'desktop'
  const canAutohide = autohide && layout === 'desktop'
  const mouseX = useMotionValue(Infinity)
  const [revealed, setRevealed] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const hideTimer = useRef<number | null>(null)
  const peak = Math.round(base * 1.56)
  const reach = Math.round(base * 3)

  // Sembunyi otomatis: muncul saat penunjuk menyentuh tepi bawah, turun lagi setelah jeda.
  useEffect(() => {
    if (!canAutohide) return
    function onMove(e: PointerEvent) {
      if (window.innerHeight - e.clientY < 10) {
        if (hideTimer.current) window.clearTimeout(hideTimer.current)
        setRevealed(true)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [canAutohide])

  useEffect(() => {
    if (!canAutohide || hovering || focusWithin || !revealed) return
    hideTimer.current = window.setTimeout(() => setRevealed(false), 700)
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [canAutohide, hovering, focusWithin, revealed])

  const showUp = !canAutohide || revealed || hovering || focusWithin

  // Panah kiri/kanan berpindah antar ikon (roving focus), Home/End ke ujung.
  function onKeyDown(e: React.KeyboardEvent) {
    const buttons = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>('.mk-dock__btn') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % buttons.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + buttons.length) % buttons.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = buttons.length - 1
    if (next >= 0) {
      e.preventDefault()
      buttons[next].focus()
    }
  }

  const all = [...items, ...utilities]
  const hasActive = all.some((x) => x.active)

  return (
    <MotionConfig reducedMotion="user">
      <nav
        ref={navRef}
        aria-label={label}
        aria-hidden={!visible || undefined}
        inert={!visible || undefined}
        className={cx('mk-dock', `mk-dock--${layout}`, showUp && 'is-up', canAutohide && 'is-autohide')}
        style={{ '--dock-base': `${base}px` } as React.CSSProperties}
        onPointerMove={(e) => {
          if (doMagnify && e.pointerType === 'mouse') mouseX.set(e.clientX)
        }}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => {
          mouseX.set(Infinity)
          setHovering(false)
        }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false)
        }}
        onKeyDown={onKeyDown}
      >
        <div className="mk-dock__shelf" aria-hidden />
        <ul className="mk-dock__row">
          {items.map((it, i) => (
            <DockIcon
              key={it.id}
              item={it}
              index={i}
              mouseX={mouseX}
              magnify={doMagnify}
              base={base}
              peak={peak}
              reach={reach}
              layout={layout}
              tabbable={it.active || (i === 0 && !hasActive)}
            />
          ))}
          {utilities.length ? <li className="mk-dock__sep" aria-hidden /> : null}
          {utilities.map((it, i) => (
            <DockIcon
              key={it.id}
              item={it}
              index={items.length + i}
              mouseX={mouseX}
              magnify={doMagnify}
              base={base}
              peak={peak}
              reach={reach}
              layout={layout}
              tabbable={false}
            />
          ))}
        </ul>
      </nav>
    </MotionConfig>
  )
}

function DockIcon({
  item,
  index,
  mouseX,
  magnify,
  base,
  peak,
  reach,
  layout,
  tabbable,
}: {
  item: DockItem
  index: number
  mouseX: MotionValue<number>
  magnify: boolean
  base: number
  peak: number
  reach: number
  layout: DockLayout
  tabbable: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()
  const bounce = useAnimationControls()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)

  // Jarak penunjuk ke pusat ikon → ukuran sasaran → pegas. Seluruhnya di luar React.
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect()
    if (!b || !Number.isFinite(x)) return reach * 2
    return x - (b.left + b.width / 2)
  })
  const target = useTransform(distance, [-reach, 0, reach], [base, peak, base], { clamp: true })
  const size = useSpring(target, SIZE_SPRING)
  const glyph = useTransform(size, (s) => Math.round(s * 0.46))
  const radius = useTransform(size, (s) => s * 0.26)

  function select() {
    if (!reduce) {
      // Pantulan "membuka": naik lalu jatuh dua kali, makin kecil.
      const h = layout === 'desktop' ? 18 : 8
      void bounce.start({ y: [0, -h, 0, -h / 3, 0], transition: { duration: layout === 'desktop' ? 0.62 : 0.42, times: [0, 0.28, 0.58, 0.78, 1], ease: 'easeOut' } })
    }
    item.onSelect?.()
  }

  const vt = { '--vt': `nav-${item.id}` } as Record<string, string>

  const button = (
    <motion.button
      ref={ref}
      type="button"
      className={cx('mk-dock__btn', item.active && 'is-on', item.render ? 'is-custom' : undefined)}
      aria-label={item.badge ? `${item.label}, ${item.badge} baru` : item.label}
      aria-current={item.active ? 'page' : undefined}
      tabIndex={tabbable ? 0 : -1}
      style={magnify ? { width: size, height: size, borderRadius: radius, ...vt } : vt}
      animate={bounce}
      onClick={select}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      whileTap={reduce ? undefined : { scale: 0.9 }}
    >
      {item.render ?? (
        <motion.span className="mk-dock__glyph" style={magnify ? { width: glyph, height: glyph } : undefined}>
          <Icon name={item.icon} size={24} strokeWidth={item.active ? 2.1 : 1.8} style={{ width: '100%', height: '100%' }} />
        </motion.span>
      )}
      {item.badge ? <span className="mk-dock__badge">{item.badge}</span> : null}
    </motion.button>
  )

  return (
    <li className="mk-dock__item" style={{ '--i': index } as React.CSSProperties}>
      {layout === 'desktop' ? (
        <AnimatePresence>
          {hover || focused ? (
            <motion.span
              className="mk-dock__label"
              aria-hidden
              initial={{ opacity: 0, y: 6, scale: 0.96, x: '-50%' }}
              animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
              exit={{ opacity: 0, y: 4, scale: 0.98, x: '-50%', transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 600, damping: 38 }}
            >
              {item.label}
            </motion.span>
          ) : null}
        </AnimatePresence>
      ) : null}
      {item.wrap ? item.wrap(button) : button}
      {layout === 'desktop' ? (
        <span className={cx('mk-dock__dot', item.active && 'is-on')} aria-hidden />
      ) : (
        <span className={cx('mk-dock__caption', item.active && 'is-on')} aria-hidden>
          {item.label}
        </span>
      )}
    </li>
  )
}
