'use client'

/**
 * Dashboard laporan disetujui tampilan "Semua terbuka" (opsi 2, tinggal
 * gulir) — tablet & desktop (canvas "Opsi dashboard Ketum", papan
 * "Opsi 2 · semua terbuka, gulir saja — Z Fold 7 terbuka").
 *
 * Satu halaman yang digulir: kepala + kontrol tanggal, kartu status (hanya
 * peninjau), chip lompat ke subholding, lalu semua laporan per subholding
 * dalam kisi kartu (terbaru di atas). Ketuk kartu → pop-up rincian (Lihat
 * PDF); ketuk foto → lightbox.
 */

import { useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { ErrorNote, Skeleton, cx } from '@/components/mk'
import { shPdfHref } from '@/lib/subholding/pdf-href'
import { EvidenceLightbox, type LightboxState } from '../evidence'
import { buildHierarchy, reportingStatus } from '../hierarchy'
import { photosOf } from '../logic'
import type { FlatV2 } from '../model'
import { ReportDetail, type DetailReport } from '../report-detail'
import { ReportFeed } from '../report-feed'
import { ListBar, ReportingStatusCard } from '../reporting-status'
import type { OverviewScreenProps } from '../screen-types'
import { dayHeading, toDetail } from './logic'
import { PageHeader } from './panes'

const pdfOf = (r: DetailReport) => shPdfHref({ id: r.id })

export function TabletDayFeed({
  roleName, dateKey, todayKey, onDate, showStatus, data, loading, error, reload, dayView, onDayView,
}: OverviewScreenProps) {
  const [detail, setDetail] = useState<FlatV2 | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  const subs = useMemo(() => buildHierarchy(data), [data])
  const status = useMemo(() => reportingStatus(data), [data])
  const context = [roleName, dayHeading(dateKey)].filter(Boolean).join(' · ')
  const busy = loading && Boolean(data)

  const pickDate = (key: string) => {
    setDetail(null)
    setLightbox(null)
    onDate(key)
  }
  const openPhoto = (r: { kegiatan: string; evidence: FlatV2['evidence'] }, index: number) => {
    const items = photosOf(r.evidence)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-busy={busy || undefined}
        className={cx(
          'mx-auto flex w-full max-w-[1120px] flex-col gap-4 pb-10',
          'motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)]',
          busy && 'opacity-60'
        )}
      >
        <PageHeader context={context} dateKey={dateKey} todayKey={todayKey} onDate={pickDate} />

        {!data ? (
          loading || !error ? (
            <Loading status={showStatus} />
          ) : (
            <div className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
              <ErrorNote message={error ?? 'Laporan belum termuat.'} onRetry={reload} />
            </div>
          )
        ) : (
          <>
            {showStatus ? <ReportingStatusCard status={status} /> : null}
            <ReportFeed
              subs={subs}
              dateKey={data.date || dateKey}
              layout="wide"
              bar={<ListBar view={dayView} onView={onDayView} />}
              onOpen={setDetail}
              onPhoto={openPhoto}
            />
          </>
        )}
      </div>

      <ReportDetail
        report={detail ? toDetail(detail) : null}
        onClose={() => setDetail(null)}
        onOpenPhoto={(i) => detail && openPhoto(detail, i)}
        pdfHref={pdfOf}
      />
      {/* Setelah pop-up supaya lightbox yang dibuka dari pop-up tampil di atasnya. */}
      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </MotionConfig>
  )
}

function Loading({ status }: { status: boolean }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Memuat laporan">
      {status ? <Skeleton h={128} r={22} /> : null}
      <Skeleton h={44} w={420} r={22} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={260} r={22} />
        ))}
      </div>
    </div>
  )
}
