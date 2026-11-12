'use client'

/**
 * Kontrol tanggal dashboard laporan subholding (12 Nov 2026): "Hari ini" dan
 * pemilih tanggal (paling akhir hari ini). Menggantikan segmen Hari ini /
 * Kemarin / 7 hari. Dipakai layar ponsel dan tablet/desktop.
 *
 * Pemilih tanggal = <input type="date"> asli yang menutupi sel (tak terlihat)
 * supaya ponsel membuka pemilih bawaannya; di desktop klik memanggil
 * showPicker() karena klik pada teks masukan tanggal tidak membuka kalender.
 */

import { useId } from 'react'
import { motion } from 'framer-motion'
import { Icon, cx } from '@/components/mk'
import { isDateKey } from '@/lib/subholding/pdf-bundle'
import { pickedDateLabel } from './logic'

const CELL = 'relative flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] px-3 t-footnote font-semibold text-ink'

function Thumb({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
      aria-hidden
      className="absolute inset-0 rounded-[8px] bg-surface shadow-[var(--shadow-control)] dark:bg-[var(--line-strong)]"
    />
  )
}

export function DateControl({
  dateKey,
  todayKey,
  onDate,
  className,
}: {
  /** Tanggal yang sedang ditampilkan, 'YYYY-MM-DD' WIB. */
  dateKey: string
  todayKey: string
  onDate: (key: string) => void
  className?: string
}) {
  const uid = useId()
  const today = dateKey === todayKey
  const thumb = `${uid}-jempol`
  return (
    <div role="group" aria-label="Tanggal laporan" className={cx('flex gap-0.5 rounded-[var(--radius-sm)] bg-fill-2 p-0.5', className)}>
      <button
        type="button"
        aria-pressed={today}
        onClick={() => onDate(todayKey)}
        className={cx(
          CELL,
          'flex-1 cursor-pointer',
          'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.96]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
        )}
      >
        {today ? <Thumb layoutId={thumb} /> : null}
        <span className="relative">Hari ini</span>
      </button>
      <label
        className={cx(
          CELL,
          'flex-[1.4] cursor-pointer',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]'
        )}
      >
        {today ? null : <Thumb layoutId={thumb} />}
        <Icon name="kalender" size={15} strokeWidth={2.2} className="relative flex-none text-ink-2" />
        <span className="relative truncate">{today ? 'Pilih tanggal' : pickedDateLabel(dateKey, todayKey)}</span>
        <input
          type="date"
          aria-label="Pilih tanggal laporan"
          value={dateKey}
          max={todayKey}
          onChange={(e) => {
            const v = e.target.value
            // Masukan dikosongkan atau tanggal di depan hari ini diabaikan.
            if (isDateKey(v) && v <= todayKey) onDate(v)
          }}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.()
            } catch {
              // Peramban menolak (mis. bingkai lintas-asal): masukan tanggal tetap bisa diketik.
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}
