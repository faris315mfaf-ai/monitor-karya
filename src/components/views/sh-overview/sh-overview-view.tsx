'use client'

/**
 * Dashboard Superuser & Manajemen — Opsi A "Mosaik" (kontrak
 * docs/zcode/KONTRAK-SUPERUSER-OPSI-A.md, 15 Okt 2026).
 *
 * Hanya laporan yang sudah DISETUJUI supervisor. Semua kartu subholding yang
 * berisi laporan terbuka sekaligus: 2 kolom bergaya masonry di desktop
 * (≥1024), 1 kolom di bawahnya. Klik judul laporan membuka pop-up rincian;
 * klik thumbnail membuka lightbox langsung pada foto itu. Tanpa angka KPI.
 *
 * Data: GET /api/sh/overview?date=YYYY-MM-DD.
 */

import { useMemo, useState, type MouseEvent } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { Card, EmptyNote, ErrorNote, Icon, SegmentedControl, Skeleton, cx } from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateLong } from '@/lib/format'
import { EvidenceLightbox, EvidenceThumb, type LightboxState } from './evidence'
import { ReportDetail, type DetailReport } from './report-detail'
import {
  anchorId, cardMeta, dateFromKey, displayName, docsOf, initialOf, normalizePts, photosOf,
  splitSubholdings, subholdingLabel, thumbStack, toneOf, toneVars, wibDateKey,
  type OverviewData, type OverviewPt, type OverviewReport, type OverviewSubholding, type Tone,
} from './logic'

type Day = 'today' | 'yesterday'

/** Jangkar baris "Belum ada laporan disetujui" (tujuan chip subholding kosong). */
const EMPTY_ANCHOR = 'sh-belum-melapor'

const headingId = (target: string) => `${target}-judul`

/** Gulir ke kartu tujuan (halus kecuali reduced-motion) lalu fokus ke judulnya. */
function jumpTo(e: MouseEvent<HTMLAnchorElement>, target: string) {
  const el = document.getElementById(target)
  if (!el) return
  e.preventDefault()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  document.getElementById(headingId(target))?.focus({ preventScroll: true })
}

/** Jumlah laporan kartu: hitungan API atau isi PT, mana yang lebih besar. */
function reportCount(sh: OverviewSubholding): number {
  const fromPts = (sh.pts ?? []).reduce((n, p) => n + (p.reports?.length ?? 0), 0)
  return Math.max(sh.count ?? 0, fromPts)
}

function Monogram({ name, tone, className }: { name: string; tone: Tone; className: string }) {
  const t = toneVars(tone)
  return (
    <span
      aria-hidden
      className={cx('flex shrink-0 items-center justify-center font-extrabold!', className)}
      style={{ color: t.fg, background: t.bg }}
    >
      {initialOf(name)}
    </span>
  )
}

