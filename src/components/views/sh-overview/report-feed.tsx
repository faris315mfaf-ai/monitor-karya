'use client'

/**
 * Dashboard Ketua Umum & Manajemen, opsi 2 "tinggal gulir" (logika:
 * hierarchy.ts): kartu status pelaporan, chip lompat ke subholding, lalu
 * semua laporan terbuka — subholding → PT → kartu laporan, terbaru di atas.
 * PT yang belum melapor tampil di akhir tiap subholding.
 *
 * `layout="phone"`: satu kolom, kartu dikelompokkan per PT. `layout="wide"`
 * (tablet & desktop): kartu dalam kisi, nama PT di tiap kartu, PT belum
 * melapor sebagai deret chip.
 *
 * Kartu: tombol isi (jam, sorotan, judul, uraian, catatan supervisor) membuka
 * rincian; foto membuka lightbox; tautan PDF laporan di kaki kartu.
 */

import { useId } from 'react'
import { motion } from 'framer-motion'
import { EmptyNote, Icon, cx } from '@/components/mk'
import { shPdfHref } from '@/lib/subholding/pdf-href'
import { EvidenceThumb } from './evidence'
import { approvedAt, donePct, ptMeta, sectionMeta, type HierPt, type HierSub, type ReportingStatus } from './hierarchy'
import { displayName, photosOf, subholdingLabel, toneOf, toneVars } from './logic'
import { lastReportLabel, type CoverageSilent, type FlatV2 } from './model'
import { Mono, Star } from './tablet/parts'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const CARD = 'rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]'
/** Batas foto kecil di kartu; sisanya diringkas jadi "+n". */
const MAX_THUMBS = 4

export type FeedLayout = 'phone' | 'wide'

/* ---------- Kartu status ---------- */

export function ReportingStatusCard({ status, className }: { status: ReportingStatus; className?: string }) {
  const id = useId()
  const belum = Math.max(0, status.total - status.done)
  return (
    <section aria-labelledby={id} className={cx('flex flex-col gap-3 p-4', CARD, className)}>
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

/* ---------- Daftar ---------- */

export function ReportFeed({
  subs,
  dateKey,
  layout,
  onOpen,
  onPhoto,
}: {
  subs: HierSub[]
  /** 'YYYY-MM-DD' data: jam disetujui di hari lain diberi tanggal. */
  dateKey: string
  layout: FeedLayout
  onOpen: (r: FlatV2) => void
  onPhoto: (r: FlatV2, index: number) => void
}) {
  const uid = useId()
  if (!subs.length) return <EmptyNote icon="gedung">Belum ada subholding dalam cakupan Anda.</EmptyNote>
  const sectionId = (i: number) => `${uid}-sub-${i}`
  return (
    <div className="flex flex-col gap-4">
      <SubJump subs={subs} targetOf={sectionId} wide={layout === 'wide'} />
      <SortHint />
      <div className="flex flex-col gap-8">
        {subs.map((s, i) => (
          <SubSection key={s.id} id={sectionId(i)} s={s} dateKey={dateKey} layout={layout} onOpen={onOpen} onPhoto={onPhoto} />
        ))}
      </div>
    </div>
  )
}

/** Chip lompat ke subholding: daftar panjang tidak perlu digulir manual. */
function SubJump({ subs, targetOf, wide }: { subs: HierSub[]; targetOf: (i: number) => string; wide: boolean }) {
  const jump = (i: number) => {
    const el = document.getElementById(targetOf(i))
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }
  return (
    <nav
      aria-label="Lompat ke subholding"
      className={cx('flex gap-2 overflow-x-auto [scrollbar-width:none]', wide ? 'flex-wrap' : '-mx-4 px-4')}
    >
      {subs.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => jump(i)}
          className={cx(
            'inline-flex min-h-11 flex-none items-center gap-2 rounded-full bg-surface py-1 pr-3.5 pl-1.5 t-footnote font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]',
            'motion-safe:transition-colors motion-safe:duration-[var(--dur-fast)] hover:bg-fill-1 active:bg-fill-1',
            FOCUS
          )}
        >
          <Mono name={subholdingLabel(s.name)} tone={toneOf(s.id)} size={28} />
          {subholdingLabel(s.name)}
          <span className="font-medium text-ink-2">{s.count}</span>
        </button>
      ))}
    </nav>
  )
}

