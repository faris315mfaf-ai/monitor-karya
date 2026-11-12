'use client'

/**
 * Dashboard laporan disetujui (Ketua Umum, Manajemen, Supervisor) — ponsel
 * < 600px (canvas "Opsi dashboard Ketum").
 *
 * Kepala + kontrol tanggal (Hari ini / pilih tanggal), kartu status (hanya
 * peninjau), lalu subholding → PT → laporan, terbaru di atas, dalam salah
 * satu dari dua tampilan pilihan pengguna (tersimpan per perangkat):
 *  - "Semua terbuka" (opsi 2): chip lompat ke subholding, semua kartu laporan
 *    terbuka, tinggal gulir; ketuk foto → lightbox.
 *  - "Ringkas" (opsi 1): akordeon; yang terbuka = Filter.
 * Ketuk laporan → rincian layar penuh yang didorong dari kanan (Lihat PDF).
 * Navigasi bawah milik shell; layar ini tidak membuat tab bar sendiri.
 */

import { useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { EmptyNote, ErrorNote, Skeleton } from '@/components/mk'
import { PullToRefresh } from '@/components/mk/pull-refresh'
import { DateControl } from '../date-control'
import { EvidenceLightbox, type LightboxState } from '../evidence'
import { buildHierarchy, openState, reportingStatus } from '../hierarchy'
import { HierarchyTree } from '../hierarchy-view'
import { photosOf } from '../logic'
import type { Filter, FlatV2 } from '../model'
import { ReportFeed } from '../report-feed'
import { ListBar, ReportingStatusCard } from '../reporting-status'
import type { OverviewScreenProps } from '../screen-types'
import { backLabel, dayHeading } from './mobile-logic'
import { ReportScreen } from './report-screen'

const HEADING = 'Laporan terbaru'

export function MobileOverview(props: OverviewScreenProps) {
  const { roleName, dateKey, todayKey, onDate, showStatus, data, loading, error, reload, filter, onFilter, dayView, onDayView } = props
  const [detail, setDetail] = useState<FlatV2 | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  // Tampilan Ringkas: pengguna sudah membuka/menutup akordeon sendiri → jangan buka subholding terbaru lagi.
  const [touched, setTouched] = useState(false)

  const subs = useMemo(() => buildHierarchy(data), [data])
  const status = useMemo(() => reportingStatus(data), [data])
  const open = openState(subs, filter, touched)

  const pickOpen = (f: Filter) => {
    setTouched(true)
    onFilter(f)
  }
  const openPhoto = (r: FlatV2, index: number) => {
    const photos = photosOf(r.evidence)
    if (photos.length) setLightbox({ items: photos, index, title: r.kegiatan })
  }

  return (
    <MotionConfig reducedMotion="user">
      <PullToRefresh onRefresh={reload} loading={loading}>
        <div className="-mx-1 flex flex-col gap-[22px] pb-4" aria-label={`Ringkasan ${roleName}`} role="region">
          {/* Kepala: tanggal kecil, judul besar, kontrol tanggal */}
          <header className="flex flex-col gap-3.5 px-1">
            <div className="flex flex-col gap-0.5">
              <span className="t-footnote font-semibold text-ink-2">{dayHeading(dateKey)}</span>
              <h1 className="t-title-1 m-0 break-words text-ink">{HEADING}</h1>
            </div>
            <DateControl dateKey={dateKey} todayKey={todayKey} onDate={onDate} />
          </header>

          {error && !data ? (
            <ErrorNote message={error} onRetry={reload} />
          ) : !data ? (
            <LoadingBlocks status={showStatus} />
          ) : data.subholdings.length === 0 ? (
            <EmptyNote icon="gedung">Belum ada subholding dalam cakupan Anda.</EmptyNote>
          ) : (
            <>
              {showStatus ? <ReportingStatusCard status={status} /> : null}
              {dayView === 'ringkas' ? (
                <div className="flex flex-col gap-2.5">
                  <ListBar view={dayView} onView={onDayView} />
                  <HierarchyTree subs={subs} open={open} onOpen={pickOpen} onReport={setDetail} dateKey={data.date || dateKey} />
                </div>
              ) : (
                <ReportFeed
                  subs={subs}
                  dateKey={data.date || dateKey}
                  layout="phone"
                  bar={<ListBar view={dayView} onView={onDayView} />}
                  onOpen={setDetail}
                  onPhoto={openPhoto}
                />
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      {detail ? (
        <ReportScreen
          key={detail.id}
          report={detail}
          backLabel={backLabel(HEADING)}
          onOpenPhoto={(i) => openPhoto(detail, i)}
          onClosed={() => {
            setLightbox(null)
            setDetail(null)
          }}
        />
      ) : null}

      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </MotionConfig>
  )
}

/* ---------- Bagian kecil ---------- */

function LoadingBlocks({ status }: { status: boolean }) {
  return (
    <div className="flex flex-col gap-[22px]" aria-busy="true" aria-label="Memuat ringkasan">
      {status ? <Skeleton h={132} r={22} /> : null}
      <Skeleton h={18} w={240} r={6} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={72} r={22} />
        ))}
      </div>
    </div>
  )
}
