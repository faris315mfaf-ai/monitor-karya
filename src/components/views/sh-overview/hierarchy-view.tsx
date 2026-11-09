'use client'

/**
 * Tampilan "Ringkas" (opsi 1) dashboard Ketua Umum & Manajemen (logika:
 * hierarchy.ts): akordeon subholding → PT → laporan, terbaru di atas. Dipakai
 * layar ponsel (MobileOverview) dan tablet (TabletDaySplit). PT yang belum
 * melapor tampil di bawah subholdingnya.
 *
 * Akordeon: kepala adalah tombol ber-aria-expanded yang mengendalikan
 * wilayah isi (selalu ada, `hidden` saat tertutup). Isi yang dibuka memudar
 * masuk; gerak dikurangi mengikuti MotionConfig layar.
 */

import { useId } from 'react'
import { motion } from 'framer-motion'
import { EmptyNote, Icon, cx } from '@/components/mk'
import { shPdfHref } from '@/lib/subholding/pdf-href'
import { approvedAt, ptMeta, subMeta, toggleSub, togglePt, type HierPt, type HierSub } from './hierarchy'
import { displayName, subholdingLabel, toneOf } from './logic'
import { lastReportLabel, type CoverageSilent, type Filter, type FlatV2 } from './model'
import { Mono, Star } from './tablet/parts'

const FOCUS_IN = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'
/** Umpan balik tekan langsung saat jari menyentuh, tanpa menunggu lepas. */
const ROW = 'w-full cursor-pointer text-left motion-safe:transition-colors motion-safe:duration-[var(--dur-fast)] hover:bg-fill-1 active:bg-fill-1'
const SEP = 'shadow-[inset_0_1px_0_var(--line)]'
const REVEAL = { type: 'spring', bounce: 0, duration: 0.3 } as const

/* ---------- Akordeon ---------- */