function SubSection({
  id,
  s,
  dateKey,
  layout,
  onOpen,
  onPhoto,
}: {
  id: string
  s: HierSub
  dateKey: string
  layout: FeedLayout
  onOpen: (r: FlatV2) => void
  onPhoto: (r: FlatV2, index: number) => void
}) {
  const head = `${id}-h`
  const wide = layout === 'wide'
  return (
    <section id={id} aria-labelledby={head} className="flex scroll-mt-24 flex-col gap-3">
      <header className="flex items-center gap-3">
        <Mono name={subholdingLabel(s.name)} tone={toneOf(s.id)} size={44} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={head} tabIndex={-1} className="m-0 break-words t-title-3 font-bold tracking-[-0.015em] text-ink outline-none">
            {displayName(s.name)}
          </h2>
          <span className={cx('t-footnote', s.pts.length ? 'text-ink-2' : 'text-waspada')}>{sectionMeta(s, dateKey)}</span>
        </div>
      </header>

      {wide ? (
        s.pts.length ? (
          <ul aria-label={`Laporan ${displayName(s.name)}`} className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3.5 p-0">
            {s.pts.flatMap((p) =>
              p.reports.map((r) => (
                <li key={r.id} className="flex">
                  <ReportCard r={r} dateKey={dateKey} showPt onOpen={onOpen} onPhoto={onPhoto} />
                </li>
              ))
            )}
          </ul>
        ) : null
      ) : (
        s.pts.map((p) => <PtGroup key={p.id} p={p} dateKey={dateKey} onOpen={onOpen} onPhoto={onPhoto} />)
      )}

      {s.silent.length ? wide ? <SilentChips list={s.silent} /> : <SilentBox list={s.silent} /> : null}
    </section>
  )
}

