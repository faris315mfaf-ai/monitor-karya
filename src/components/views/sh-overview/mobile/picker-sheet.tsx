'use client'

/**
 * Lembar pemilih subholding/PT (papan F-Ponsel-PilihSub/PilihPT). Muncul dari
 * bawah, kolom cari, bagian Melapor/Belum melapor, centang pada pilihan aktif.
 *
 * Gerak: lembar mengikuti jari 1:1 saat kepala diseret ke bawah (ke atas ada
 * hambatan karet). Saat dilepas, titik proyeksi momentum menentukan tutup atau
 * kembali; kecepatan jari diteruskan ke pegas kritis (tanpa pantul), jadi tidak
 * ada sambungan antara seret dan animasi. Animasi selalu bisa direbut lagi.
 * Gerak dikurangi → pudar, tanpa geser.
 */

import { useEffect, useId, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion'
import { Icon, cx } from '@/components/mk'
import { toneVars } from '../logic'
import { FADE, NAV_SPRING, shouldDismiss, type PickSection } from './mobile-logic'
import type { Filter } from '../model'

const FOCUS = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'

export function PickerSheet({
  title,
  searchLabel,
  sections,
  query,
  onQuery,
  onPick,
  onClosed,
}: {
  title: string
  searchLabel: string
  sections: PickSection[]
  query: string
  onQuery: (q: string) => void
  onPick: (f: Filter) => void
  /** Dipanggil setelah animasi tutup selesai — pemanggil melepas lembar. */
  onClosed: () => void
}) {
  const reduce = useReducedMotion()
  const [start] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight))
  const y = useMotionValue(reduce ? 0 : start)
  const fade = useMotionValue(reduce ? 0 : 1)
  const height = useRef(start)
  const panel = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const closing = useRef(false)
  const controls = useDragControls()
  const searchId = useId()
  const scrim = useTransform(() => Math.min(Math.max(1 - y.get() / (height.current || 1), 0), 1) * fade.get())

  useEffect(() => {
    if (panel.current) height.current = panel.current.offsetHeight
    const c = reduce ? animate(fade, 1, FADE) : animate(y, 0, NAV_SPRING)
    return () => c.stop()
  }, [])

  function measure() {
    if (panel.current) height.current = panel.current.offsetHeight
    return height.current
  }

  function close(velocity = 0) {
    closing.current = true
    const done = () => {
      if (closing.current) onClosed()
    }
    if (reduce) animate(fade, 0, { ...FADE, onComplete: done })
    else animate(y, measure() + 24, { ...NAV_SPRING, velocity, onComplete: done })
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const v = info.velocity.y
    if (shouldDismiss(y.get(), v, measure())) close(v)
    else animate(y, 0, reduce ? FADE : { ...NAV_SPRING, velocity: v })
  }

  function pick(f: Filter) {
    onPick(f)
    close()
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div className="fixed inset-0 z-[var(--z-scrim)] bg-scrim" style={{ opacity: scrim }} />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          asChild
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            titleRef.current?.focus({ preventScroll: true })
          }}
        >
          <motion.div
            ref={panel}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragStart={() => {
              closing.current = false
            }}
            onDragEnd={onDragEnd}
            style={{ y, opacity: fade }}
            className="fixed inset-x-0 bottom-0 z-[var(--z-scrim)] flex max-h-[82dvh] flex-col rounded-t-[var(--radius-lg)] bg-bg shadow-[var(--shadow-sheet)] outline-none"
          >
            {/* Perpanjangan latar di bawah lembar: saat ditarik ke atas tidak ada celah. */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-[40dvh] bg-bg" />
            <div className="flex-none cursor-grab touch-none select-none" onPointerDown={(e) => controls.start(e)}>
              <span aria-hidden className="mx-auto mb-1 mt-2 block h-[5px] w-[38px] rounded-full bg-ink-3" />
              <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => close()}
                  className={cx('t-body-lg min-h-11 min-w-[52px] rounded-[var(--radius-sm)] px-1 text-left text-accent', FOCUS)}
                >
                  Batal
                </button>
                <DialogPrimitive.Title asChild>
                  <h2 ref={titleRef} tabIndex={-1} className="t-headline min-w-0 truncate text-center font-bold text-ink outline-none">
                    {title}
                  </h2>
                </DialogPrimitive.Title>
                <span aria-hidden className="w-[52px] flex-none" />
              </div>
            </div>
            <div className="flex-none px-4 pb-2.5">
              <label
                htmlFor={searchId}
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-fill-1 px-3 focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-[var(--focus)]"
              >
                <Icon name="cari" size={16} strokeWidth={2.4} className="text-ink-2" />
                <input
                  id={searchId}
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  aria-label={searchLabel}
                  placeholder={searchLabel}
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  className="t-body-lg min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-3"
                />
              </label>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 pb-[calc(34px+env(safe-area-inset-bottom))]">
              {sections.map((sec) => (
                <SheetSection key={sec.key} section={sec} onPick={pick} />
              ))}
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function SheetSection({ section, onPick }: { section: PickSection; onPick: (f: Filter) => void }) {
  const headId = useId()
  return (
    <div role="group" aria-labelledby={headId} className="flex flex-col gap-1.5">
      <span id={headId} className={cx('t-caption px-1 font-semibold', section.warn ? 'text-waspada' : 'text-ink-2')}>
        {section.title}
      </span>
      <div className="overflow-hidden rounded-[var(--radius-md)] bg-surface">
        {section.items.length === 0 ? (
          <p className="t-callout m-0 p-3.5 font-normal text-ink-2">Tidak ada yang cocok.</p>
        ) : (
          section.items.map((it, i) => {
            const tone = it.mono ? toneVars(it.mono.tone) : null
            return (
              <button
                key={it.key}
                type="button"
                aria-current={it.selected ? 'true' : undefined}
                onClick={() => onPick(it.filter)}
                className={cx(
                  'flex min-h-[50px] w-full items-center gap-3 px-3.5 py-1.5 text-left active:bg-fill-1',
                  i > 0 && 'shadow-[inset_0_1px_0_var(--line)]',
                  FOCUS,
                )}
              >
                {it.mono && tone ? (
                  <span
                    aria-hidden
                    className="t-caption flex h-7 w-7 flex-none items-center justify-center rounded-full font-bold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {it.mono.letter}
                  </span>
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="t-body truncate font-medium text-ink">{it.name}</span>
                  <span className={cx('t-caption font-normal', it.warn ? 'text-waspada' : 'text-ink-2')}>{it.detail}</span>
                </span>
                {it.selected ? <Icon name="selesai" size={18} strokeWidth={2.8} label="Dipilih" className="flex-none text-accent" /> : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
