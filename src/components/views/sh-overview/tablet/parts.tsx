'use client'

/**
 * Bagian visual bersama layar tablet & desktop (D4): bintang sorotan, inisial
 * bernada, kontrol rentang dengan jempol bergeser, kotak foto asli, dan
 * wadah panel yang berganti isi dengan crossfade + geser 8px.
 *
 * Gerak: pegas kritis (bounce 0) — tanpa pantul, bisa disela kapan saja karena
 * framer-motion selalu mulai dari nilai yang sedang tampil. Pengguna yang
 * meminta gerak dikurangi hanya mendapat crossfade (MotionConfig "user" di
 * akar juga mematikan animasi transform/layout).
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Transition } from 'framer-motion'
import { Icon, Skeleton, cx } from '@/components/mk'
import { useSignedUrl } from '../evidence'
import { initialOf, toneVars, type OverviewEvidence, type Tone } from '../logic'
import type { OverviewRange } from '../screen-types'

/** Pegas navigasi: kritis, ~0,35 dtk. */
export const SPRING: Transition = { type: 'spring', bounce: 0, duration: 0.35 }
/** Pegas sorotan pilihan (jempol segmen, latar baris aktif): sedikit lebih cepat. */
export const SPRING_SNAP: Transition = { type: 'spring', bounce: 0, duration: 0.3 }
const EASE_OUT: [number, number, number, number] = [0.2, 0.8, 0.2, 1]
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1]

export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
/** Umpan balik tekan instan untuk kartu/baris besar. */
export const PRESS = 'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:ease-[var(--ease-standard)] motion-safe:active:scale-[0.98]'

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2 6.1 20.5l1.3-6.6L2.5 9.4l6.6-.8z'

/** Bintang sorotan (warna waspada). Dengan `label` → gambar bermakna untuk pembaca layar. */
export function Star({ size = 12, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('shrink-0 text-waspada', className)}
    >
      <path d={STAR} />
    </svg>
  )
}

/** Lingkaran inisial bernada; `dot` = titik status di pojok (hijau sudah, kuning belum melapor). */
export function Mono({
  name,
  tone,
  size,
  dot,
  text,
  className,
}: {
  name: string
  tone: Tone | null
  size: number
  dot?: 'ok' | 'warn' | null
  /** Ganti huruf inisial (mis. "∑" untuk "Semua subholding"). */
  text?: string
  className?: string
}) {
  const t = tone ? toneVars(tone) : { fg: 'var(--ink)', bg: 'var(--fill-2)' }
  const font = size >= 48 ? 't-title-3 font-bold' : size >= 30 ? 't-footnote font-bold' : 't-caption font-bold'
  const d = size >= 32 ? 12 : 11
  return (
    <span
      aria-hidden
      className={cx('relative flex shrink-0 items-center justify-center rounded-full', font, className)}
      style={{ width: size, height: size, background: t.bg, color: t.fg }}
    >
      {text ?? initialOf(name)}
      {dot ? (
        <span
          className={cx(
            'absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-[var(--tab-side)]',
            dot === 'ok' ? 'bg-sukses' : 'bg-waspada'
          )}
          style={{ width: d, height: d }}
        />
      ) : null}
    </span>
  )
}

