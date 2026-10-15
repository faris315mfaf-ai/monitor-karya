'use client'

/**
 * Dashboard Superuser & Manajemen (papan 6 mockup subholding, versi terbaru):
 * HANYA kartu per subholding untuk laporan yang sudah DISETUJUI supervisor —
 * pilih Hari ini / Kemarin, klik kartu membuka laporan per PT di bawahnya.
 * Baris laporan = judul (membuka Sheet judul + deskripsi) + thumbnail bukti
 * (membuka lightbox). Tanpa angka KPI.
 *
 * Data: GET /api/sh/overview?date=YYYY-MM-DD (kontrak 16 Okt 2026).
 */

import { useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { Card, EmptyNote, ErrorNote, Icon, PageHeader, SegmentedControl, Sheet, Skeleton, cx } from '@/components/mk'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateLong } from '@/lib/format'
import { EvidenceLightbox, EvidenceThumb, type LightboxState } from './evidence'
import {
  dateFromKey, defaultOpen, initialOf, normalizePts, summaryLabel, wibDateKey,
  type OverviewData, type OverviewReport, type OverviewSubholding,
} from './logic'

type Day = 'today' | 'yesterday'

/** Thumbnail yang tampil di samping judul; sisanya lewat tombol "+n" (lightbox). */
const MAX_THUMBS = 4

export function ShOverviewView() {
  const { user } = useApp()
  const [day, setDay] = useState<Day>('today')
  // Kunci tanggal dihitung sekali per pilihan, supaya tidak bergeser saat render ulang.
  const date = useMemo(() => wibDateKey(new Date(), day === 'today' ? 0 : 1), [day])
  const { data, loading, error, reload } = useResource<OverviewData>(`/api/sh/overview?date=${date}`)
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  const [detail, setDetail] = useState<OverviewReport | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  const list = data?.subholdings ?? []
  // undefined = belum memilih: buka subholding pertama yang berisi; null = semua tertutup.
  const open = picked === undefined ? defaultOpen(list, null) : picked
  const roleName = ROLE_LABELS[user.role] ?? (user.role === 'SUPERUSER' ? 'Superuser' : 'Manajemen')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        context={`${roleName} · ${formatDateLong(dateFromKey(date))} · laporan yang sudah disetujui supervisor`}
        title="Laporan harian subholding"
        tools={
          <SegmentedControl
            size="sm"
            label="Tanggal laporan"
            value={day}
            onChange={(v) => setDay(v as Day)}
            options={[
              { value: 'today', label: 'Hari ini' },
              { value: 'yesterday', label: 'Kemarin' },
            ]}
          />
        }
      />

      {loading && !data ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat laporan">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={92} r={22} />
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
        <div className={cx('flex flex-col gap-3', loading && 'opacity-60 transition-opacity')} aria-busy={loading || undefined}>
          {list.map((sh) => (
            <SubholdingCard
              key={sh.id}
              sh={sh}
              open={open === sh.id}
              onToggle={() => setPicked(open === sh.id ? null : sh.id)}
              onDetail={setDetail}
              onZoom={(r, i) => setLightbox({ items: r.evidence, index: i, title: r.kegiatan })}
            />
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.kegiatan ?? ''}
        backLabel="Dashboard"
      >
        <p className="t-body text-ink whitespace-pre-line">{detail?.deskripsi}</p>
      </Sheet>
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </div>
  )
}

function SubholdingCard({
  sh,
  open,
  onToggle,
  onDetail,
  onZoom,
}: {
  sh: OverviewSubholding
  open: boolean
  onToggle: () => void
  onDetail: (r: OverviewReport) => void
  onZoom: (r: OverviewReport, index: number) => void
}) {
  const pts = normalizePts(sh.pts ?? [])
  const panelId = `sh-ov-${sh.id}`
  return (
    <section
      className={cx(
        'overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]',
        open ? 'ring-2 ring-[var(--ink)]' : 'ring-1 ring-[var(--line)]'
      )}
      aria-label={sh.name}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 px-5 py-5 text-left cursor-pointer min-h-[72px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus)]"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--grafit-fill)] text-[var(--on-grafit)] t-headline"
          aria-hidden
        >
          {initialOf(sh.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="t-title-3 text-ink truncate">{sh.name}</span>
          <span className="t-footnote text-ink-2">{summaryLabel(sh)}</span>
        </span>
        <Icon name="bawah" size={22} strokeWidth={2.2} className={cx('shrink-0 text-ink transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-[var(--line)] px-5 pb-5 pt-2">
          {pts.length === 0 ? (
            <p className="t-body text-ink-2 pt-3">Belum ada laporan pada tanggal ini.</p>
          ) : (
            pts.map((pt) => (
              <div key={pt.id || pt.name} className="flex flex-col">
                <h3 className="t-caption pt-3 pb-1 font-bold uppercase tracking-[0.06em] text-ink-2">{pt.name}</h3>
                <ul className="mk-list">
                  {pt.reports.map((r) => (
                    <ReportRow key={r.id} r={r} onDetail={() => onDetail(r)} onZoom={(i) => onZoom(r, i)} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}

function ReportRow({ r, onDetail, onZoom }: { r: OverviewReport; onDetail: () => void; onZoom: (i: number) => void }) {
  const shown = r.evidence.slice(0, MAX_THUMBS)
  const extra = r.evidence.length - shown.length
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <button
        type="button"
        onClick={onDetail}
        className="min-h-[44px] min-w-0 flex-[1_1_240px] cursor-pointer text-left t-body-strong text-ink underline decoration-[var(--line-strong)] underline-offset-4 hover:decoration-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] rounded-[var(--radius-xs)]"
      >
        {r.kegiatan}
      </button>
      {r.evidence.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((e, i) => (
            <EvidenceThumb key={e.id} item={e} size="sm" onOpen={() => onZoom(i)} label={`Perbesar bukti ${i + 1} dari ${r.evidence.length}: ${e.fileName}`} />
          ))}
          {extra > 0 ? (
            <button
              type="button"
              onClick={() => onZoom(MAX_THUMBS)}
              aria-label={`Lihat ${extra} bukti lainnya`}
              className="flex h-12 w-16 items-center justify-center rounded-[var(--radius-sm)] bg-fill-2 t-callout font-semibold text-ink cursor-pointer"
            >
              +{extra}
            </button>
          ) : null}
        </div>
      ) : (
        <span className="t-footnote text-ink-2">Tanpa bukti</span>
      )}
    </li>
  )
}
