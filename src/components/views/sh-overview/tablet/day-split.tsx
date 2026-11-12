'use client'

/**
 * Dashboard laporan disetujui tampilan "Ringkas" (opsi 1) — tablet &
 * desktop (canvas "Opsi dashboard Ketum", papan
 * "Opsi 1 · akordeon + rincian — Z Fold 7 terbuka").
 *
 * Halaman penuh seperti tampilan Semua terbuka: kepala + kontrol tanggal, kartu
 * status (hanya peninjau), lalu kontainer ≥ 760px dua kolom — kiri akordeon subholding → PT →
 * laporan (ikut gulir halaman), kanan panel rincian yang menempel di layar
 * (sticky) dan bergulir sendiri; bawaan laporan terbaru di PT/subholding yang
 * terbuka, dengan Lihat PDF. Lebih sempit: satu kolom, rincian di pop-up.
 * Akordeon yang terbuka = Filter dashboard (tersimpan per perangkat).
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
import { ApprovedEmpty, ListBar, ReportingStatusCard } from '../reporting-status'
import type { OverviewScreenProps } from '../screen-types'
import { dayHeading, dayLayout, dayWord, toDetail } from './logic'
import { FadeSwap } from './parts'
import { PageHeader } from './panes'
import { useBox } from './use-box'

const pdfOf = (r: DetailReport) => shPdfHref({ id: r.id })

/**
 * Panel rincian menempel di bawah bilah atas shell (tablet: tetap di atas,
 * ≥1024px: tanpa bilah atas) dan menyisakan ruang dock bawah.
 */
const STICKY = 'sticky top-[88px] h-[calc(100dvh-196px)] lg:top-6 lg:h-[calc(100dvh-72px)] min-h-[420px]'

export function TabletDaySplit({
  roleName, dateKey, todayKey, onDate, showStatus, data, loading, error, reload, filter, onFilter, dayView, onDayView,
}: OverviewScreenProps) {
  const { ref, box } = useBox()
  // Pengguna sudah membuka/menutup akordeon sendiri: jangan buka subholding terbaru lagi.
  const [touched, setTouched] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [dialog, setDialog] = useState<FlatV2 | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  const subs = useMemo(() => buildHierarchy(data, !showStatus), [data, showStatus])
  const status = useMemo(() => reportingStatus(data), [data])
  const open = openState(subs, filter, touched)
  const L = dayLayout(box?.w ?? 0)
  const current = L.split ? selectedReport(subs, open, picked) : null
  const context = [roleName, dayHeading(dateKey)].filter(Boolean).join(' · ')
  const busy = loading && Boolean(data)

  // Membuka/menutup akordeon mengembalikan rincian ke laporan terbaru di bagian yang terbuka.
  const pickOpen = (f: Filter) => {
    setTouched(true)
    setPicked(null)
    onFilter(f)
  }
  const pickDate = (key: string) => {
    setDialog(null)
    setLightbox(null)
    setPicked(null)
    onDate(key)
  }
  const openReport = (r: FlatV2) => {
    if (L.split) setPicked(r.id)
    else setDialog(r)
  }
  const openPhoto = (r: { kegiatan: string; evidence: FlatV2['evidence'] }, index: number) => {
    const items = photosOf(r.evidence)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={ref}
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
        ) : !showStatus && !subs.length ? (
          <ApprovedEmpty />
        ) : (
          <>
            {showStatus ? <ReportingStatusCard status={status} /> : null}
            <ListBar view={dayView} onView={onDayView} />
            <div className="flex items-start gap-4">
              <section
                aria-label="Subholding, PT, dan laporan"
                style={L.split ? { width: L.listW } : undefined}
                className={cx('min-w-0', L.split ? 'flex-none' : 'flex-1')}
              >
                <HierarchyTree
                  subs={subs}
                  open={open}
                  onOpen={pickOpen}
                  onReport={openReport}
                  dateKey={data.date || dateKey}
                  selectedId={current?.id ?? null}
                />
              </section>

              {L.split ? (
                <section
                  aria-label="Rincian laporan"
                  className={cx(STICKY, 'min-w-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]')}
                >
                  <FadeSwap k={current?.id ?? 'kosong'} className="h-full">
                    {current ? (
                      <ReportDetailPanel report={toDetail(current)} onOpenPhoto={(i) => openPhoto(current, i)} pdfHref={pdfOf} />
                    ) : (
                      <NoReport when={dayWord(dateKey, todayKey)} />
                    )}
                  </FadeSwap>
                </section>
              ) : null}
            </div>
          </>
        )}
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

function NoReport({ when }: { when: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-fill-1 text-ink-2">
        <Icon name="dokumen" size={26} />
      </span>
      <p className="m-0 max-w-[320px] t-callout font-normal text-ink-2">
        Belum ada laporan disetujui {when}. Laporan yang disetujui supervisor tampil di sini.
      </p>
    </div>
  )
}

function Loading({ status }: { status: boolean }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Memuat laporan">
      {status ? <Skeleton h={128} r={22} /> : null}
      <div className="flex items-start gap-4">
        <div className="flex w-[40%] flex-none flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={72} r={22} />
          ))}
        </div>
        <Skeleton h={420} r={22} className="flex-1" />
      </div>
    </div>
  )
}
