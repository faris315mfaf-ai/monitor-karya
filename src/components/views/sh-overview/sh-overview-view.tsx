'use client'

/**
 * Dashboard Superuser & Manajemen — versi minimalis (kontrak
 * docs/zcode/KONTRAK-SUPERUSER-MINIMALIS.md, 15 Okt 2026).
 *
 * Hanya laporan yang sudah DISETUJUI supervisor. Kartu subholding dalam grid
 * auto-fill (3/2/1 kolom sesuai lebar); subholding tanpa laporan tampil pudar
 * di akhir. Klik judul laporan membuka pop-up rincian; klik thumbnail membuka
 * lightbox pada foto pertama. Tanpa angka KPI.
 *
 * Data: GET /api/sh/overview?date=YYYY-MM-DD.
 */

import { useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { Card, EmptyNote, ErrorNote, Icon, SegmentedControl, Skeleton, cx } from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateLong } from '@/lib/format'
import { EvidenceLightbox, useSignedUrl, type LightboxState } from './evidence'
import { ReportDetail, type DetailReport } from './report-detail'
import { timeLabel } from './detail-logic'
import {
  dateFromKey, displayName, initialOf, normalizePts, photosOf, splitSubholdings, subholdingLabel,
  toneOf, toneVars, wibDateKey,
  type OverviewData, type OverviewEvidence, type OverviewPt, type OverviewReport, type OverviewSubholding,
} from './logic'

type Day = 'today' | 'yesterday'

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const GRID = 'grid items-start gap-5 grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))]'

/** Jumlah laporan kartu: hitungan API atau isi PT, mana yang lebih besar. */
function reportCount(sh: OverviewSubholding): number {
  const fromPts = (sh.pts ?? []).reduce((n, p) => n + (p.reports?.length ?? 0), 0)
  return Math.max(sh.count ?? 0, fromPts)
}

