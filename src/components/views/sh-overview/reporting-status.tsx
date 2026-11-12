'use client'

/**
 * Bagian bersama dua tampilan rentang hari dashboard Ketua Umum & Manajemen:
 * kartu status pelaporan, keterangan urutan, dan pemilih tampilan
 * "Semua terbuka" (report-feed.tsx, opsi 2) / "Ringkas" (hierarchy-view.tsx,
 * opsi 1). Pilihan tampilan disimpan per perangkat (model.saveDayView).
 */

import { useId } from 'react'
import { motion } from 'framer-motion'
import { EmptyNote, Icon, cx } from '@/components/mk'
import { donePct, type ReportingStatus } from './hierarchy'
import type { DayView } from './model'

const FOCUS_IN = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'

const VIEWS: { value: DayView; label: string }[] = [
  { value: 'gulir', label: 'Semua terbuka' },
  { value: 'ringkas', label: 'Ringkas' },
]

export function ReportingStatusCard({ status, className }: { status: ReportingStatus; className?: string }) {
  const id = useId()
  const belum = Math.max(0, status.total - status.done)
  return (
    <section
      aria-labelledby={id}
      className={cx('flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id={id} className="m-0 min-w-0 t-headline font-bold text-ink">
          {status.total ? `${status.done} dari ${status.total} PT sudah melapor` : 'Belum ada PT aktif'}
        </h2>
        <span className="flex-none t-footnote text-ink-2">{status.reports} laporan</span>
      </div>
      {status.total ? (
        <>
          <div
            role="progressbar"
            aria-label="PT yang sudah melapor"
            aria-valuemin={0}
            aria-valuemax={status.total}
            aria-valuenow={status.done}
            className="h-2 overflow-hidden rounded-full bg-fill-2"
          >
            <motion.div
              className="h-full origin-left rounded-full bg-sukses"
              initial={false}
              animate={{ scaleX: donePct(status) / 100 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sukses-soft px-3 t-footnote font-semibold text-sukses">
              <Icon name="selesai" size={14} strokeWidth={2.6} />
              Sudah {status.done}
            </span>
            <span
              className={cx(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 t-footnote font-semibold',
                belum ? 'bg-waspada-soft text-waspada' : 'bg-fill-1 text-ink-2'
              )}
            >
              <Icon name="peringatan" size={14} strokeWidth={2.4} />
              Belum {belum}
            </span>
          </div>
        </>
      ) : null}
    </section>
  )
}

/**
 * Tampilan hanya-disetujui (Ketua Umum & Manajemen) tanpa satu pun laporan
 * disetujui pada tanggal itu: satu baris netral, tanpa status "belum".
 */
export function ApprovedEmpty() {
  return <EmptyNote icon="dokumen">Laporan yang disetujui supervisor tampil di sini.</EmptyNote>
}

/** Keterangan urutan di atas daftar. */
export function SortHint({ className }: { className?: string }) {
  return (
    <p className={cx('m-0 flex items-center gap-1.5 px-1 t-footnote text-ink-2', className)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none">
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
      Diurutkan dari laporan terbaru
    </p>
  )
}

/** Pemilih tampilan: penanda terpilih bergeser dengan pegas kritis. */
export function ViewToggle({ value, onChange }: { value: DayView; onChange: (v: DayView) => void }) {
  const layoutId = useId()
  return (
    <div role="group" aria-label="Tampilan laporan" className="flex flex-none rounded-[var(--radius-sm)] bg-fill-2 p-0.5">
      {VIEWS.map((v) => {
        const on = v.value === value
        return (
          <button
            key={v.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v.value)}
            className={cx('relative min-h-10 cursor-pointer rounded-[8px] px-3 t-footnote font-semibold text-ink', FOCUS_IN)}
          >
            {on ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                className="absolute inset-0 rounded-[8px] bg-surface shadow-[var(--shadow-control)] dark:bg-[var(--line-strong)]"
              />
            ) : null}
            <span className="relative">{v.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Baris di atas daftar: keterangan urutan + pemilih tampilan. */
export function ListBar({ view, onView }: { view: DayView; onView: (v: DayView) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <SortHint />
      <ViewToggle value={view} onChange={onView} />
    </div>
  )
}