export function ShOverviewView() {
  const { user } = useApp()
  const [day, setDay] = useState<Day>('today')
  // Kunci tanggal dihitung sekali per pilihan, supaya tidak bergeser saat render ulang.
  const date = useMemo(() => wibDateKey(new Date(), day === 'today' ? 0 : 1), [day])
  const { data, loading, error, reload } = useResource<OverviewData>(`/api/sh/overview?date=${date}`)
  const [detail, setDetail] = useState<DetailReport | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  const list = useMemo(() => data?.subholdings ?? [], [data])
  const { filled, empty } = useMemo(() => splitSubholdings(list), [list])
  const roleName = ROLE_LABELS[user.role] ?? user.role

  const pickDay = (v: string) => {
    setDay(v as Day)
    setDetail(null)
    setLightbox(null)
  }

  const openDetail = (sh: OverviewSubholding, pt: OverviewPt, r: OverviewReport) =>
    setDetail({
      id: r.id,
      kegiatan: r.kegiatan,
      deskripsi: r.deskripsi,
      ptName: displayName(pt.name),
      subholdingName: subholdingLabel(sh.name),
      tone: toneOf(sh.id),
      evidence: r.evidence ?? [],
    })

  const openPhoto = (r: { kegiatan: string; evidence: OverviewReport['evidence'] }, index: number) => {
    const items = photosOf(r.evidence)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  return (
    <div className="flex flex-col gap-5 min-[600px]:gap-6">
      <header className="mk-pagehead">
        <div className="min-w-0">
          <p className="mk-pagehead__ctx">
            {roleName} · {formatDateLong(dateFromKey(date))}
          </p>
          <h1 className="mk-pagehead__title">Laporan subholding</h1>
          <p className="t-body text-ink-2 mt-1">Hanya laporan yang sudah disetujui supervisor.</p>
        </div>
        <div className="mk-pagehead__tools">
          <SegmentedControl
            size="sm"
            label="Tanggal laporan"
            value={day}
            onChange={pickDay}
            options={[
              { value: 'today', label: 'Hari ini' },
              { value: 'yesterday', label: 'Kemarin' },
            ]}
          />
        </div>
      </header>

      {loading && !data ? (
        <div className="flex flex-col gap-5" aria-busy="true" aria-label="Memuat laporan">
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={44} w={150} r={999} className="shrink-0" />
            ))}
          </div>
          <div className="lg:columns-2 lg:gap-x-5">
            {[300, 220, 260, 200].map((h, i) => (
              <Skeleton key={i} h={h} r={28} className="mb-4 break-inside-avoid lg:mb-5" />
            ))}
          </div>
        </div>
      ) : error || !data ? (
        <Card>
          <ErrorNote message={error ?? 'Laporan belum termuat.'} onRetry={reload} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyNote icon="gedung">Belum ada subholding aktif.</EmptyNote>
        </Card>
      ) : (
        <div
          className={cx('flex flex-col gap-5 transition-opacity min-[600px]:gap-6', loading && 'opacity-60')}
          aria-busy={loading || undefined}
        >
          <nav aria-label="Lompat ke subholding" className="-mx-1">
            <ul className="flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
              {[...filled, ...empty].map((sh) => {
                const label = subholdingLabel(sh.name)
                const count = reportCount(sh)
                const target = count > 0 ? anchorId(sh.id) : EMPTY_ANCHOR
                return (
                  <li key={sh.id} className="shrink-0">
                    <a
                      href={`#${target}`}
                      onClick={(e) => jumpTo(e, target)}
                      aria-label={`${label}, ${count} laporan`}
                      className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-surface py-1 pl-1.5 pr-3.5 text-ink shadow-[var(--shadow-card)] hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                    >
                      <Monogram name={label} tone={toneOf(sh.id)} className="h-8 w-8 rounded-full [font:var(--text-footnote)]" />
                      <span className="t-body-strong max-[599px]:hidden">{label}</span>
                      <span className="t-callout tabular-nums text-ink-2">{count}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>

          {filled.length === 0 ? (
            <Card>
              <EmptyNote icon="dokumen">Belum ada laporan yang disetujui pada tanggal ini.</EmptyNote>
            </Card>
          ) : (
            <div className="lg:columns-2 lg:gap-x-5">
              {filled.map((sh) => (
                <SubholdingCard
                  key={sh.id}
                  sh={sh}
                  onDetail={(pt, r) => openDetail(sh, pt, r)}
                  onPhoto={openPhoto}
                />
              ))}
            </div>
          )}

          {empty.length > 0 ? (
            <section
              id={EMPTY_ANCHOR}
              aria-labelledby={headingId(EMPTY_ANCHOR)}
              className="flex scroll-mt-4 flex-wrap items-center gap-2.5 rounded-[var(--radius-lg)] border border-dashed border-[color-mix(in_srgb,var(--line-strong)_55%,transparent)] p-4 min-[600px]:scroll-mt-24 min-[600px]:px-5 lg:scroll-mt-6"
            >
              <h2
                id={headingId(EMPTY_ANCHOR)}
                tabIndex={-1}
                className="mr-1.5 rounded-[var(--radius-xs)] t-body-strong text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                Belum ada laporan disetujui
              </h2>
              <ul className="flex flex-wrap gap-2.5">
                {empty.map((sh) => {
                  const label = subholdingLabel(sh.name)
                  return (
                    <li
                      key={sh.id}
                      className="inline-flex min-h-[36px] items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3.5 t-callout font-semibold! text-ink"
                    >
                      <Monogram name={label} tone={toneOf(sh.id)} className="h-7 w-7 rounded-full [font:var(--text-caption)]" />
                      {label}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <ReportDetail
        report={detail}
        onClose={() => setDetail(null)}
        onOpenPhoto={(i) => detail && openPhoto(detail, i)}
      />
      {/* Dirender setelah pop-up supaya lightbox yang dibuka dari pop-up tampil di atasnya. */}
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </div>
  )
}

function SubholdingCard({
  sh,
  onDetail,
  onPhoto,
}: {
  sh: OverviewSubholding
  onDetail: (pt: OverviewPt, r: OverviewReport) => void
  onPhoto: (r: OverviewReport, index: number) => void
}) {
  const id = anchorId(sh.id)
  const label = subholdingLabel(sh.name)
  const tone = toneOf(sh.id)
  const pts = normalizePts(sh.pts ?? [])
  return (
    <section
      id={id}
      aria-labelledby={headingId(id)}
      className="mb-4 flex scroll-mt-4 break-inside-avoid flex-col gap-5 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-card)] min-[600px]:scroll-mt-24 min-[600px]:p-6 lg:mb-5 lg:scroll-mt-6"
    >
      <div className="flex items-center gap-3 min-[600px]:gap-4">
        <Monogram
          name={label}
          tone={tone}
          className="h-11 w-11 rounded-[var(--radius-md)] [font:var(--text-headline)] min-[600px]:h-14 min-[600px]:w-14 min-[600px]:[font:var(--text-title-3)]"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-caption font-bold! uppercase tracking-[0.08em]! text-ink-2 max-[599px]:hidden">Subholding</span>
          <h2
            id={headingId(id)}
            tabIndex={-1}
            className="t-title-3 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] rounded-[var(--radius-xs)]"
          >
            {label}
          </h2>
          <span className="t-footnote text-ink-2">{cardMeta(sh)}</span>
        </div>
      </div>

      {pts.map((pt) => (
        <div key={pt.id || pt.name} className="flex flex-col gap-2.5">
          <h3 className="flex items-center gap-2 px-1 t-caption font-bold! uppercase tracking-[0.08em]! text-ink-2">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: toneVars(tone).fg }} />
            <span className="min-w-0 truncate">{displayName(pt.name)}</span>
          </h3>
          <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-fill-1 [&>li+li]:border-t [&>li+li]:border-[var(--line)]">
            {pt.reports.map((r) => (
              <ReportRow key={r.id} r={r} onDetail={() => onDetail(pt, r)} onPhoto={(i) => onPhoto(r, i)} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function ReportRow({ r, onDetail, onPhoto }: { r: OverviewReport; onDetail: () => void; onPhoto: (i: number) => void }) {
  const { shown, more } = thumbStack(r.evidence, 3)
  const total = shown.length + more
  const docs = docsOf(r.evidence).length
  return (
    <li className="flex flex-col gap-2.5 p-3.5 min-[600px]:flex-row min-[600px]:items-center min-[600px]:gap-4 min-[600px]:pl-[18px]">
      <button
        type="button"
        onClick={onDetail}
        className="group flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 rounded-[var(--radius-sm)] py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <span className="t-body-strong text-ink underline-offset-4 group-hover:underline">{r.kegiatan}</span>
        {r.deskripsi ? <span className="t-footnote text-ink-2 line-clamp-2">{r.deskripsi}</span> : null}
        {docs > 0 ? (
          <span className="inline-flex items-center gap-1 t-caption text-ink-2">
            <Icon name="dokumen" size={14} />
            {docs} dokumen
          </span>
        ) : null}
      </button>
      {total > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 min-[600px]:gap-0">
          {shown.map((e, i) => (
            <EvidenceThumb
              key={e.id}
              item={e}
              size="stack"
              onOpen={() => onPhoto(i)}
              label={`Perbesar foto ${i + 1} dari ${total}`}
              className={cx(
                'cursor-zoom-in min-[600px]:ring-[3px] min-[600px]:ring-[var(--fill-1)]',
                i > 0 && 'min-[600px]:-ml-[18px]'
              )}
            />
          ))}
          {more > 0 ? (
            <button
              type="button"
              onClick={() => onPhoto(shown.length)}
              aria-label={`Lihat semua ${total} foto`}
              className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-fill-2 t-body-strong text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] min-[600px]:-ml-[18px] min-[600px]:ring-[3px] min-[600px]:ring-[var(--fill-1)]"
            >
              +{more}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