function PtGroup({
  p,
  dateKey,
  onOpen,
  onPhoto,
}: {
  p: HierPt
  dateKey: string
  onOpen: (r: FlatV2) => void
  onPhoto: (r: FlatV2, index: number) => void
}) {
  const name = displayName(p.name)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-baseline justify-between gap-3 px-1">
        <h3 className="m-0 min-w-0 break-words t-body-strong font-bold text-ink">{name}</h3>
        <span className="flex-none t-caption text-ink-2">{ptMeta(p, dateKey)}</span>
      </div>
      <ul aria-label={`Laporan ${name}`} className="m-0 flex list-none flex-col gap-2.5 p-0">
        {p.reports.map((r) => (
          <li key={r.id} className="flex">
            <ReportCard r={r} dateKey={dateKey} onOpen={onOpen} onPhoto={onPhoto} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReportCard({
  r,
  dateKey,
  showPt = false,
  onOpen,
  onPhoto,
}: {
  r: FlatV2
  dateKey: string
  showPt?: boolean
  onOpen: (r: FlatV2) => void
  onPhoto: (r: FlatV2, index: number) => void
}) {
  const jam = approvedAt(r.decidedAt, dateKey)
  const photos = photosOf(r.evidence)
  const extra = photos.length > MAX_THUMBS ? photos.length - (MAX_THUMBS - 1) : 0
  const shown = extra ? photos.slice(0, MAX_THUMBS - 1) : photos
  const note = r.highlight ? r.highlightNote?.trim() ?? '' : ''
  const who = [r.reporterName?.trim(), r.reporterTitle?.trim()].filter(Boolean).join(' · ')
  return (
    <article className={cx('flex w-full flex-col gap-3 p-3.5', CARD)}>
      <button
        type="button"
        onClick={() => onOpen(r)}
        className={cx(
          'group flex w-full cursor-pointer flex-col items-start gap-1.5 rounded-[var(--radius-sm)] text-left',
          'motion-safe:transition-opacity motion-safe:duration-[var(--dur-fast)] active:opacity-70',
          FOCUS
        )}
      >
        {showPt ? (
          <span className="max-w-full truncate t-footnote font-semibold" style={{ color: toneVars(toneOf(r.subId)).fg }}>
            {displayName(r.ptName)}
          </span>
        ) : null}
        <span className="flex w-full items-center justify-between gap-2">
          <span className="t-caption font-semibold text-ink-2">{jam ? `${jam} WIB` : 'Disetujui'}</span>
          {r.highlight ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-waspada-soft px-2 py-0.5 t-caption font-semibold text-waspada">
              <Star size={11} />
              Sorotan
            </span>
          ) : null}
        </span>
        <span className="line-clamp-2 break-words t-headline font-bold text-ink underline-offset-4 group-hover:underline">{r.kegiatan}</span>
        {r.deskripsi?.trim() ? (
          <span className="line-clamp-2 break-words t-callout font-normal text-ink-2">{r.deskripsi}</span>
        ) : null}
        {note ? (
          <span className="mt-1 flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] bg-waspada-soft px-3 py-2">
            <span className="inline-flex items-center gap-1.5 t-caption font-bold text-waspada">
              <Star size={11} />
              Catatan supervisor
            </span>
            <span className="line-clamp-2 t-footnote text-ink">{note}</span>
          </span>
        ) : null}
      </button>

      {/* Foto + kaki menempel di bawah: kartu sejajar di kisi meski isinya beda panjang. */}
      <div className="mt-auto flex flex-col gap-3">
        {photos.length ? (
          <div role="group" aria-label={`Foto bukti, ${photos.length}`} className="flex gap-2">
            {shown.map((p, i) => (
              <EvidenceThumb
                key={p.id}
                item={p}
                size="stack"
                onOpen={() => onPhoto(r, i)}
                label={`Perbesar foto ${i + 1} dari ${photos.length}: ${r.kegiatan}`}
              />
            ))}
            {extra ? (
              <button
                type="button"
                onClick={() => onPhoto(r, MAX_THUMBS - 1)}
                aria-label={`Lihat ${extra} foto lainnya`}
                className={cx(
                  'flex h-16 w-16 flex-none cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-fill-1 t-callout font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-fill-2',
                  FOCUS
                )}
              >
                +{extra}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="-mb-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate t-caption text-ink-2">{who}</span>
          <a
            href={shPdfHref({ id: r.id })}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Lihat PDF ${r.kegiatan} (tab baru)`}
            className={cx(
              '-mr-2 inline-flex min-h-11 flex-none items-center gap-1 rounded-[var(--radius-sm)] px-2 t-footnote font-semibold text-accent no-underline hover:bg-fill-1',
              FOCUS
            )}
          >
            <Icon name="dokumen" size={15} strokeWidth={2.2} />
            PDF
          </a>
        </div>
      </div>
    </article>
  )
}

/** Ponsel: kotak daftar PT belum melapor + terakhir melapor. */
function SilentBox({ list }: { list: CoverageSilent[] }) {
  return (
    <div className="flex flex-col rounded-[var(--radius-lg)] bg-waspada-soft px-3.5 pt-3 pb-1">
      <span className="inline-flex items-center gap-1.5 pb-1.5 t-footnote font-bold text-waspada">
        <Icon name="peringatan" size={14} strokeWidth={2.4} />
        Belum melapor · {list.length} PT
      </span>
      <ul className="m-0 list-none p-0">
        {list.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--waspada)_18%,transparent)] py-2">
            <span className="min-w-0 break-words t-callout text-ink">{displayName(p.name)}</span>
            <span className="flex-none text-right t-caption text-ink-2">{lastReportLabel(p.lastReportDate)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Lebar: deret chip PT belum melapor. */
function SilentChips({ list }: { list: CoverageSilent[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 t-footnote font-bold text-waspada">
        <Icon name="peringatan" size={14} strokeWidth={2.4} />
        Belum melapor
      </span>
      {list.map((p) => (
        <span key={p.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface px-3 t-footnote shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="font-semibold text-ink">{displayName(p.name)}</span>
          <span className="text-ink-2">· {lastReportLabel(p.lastReportDate)}</span>
        </span>
      ))}
    </div>
  )
}
