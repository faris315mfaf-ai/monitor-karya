'use client'

/**
 * Bagian antrean bersama ponsel & tablet: kontrol status dengan jempol yang
 * bergeser (layoutId, pegas kritis) dan isi satu baris antrean (gambar kecil,
 * judul dua baris, umur, asal, satu penanda).
 */

import { useId } from 'react'
import { motion } from 'framer-motion'
import { cx } from '@/components/mk'
import { QueueThumb } from './body'
import { Star } from './decision'
import { FLAG_LABEL, LONG_WAIT_DAYS, STATUS_TABS, ageLabel, queueFlag, waitDays, type ShReport, type ShStatus } from './logic'

export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
export const SNAP = { type: 'spring', bounce: 0, duration: 0.3 } as const

export function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: ShStatus
  counts: Record<ShStatus, number>
  onChange: (s: ShStatus) => void
}) {
  const uid = useId()
  return (
    <div role="group" aria-label="Saring status" className="flex rounded-[var(--radius-sm)] bg-fill-2 p-0.5">
      {STATUS_TABS.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.value)}
            className={cx(
              'relative min-h-9 flex-1 cursor-pointer rounded-[8px] px-1.5 t-footnote font-semibold',
              on ? 'text-ink' : 'text-ink-2',
              'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.96]',
              FOCUS_RING
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-jempol`}
                transition={SNAP}
                aria-hidden
                className="absolute inset-0 rounded-[8px] bg-surface shadow-[var(--shadow-control)] dark:bg-[var(--line-strong)]"
              />
            ) : null}
            <span className="relative whitespace-nowrap">
              {t.label}
              <span className="ml-1 font-medium tabular-nums opacity-65">{counts[t.value] ?? 0}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Isi satu baris antrean (dibungkus tombol oleh pemanggil). */
export function QueueRowContent({
  r,
  subLabel,
  thumb = 48,
  now,
  trailing,
}: {
  r: ShReport
  /** Nama pendek subholding di meta (saringan "Semua"); null = sembunyikan. */
  subLabel: string | null
  thumb?: number
  now: Date
  trailing?: React.ReactNode
}) {
  const days = waitDays(r.submittedAt, now)
  const waiting = r.status === 'MENUNGGU'
  const long = waiting && days >= LONG_WAIT_DAYS
  const flag = queueFlag(r)
  const pt = r.ptName.replace(/^PT\.?\s+/i, '')
  const meta = [subLabel, pt, r.reporterName].filter(Boolean).join(' · ')
  return (
    <>
      <QueueThumb r={r} size={thumb} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-baseline gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 t-body-strong leading-[1.3] text-ink">{r.kegiatan}</span>
          {waiting && !trailing ? (
            <span className={cx('shrink-0 t-caption tabular-nums', long ? 'font-bold text-waspada' : 'text-ink-2')}>{ageLabel(days)}</span>
          ) : null}
        </span>
        <span className="truncate t-caption font-normal text-ink-2">{meta}</span>
        {flag ? (
          <span
            className={cx(
              'inline-flex min-h-5 items-center gap-1 self-start rounded-full px-2 t-caption font-bold',
              flag === 'no-evidence' && 'bg-waspada-soft text-waspada',
              flag === 'resent' && 'bg-info-soft text-info',
              flag === 'highlight' && 'bg-waspada-soft text-waspada'
            )}
          >
            {flag === 'highlight' ? <Star size={10} /> : null}
            {FLAG_LABEL[flag]}
          </span>
        ) : null}
      </span>
      {trailing}
    </>
  )
}