const RANGES: { value: OverviewRange; label: string }[] = [
  { value: 'today', label: 'Hari ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'week', label: '7 hari' },
]

/** Kontrol rentang Hari ini / Kemarin / 7 hari; jempol terpilih bergeser halus (layoutId). */
export function RangeControl({ value, onChange }: { value: OverviewRange; onChange: (r: OverviewRange) => void }) {
  const uid = useId()
  return (
    <div role="group" aria-label="Rentang waktu" className="flex rounded-[var(--radius-sm)] bg-fill-2 p-0.5">
      {RANGES.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative min-h-11 flex-1 cursor-pointer rounded-[8px] px-2 t-footnote font-semibold text-ink',
              'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.96]',
              FOCUS_RING
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-jempol`}
                transition={SPRING_SNAP}
                aria-hidden
                className="absolute inset-0 rounded-[8px] bg-surface shadow-[var(--shadow-control)] dark:bg-[var(--line-strong)]"
              />
            ) : null}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Latar baris aktif yang berpindah halus antarbaris dalam satu daftar. */
export function ActiveBg({ layoutId, className }: { layoutId: string; className?: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={SPRING_SNAP}
      aria-hidden
      className={cx('absolute inset-0 bg-fill-2', className)}
    />
  )
}

/**
 * Kotak foto asli (URL bertanda tangan): kerangka saat dimuat, ikon bila gagal,
 * lencana jumlah bila lebih dari satu foto. Dekoratif — label ada di tombol pembungkus.
 */
export function PhotoBox({
  photo,
  size,
  radius = 12,
  count = 1,
}: {
  photo: OverviewEvidence
  size: number
  radius?: number
  count?: number
}) {
  const { url, failed, loading } = useSignedUrl(photo.id, true, 'thumb')
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const show = Boolean(url) && !failed && !broken
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden bg-fill-1 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {show ? (
        <img
          src={url ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cx(
            'absolute inset-0 h-full w-full object-cover',
            loaded ? 'opacity-100' : 'opacity-0',
            'motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)] motion-safe:ease-[var(--ease-standard)]'
          )}
        />
      ) : null}
      {loading || (show && !loaded) ? <Skeleton h="100%" r={0} className="absolute inset-0" /> : null}
      {!loading && !show ? <Icon name="dokumen" size={size >= 56 ? 22 : 18} /> : null}
      {count > 1 ? (
        <span className="absolute right-1 bottom-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--ink)] px-[5px] t-caption font-bold leading-none tabular-nums text-[var(--surface)]">
          {count}
        </span>
      ) : null}
    </span>
  )
}

/** Kepala bagian: judul besar + keterangan di kanan. */
export function SectionHead({ id, title, aside }: { id: string; title: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 id={id} className="m-0 t-title-3 font-bold tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {aside ? <span className="t-footnote text-ink-2">{aside}</span> : null}
    </div>
  )
}

/**
 * Wadah panel yang berganti isi: tiap isi adalah kotak gulir sendiri yang
 * ditumpuk absolut, jadi isi lama memudar sambil isi baru naik 8px tanpa
 * celah kosong (tidak berkedip) dan posisi gulir isi baru mulai dari atas.
 */
export function FadeSwap({
  k,
  className,
  autoFocus,
  label,
  children,
}: {
  k: string
  className?: string
  /** Fokuskan elemen `[data-pane-focus]` isi baru (perpindahan dipicu dari dalam isi lama). */
  autoFocus?: boolean
  label?: string
  children: ReactNode
}) {
  return (
    <div className={cx('relative min-h-0 min-w-0 overflow-hidden', className)}>
      <AnimatePresence initial={false}>
        <Pane key={k} autoFocus={autoFocus} label={label}>
          {children}
        </Pane>
      </AnimatePresence>
    </div>
  )
}

function Pane({ autoFocus, label, children }: { autoFocus?: boolean; label?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  const present = useIsPresent()
  const ref = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(autoFocus)
  useEffect(() => {
    if (!wantFocus.current) return
    wantFocus.current = false
    ref.current?.querySelector<HTMLElement>('[data-pane-focus]')?.focus({ preventScroll: true })
  }, [])
  return (
    <motion.div
      ref={ref}
      role={label ? 'region' : undefined}
      aria-label={label}
      aria-hidden={present ? undefined : true}
      inert={present ? undefined : true}
      className={cx('scrollbar-thin absolute inset-0 overflow-y-auto overscroll-contain', !present && 'pointer-events-none')}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0, transition: { y: SPRING, opacity: { duration: 0.22, ease: EASE_OUT } } }}
      exit={{ opacity: 0, y: reduce ? 0 : -8, transition: { duration: 0.16, ease: EASE_EXIT } }}
    >
      {children}
    </motion.div>
  )
}