export function HierarchyTree({
  subs,
  open,
  onOpen,
  onReport,
  dateKey,
  selectedId,
}: {
  subs: HierSub[]
  /** Subholding/PT yang terbuka (hierarchy.openState). */
  open: Filter
  onOpen: (next: Filter) => void
  onReport: (r: FlatV2) => void
  /** 'YYYY-MM-DD' data, untuk PDF semua laporan satu PT. */
  dateKey: string
  /** Laporan yang tampil di panel rincian (tablet) → disorot di daftar. */
  selectedId?: string | null
}) {
  const uid = useId()
  if (!subs.length) return <EmptyNote icon="gedung">Belum ada subholding dalam cakupan Anda.</EmptyNote>
  return (
    <ul aria-label="Subholding" className="m-0 flex list-none flex-col gap-2.5 p-0">
      {subs.map((s, i) => {
        const expanded = open.sub === s.id
        const region = `${uid}-s${i}`
        return (
          <li key={s.id} className="overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={region}
              onClick={() => onOpen(toggleSub(s, open))}
              className={cx('flex min-h-[72px] items-center gap-3 px-3.5 py-3', ROW, FOCUS_IN)}
            >
              <Mono name={subholdingLabel(s.name)} tone={toneOf(s.id)} size={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words t-body-strong font-bold text-ink">{displayName(s.name)}</span>
                <span className={cx('t-footnote', s.pts.length ? 'text-ink-2' : 'text-waspada')}>{subMeta(s)}</span>
              </span>
              {s.count ? (
                <span className="flex flex-none flex-col items-end gap-0.5 text-right">
                  <span className="t-callout font-bold text-ink">{s.count} laporan</span>
                  {approvedAt(s.lastAt, dateKey) ? (
                    <span className="t-caption text-ink-2">terakhir {approvedAt(s.lastAt, dateKey)}</span>
                  ) : null}
                </span>
              ) : null}
              <Chevron open={expanded} />
            </button>
            <div id={region} hidden={!expanded}>
              {expanded ? (
                <motion.ul
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={REVEAL}
                  className="m-0 list-none p-0"
                >
                  {s.pts.map((p, j) => (
                    <PtItem
                      key={p.id}
                      p={p}
                      subId={s.id}
                      region={`${region}-p${j}`}
                      open={open}
                      onOpen={onOpen}
                      onReport={onReport}
                      dateKey={dateKey}
                      selectedId={selectedId}
                    />
                  ))}
                  {s.silent.map((p) => (
                    <SilentItem key={p.id} p={p} />
                  ))}
                </motion.ul>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PtItem({
  p,
  subId,
  region,
  open,
  onOpen,
  onReport,
  dateKey,
  selectedId,
}: {
  p: HierPt
  subId: string
  region: string
  open: Filter
  onOpen: (next: Filter) => void
  onReport: (r: FlatV2) => void
  dateKey: string
  selectedId?: string | null
}) {
  const expanded = open.sub === subId && open.pt === p.id
  const name = displayName(p.name)
  return (
    <li className={SEP}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={region}
        onClick={() => onOpen(togglePt(subId, p.id, open))}
        className={cx('flex min-h-[76px] items-center gap-2.5 py-3 pr-3.5 pl-5', ROW, FOCUS_IN)}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 t-callout font-semibold text-ink">
            <span className="truncate">{name}</span>
            {p.highlights ? <Star size={12} label={`${p.highlights} sorotan`} /> : null}
          </span>
          <span className="truncate t-footnote text-ink">{p.reports[0]?.kegiatan}</span>
          <span className="t-caption text-ink-2">{ptMeta(p, dateKey)}</span>
        </span>
        <Chevron open={expanded} size={16} />
      </button>
      <div id={region} hidden={!expanded}>
        {expanded ? (
          <motion.ul
            aria-label={`Laporan ${name}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={REVEAL}
            className="m-0 list-none bg-surface-2 p-0"
          >
            {p.reports.map((r) => (
              <ReportItem key={r.id} r={r} dateKey={dateKey} current={r.id === selectedId} onReport={onReport} />
            ))}
            {p.reports.length > 1 ? (
              <li className={SEP}>
                <a
                  href={shPdfHref({ pt: p.id, date: dateKey })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cx(
                    'flex min-h-11 items-center gap-2 py-2 pr-3.5 pl-8 t-footnote font-semibold text-accent no-underline',
                    'hover:bg-fill-1 active:bg-fill-1',
                    FOCUS_IN
                  )}
                >
                  <Icon name="dokumen" size={16} strokeWidth={2} className="flex-none" />
                  <span className="min-w-0">PDF semua laporan {name}</span>
                  <span className="sr-only"> (tab baru)</span>
                </a>
              </li>
            ) : null}
          </motion.ul>
        ) : null}
      </div>
    </li>
  )
}

function ReportItem({
  r,
  dateKey,
  current,
  onReport,
}: {
  r: FlatV2
  dateKey: string
  current: boolean
  onReport: (r: FlatV2) => void
}) {
  const jam = approvedAt(r.decidedAt, dateKey)
  return (
    <li className={SEP}>
      <button
        type="button"
        aria-current={current || undefined}
        onClick={() => onReport(r)}
        className={cx(
          'flex min-h-[72px] items-center gap-2.5 py-3 pr-3.5 pl-8',
          ROW,
          current && 'bg-accent-soft hover:bg-accent-soft active:bg-accent-soft',
          FOCUS_IN
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="t-caption font-semibold text-ink-2">{jam ? `${jam} WIB` : 'Disetujui'}</span>
          <span className="line-clamp-2 t-callout font-semibold break-words text-ink">{r.kegiatan}</span>
        </span>
        {r.highlight ? <Star size={14} label="Sorotan" /> : null}
        <Icon name="kanan" size={14} strokeWidth={2.2} className={cx('flex-none', current ? 'text-accent' : 'text-ink-3')} />
      </button>
    </li>
  )
}

function SilentItem({ p }: { p: CoverageSilent }) {
  return (
    <li className={cx('flex min-h-14 items-center gap-2.5 py-2.5 pr-3.5 pl-5', SEP)}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate t-callout text-ink-2">{displayName(p.name)}</span>
        <span className="t-caption text-ink-2">{lastReportLabel(p.lastReportDate)}</span>
      </span>
      <span className="inline-flex flex-none items-center gap-1 rounded-full bg-waspada-soft px-2.5 py-1 t-caption font-semibold text-waspada">
        <Icon name="peringatan" size={12} strokeWidth={2.4} />
        Belum melapor
      </span>
    </li>
  )
}

function Chevron({ open, size = 18 }: { open: boolean; size?: number }) {
  return (
    <Icon
      name="bawah"
      size={size}
      strokeWidth={2.4}
      className={cx(
        'flex-none text-ink-2 motion-safe:transition-transform motion-safe:duration-[var(--dur-base)] motion-safe:ease-[var(--ease-standard)]',
        open && 'rotate-180'
      )}
    />
  )
}
