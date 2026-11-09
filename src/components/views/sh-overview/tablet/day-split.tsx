'use client'

/**
 * Dashboard Ketua Umum & Manajemen tampilan "Ringkas" (opsi 1) — tablet &
 * desktop, rentang Hari ini / Kemarin (canvas "Opsi dashboard Ketum", papan
 * "Opsi 1 · akordeon + rincian — Z Fold 7 terbuka").
 *
 * Kontainer ≥ 760px: dua panel. Kiri: kepala + rentang, kartu status, dan
 * akordeon subholding → PT → laporan (bergulir sendiri). Kanan: rincian
 * laporan terpilih — bawaan laporan terbaru di PT/subholding yang terbuka —
 * dengan tombol Lihat PDF. Lebih sempit: satu kolom, rincian di pop-up.
 * Akordeon yang terbuka = Filter dashboard (ikut ke rentang 7 hari).
 */

import { useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { ErrorNote, Icon, Skeleton, cx } from '@/components/mk'
import { shPdfHref } from '@/lib/subholding/pdf-href'
import { EvidenceLightbox, type LightboxState } from '../evidence'
import { buildHierarchy, openState, reportingStatus, selectedReport } from '../hierarchy'
import { HierarchyTree } from '../hierarchy-view'
import { photosOf } from '../logic'
import type { Filter, FlatV2 } from '../model'
import { ReportDetail, ReportDetailPanel, type DetailReport } from '../report-detail'
import { ListBar, ReportingStatusCard } from '../reporting-status'
import type { OverviewRange, OverviewScreenProps } from '../screen-types'
import { dayHeading, dayLayout, dayWord, toDetail } from './logic'
import { FadeSwap } from './parts'
import { SideHeader } from './panes'
import { PANE_VARS, useBox } from './use-box'

const pdfOf = (r: DetailReport) => shPdfHref({ id: r.id })

export function TabletDaySplit({
  roleName, range, onRange, dateKey, data, loading, error, reload, filter, onFilter, dayView, onDayView,
}: OverviewScreenProps) {
  const { ref, box } = useBox()
  // Pengguna sudah membuka/menutup akordeon sendiri: jangan buka subholding terbaru lagi.
  const [touched, setTouched] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [dialog, setDialog] = useState<FlatV2 | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  const subs = useMemo(() => buildHierarchy(data), [data])
  const status = useMemo(() => reportingStatus(data), [data])
  const open = openState(subs, filter, touched)
  const L = dayLayout(box?.w ?? 0)
  const current = L.split ? selectedReport(subs, open, picked) : null
  const context = [roleName, dayHeading(dateKey)].filter(Boolean).join(' · ')

  // Membuka/menutup akordeon mengembalikan rincian ke laporan terbaru di bagian yang terbuka.
  const pickOpen = (f: Filter) => {
    setTouched(true)
    setPicked(null)
    onFilter(f)
  }
  const pickRange = (r: OverviewRange) => {
    setDialog(null)
    setLightbox(null)
    onRange(r)
  }
  const openReport = (r: FlatV2) => {
    if (L.split) setPicked(r.id)
    else setDialog(r)
  }
  const openPhoto = (r: { kegiatan: string; evidence: FlatV2['evidence'] }, index: number) => {
    const items = photosOf(r.evidence)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  const busy = loading && Boolean(data)

  const list = !data ? (
    loading || !error ? (
      <ListSkeleton />
    ) : (
      <div className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
        <ErrorNote message={error ?? 'Laporan belum termuat.'} onRetry={reload} />
      </div>
    )
  ) : (
    <>
      <ReportingStatusCard status={status} />
      <div className="flex flex-col gap-2">
        <ListBar view={dayView} onView={onDayView} />
        <HierarchyTree
          subs={subs}
          open={open}
          onOpen={pickOpen}
          onReport={openReport}
          dateKey={data.date || dateKey}
          selectedId={current?.id ?? null}
        />
      </div>
    </>
  )

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={ref}
        style={{ ...PANE_VARS, height: box?.h ?? 'calc(100dvh - 160px)' }}
        className="flex min-h-[480px] w-full overflow-hidden rounded-[var(--radius-xl)] border border-line bg-bg"
      >
        {box ? (
          <>
            <section
              aria-label="Subholding, PT, dan laporan"
              aria-busy={busy || undefined}
              style={L.split ? { width: L.listW } : undefined}
              className={cx(
                'scrollbar-thin flex h-full flex-col gap-4 overflow-y-auto overscroll-contain bg-[var(--tab-side)] px-3.5 pt-[26px] pb-6',
                L.split ? 'shrink-0 shadow-[inset_-1px_0_0_var(--line)]' : 'flex-1',
                'motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)]',
                busy && 'opacity-60'
              )}
            >
              <SideHeader context={context} title="Laporan terbaru" range={range} onRange={pickRange} />
              {list}
            </section>

            {L.split ? (
              <FadeSwap k={current?.id ?? (data ? 'kosong' : 'memuat')} label="Rincian laporan" className="h-full flex-1 bg-surface">
                {current ? (
                  <ReportDetailPanel report={toDetail(current)} onOpenPhoto={(i) => openPhoto(current, i)} pdfHref={pdfOf} />
                ) : data ? (
                  <NoReport range={range} />
                ) : (
                  <DetailSkeleton />
                )}
              </FadeSwap>
            ) : null}
          </>
        ) : null}
      </div>

      {L.split ? null : (
        <ReportDetail
          report={dialog ? toDetail(dialog) : null}
          onClose={() => setDialog(null)}
          onOpenPhoto={(i) => dialog && openPhoto(dialog, i)}
          pdfHref={pdfOf}
        />
      )}
      {/* Setelah pop-up supaya lightbox yang dibuka dari pop-up tampil di atasnya. */}
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </MotionConfig>
  )
}

function NoReport({ range }: { range: OverviewRange }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-fill-1 text-ink-2">
        <Icon name="dokumen" size={26} />
      </span>
      <p className="m-0 max-w-[320px] t-callout font-normal text-ink-2">
        Belum ada laporan disetujui {dayWord(range)}. Laporan yang disetujui supervisor tampil di sini.
      </p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Memuat laporan">
      <Skeleton h={128} r={22} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} h={72} r={22} />
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-hidden>
      <Skeleton h={260} r={22} />
      <Skeleton h={28} w="70%" r={8} />
      <Skeleton h={14} w="40%" r={6} />
      <Skeleton h={120} r={14} />
    </div>
  )
}