/** Meta baris laporan: "10.24 · Budi Santoso"; bagian kosong dibuang. */
function rowMeta(r: OverviewReport): string {
  return [timeLabel(r.decidedAt ?? null), r.reporterName?.trim()].filter(Boolean).join(' · ')
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

  const openDetail = (sh: OverviewSubholding, pt: OverviewPt, r: OverviewReport) => {
    // Field tambahan dikirim lewat spread: opsional di DetailReport (kontrak B4).
    const extra = { reporterName: r.reporterName, reporterTitle: r.reporterTitle, decidedAt: r.decidedAt }
    setDetail({
      id: r.id,
      kegiatan: r.kegiatan,
      deskripsi: r.deskripsi,
      ptName: displayName(pt.name),
      subholdingName: subholdingLabel(sh.name),
      tone: toneOf(sh.id),
      evidence: r.evidence ?? [],
      ...extra,
    })
  }

  const openPhoto = (r: { kegiatan: string; evidence: OverviewReport['evidence'] }, index: number) => {
    const items = photosOf(r.evidence)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  return (
    <div className="flex flex-col gap-6 min-[600px]:gap-8">
      <header className="mk-pagehead">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 [font:var(--text-callout)] text-ink-2">
            {roleName} · {formatDateLong(dateFromKey(date))}
          </p>
          <h1 className="m-0 text-ink [font:var(--text-title-2)] tracking-[-0.025em] min-[600px]:[font:var(--text-large-title)]">
            Laporan subholding
          </h1>
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
        <div className={GRID} aria-busy="true" aria-label="Memuat laporan">
          {[260, 200, 230].map((h, i) => (
            <Skeleton key={i} h={h} r={28} />
          ))}
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
          className={cx('flex flex-col gap-5 transition-opacity', loading && 'opacity-60')}
          aria-busy={loading || undefined}
        >
          {filled.length === 0 ? (
            <Card>
              <EmptyNote icon="dokumen">Belum ada laporan yang disetujui pada tanggal ini.</EmptyNote>
            </Card>
          ) : null}
          <div className={GRID}>
            {filled.map((sh) => (
              <SubholdingCard
                key={sh.id}
                sh={sh}
                onDetail={(pt, r) => openDetail(sh, pt, r)}
                onPhoto={(r) => openPhoto(r, 0)}
              />
            ))}
            {empty.map((sh) => (
              <SubholdingCard key={sh.id} sh={sh} />
            ))}
          </div>
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
  onDetail?: (pt: OverviewPt, r: OverviewReport) => void
  onPhoto?: (r: OverviewReport) => void
}) {
  const label = subholdingLabel(sh.name)
  const t = toneVars(toneOf(sh.id))
  const count = reportCount(sh)
  const pts = count > 0 ? normalizePts(sh.pts ?? []) : []
  const headingId = `sh-${sh.id}-judul`
  return (
    <section
      aria-labelledby={headingId}
      className={cx(
        'flex min-w-0 flex-col rounded-[var(--radius-xl)] bg-surface px-[22px] pb-2.5 pt-[22px] shadow-[var(--shadow-card)]',
        count === 0 && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-3 pb-3.5">
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full [font:var(--text-footnote)] font-bold!"
          style={{ color: t.fg, background: t.bg }}
        >
          {initialOf(label)}
        </span>
        <h2 id={headingId} className="m-0 min-w-0 flex-1 truncate text-ink [font:var(--text-headline)] tracking-[-0.01em]">
          {label}
        </h2>
        {count > 0 ? <span className="shrink-0 [font:var(--text-footnote)] tabular-nums text-ink-2">{count} laporan</span> : null}
      </div>

      {count === 0 ? (
        <p className="m-0 border-t border-[var(--line)] pb-4 pt-3.5 [font:var(--text-callout)] font-normal! text-ink-2">
          Belum ada laporan disetujui.
        </p>
      ) : (
        pts.map((pt) => (
          <div key={pt.id || pt.name} className="border-t border-[var(--line)] pb-1 pt-3">
            <h3 className="m-0 truncate pb-0.5 [font:var(--text-caption)] text-ink-2">{displayName(pt.name)}</h3>
            <ul className="m-0 list-none p-0">
              {pt.reports.map((r) => (
                <ReportRow key={r.id} r={r} onDetail={() => onDetail?.(pt, r)} onPhoto={() => onPhoto?.(r)} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

function ReportRow({ r, onDetail, onPhoto }: { r: OverviewReport; onDetail: () => void; onPhoto: () => void }) {
  const photos = photosOf(r.evidence)
  const meta = rowMeta(r)
  return (
    <li className="flex min-h-[52px] items-center gap-3">
      <button
        type="button"
        onClick={onDetail}
        className={cx(
          'group flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-start justify-center gap-px rounded-[var(--radius-xs)] py-1.5 text-left',
          FOCUS_RING
        )}
      >
        <span className="max-w-full truncate text-ink [font:var(--text-body)] font-medium! underline-offset-4 group-hover:underline">
          {r.kegiatan}
        </span>
        {meta ? <span className="max-w-full truncate [font:var(--text-caption)] font-normal! text-ink-2">{meta}</span> : null}
      </button>
      {photos.length > 0 ? <RowThumb photo={photos[0]} total={photos.length} title={r.kegiatan} onOpen={onPhoto} /> : null}
    </li>
  )
}

/** Satu thumbnail 44px (foto pertama) dengan lencana jumlah foto bila lebih dari satu. */
function RowThumb({
  photo,
  total,
  title,
  onOpen,
}: {
  photo: OverviewEvidence
  total: number
  title: string
  onOpen: () => void
}) {
  const { url, failed, loading } = useSignedUrl(photo.id)
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Perbesar foto ${title}, ${total} foto`}
      title={photo.fileName}
      className={cx(
        'relative flex h-11 w-11 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-[11px] bg-fill-1 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]',
        FOCUS_RING
      )}
    >
      {url && !failed && !broken ? (
        <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : loading ? (
        <Skeleton h="100%" r={0} className="absolute inset-0" />
      ) : (
        <Icon name="dokumen" size={18} />
      )}
      {total > 1 ? (
        <span
          aria-hidden
          className="absolute bottom-[3px] right-[3px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[var(--surface)] [font:var(--text-caption)] font-bold! leading-none! tabular-nums"
        >
          {total}
        </span>
      ) : null}
    </button>
  )
}
