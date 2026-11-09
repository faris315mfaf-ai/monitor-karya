'use client'

/**
 * Dashboard Ketua Umum, Manajemen & Superuser — ponsel < 600px.
 *
 * Rentang Hari ini / Kemarin: opsi 2 "tinggal gulir" (canvas "Opsi dashboard
 * Ketum", papan "Opsi 2 · ponsel") — kartu status, chip lompat ke subholding,
 * lalu semua laporan terbuka: subholding → PT → kartu laporan, terbaru di
 * atas. Ketuk kartu → rincian layar penuh yang didorong dari kanan (tombol
 * Lihat PDF di bawah); ketuk foto → lightbox.
 *
 * Rentang 7 hari: pola melapor (KONTRAK-MANAJEMEN-MOBILE.md D3, papan
 * M-Ponsel-7Hari) dengan penyaring subholding → PT di lembar pemilih.
 * Navigasi bawah milik shell; layar ini tidak membuat tab bar sendiri.
 */

import { useId, useMemo, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { EmptyNote, ErrorNote, Icon, Skeleton, cx } from '@/components/mk'
import { PullToRefresh } from '@/components/mk/pull-refresh'
import { EvidenceLightbox, type LightboxState } from '../evidence'
import { buildHierarchy, reportingStatus } from '../hierarchy'
import { displayName, photosOf, toneOf, toneVars } from '../logic'
import { NO_FILTER, type FlatV2 } from '../model'
import { ReportFeed, ReportingStatusCard } from '../report-feed'
import type { OverviewRange, OverviewScreenProps } from '../screen-types'
import {
  addDays, backLabel, dayHeading, findSub, monoOf, ptNameOf, ptSections, ptShort, ptTotal, screenHeading, subSections,
  subShort, weekRangeLabel,
} from './mobile-logic'
import { PickerSheet } from './picker-sheet'
import { ReportScreen } from './report-screen'
import { WeekPattern } from './week-pattern'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const FOCUS_IN = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'
const RANGES: { value: OverviewRange; label: string }[] = [
  { value: 'today', label: 'Hari ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'week', label: '7 hari' },
]

export function MobileOverview(props: OverviewScreenProps) {
  const { roleName, range, onRange, dateKey, data, week, loading, error, reload, filter, onFilter } = props
  const [detail, setDetail] = useState<FlatV2 | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const [sheet, setSheet] = useState<'sub' | 'pt' | null>(null)
  const [query, setQuery] = useState('')

  const isWeek = range === 'week'
  const sub = findSub(data, filter.sub)
  const ptName = ptNameOf(sub, filter.pt)
  const subs = useMemo(() => buildHierarchy(data), [data])
  const status = useMemo(() => reportingStatus(data), [data])
  const heading = isWeek ? screenHeading(data, filter) : 'Laporan terbaru'

  const dateLine = isWeek ? weekRangeLabel(week?.start ?? addDays(dateKey, -6), week?.end ?? dateKey) : dayHeading(dateKey)

  const openSheet = (k: 'sub' | 'pt') => {
    setQuery('')
    setSheet(k)
  }
  const openPhoto = (r: FlatV2, index: number) => {
    const photos = photosOf(r.evidence)
    if (photos.length) setLightbox({ items: photos, index, title: r.kegiatan })
  }

  const sheetSections =
    sheet === 'sub' ? subSections(data, filter, query) : sheet === 'pt' ? ptSections(sub, filter, query, range) : []

  return (
    <MotionConfig reducedMotion="user">
      <PullToRefresh onRefresh={reload} loading={loading}>
        <div className="-mx-1 flex flex-col gap-[22px] pb-4" aria-label={`Ringkasan ${roleName}`} role="region">
          {/* Kepala: tanggal kecil, judul besar, segmen rentang (+ penyaring pada 7 hari) */}
          <header className="flex flex-col gap-3.5 px-1">
            <div className="flex flex-col gap-0.5">
              <span className="t-footnote font-semibold text-ink-2">{dateLine}</span>
              <h1 className="t-title-1 m-0 break-words text-ink">{heading}</h1>
            </div>
            <RangeControl value={range} onChange={onRange} />
            {isWeek ? (
              <div className="flex flex-wrap items-center gap-2">
                <FilterButton
                  active={Boolean(sub)}
                  onClick={() => openSheet('sub')}
                  lead={
                    sub ? (
                      <Mono letter={monoOf(sub.name)} tone={toneOf(sub.id)} />
                    ) : (
                      <span aria-hidden className="t-caption flex h-6 w-6 flex-none items-center justify-center rounded-full bg-fill-1 font-bold text-ink">
                        ∑
                      </span>
                    )
                  }
                  label={sub ? displayName(sub.name) : 'Semua subholding'}
                  a11y={sub ? `Subholding ${displayName(sub.name)}. Ganti subholding` : 'Semua subholding. Pilih subholding'}
                />
                {sub ? (
                  <FilterButton
                    active={Boolean(ptName)}
                    onClick={() => openSheet('pt')}
                    label={ptName ? ptShort(ptName) : `Semua PT (${ptTotal(sub)})`}
                    a11y={ptName ? `${ptName}. Ganti PT` : `Semua PT (${ptTotal(sub)}). Pilih PT`}
                  />
                ) : null}
                {sub ? (
                  <button
                    type="button"
                    onClick={() => onFilter(NO_FILTER)}
                    className={cx('t-callout min-h-11 rounded-full px-1.5 font-semibold text-accent', FOCUS)}
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>

          {isWeek ? (
            week ? (
              <WeekPattern week={week} filter={filter} ptName={ptName} />
            ) : error ? (
              <ErrorNote message={error} onRetry={reload} />
            ) : (
              <LoadingBlocks />
            )
          ) : error && !data ? (
            <ErrorNote message={error} onRetry={reload} />
          ) : !data ? (
            <LoadingBlocks />
          ) : data.subholdings.length === 0 ? (
            <EmptyNote icon="gedung">Belum ada subholding dalam cakupan Anda.</EmptyNote>
          ) : (
            <>
              <ReportingStatusCard status={status} />
              <ReportFeed subs={subs} dateKey={data.date || dateKey} layout="phone" onOpen={setDetail} onPhoto={openPhoto} />
            </>
          )}
        </div>
      </PullToRefresh>

      {sheet ? (
        <PickerSheet
          key={sheet}
          title={sheet === 'pt' && sub ? `Pilih PT · ${subShort(sub.name)}` : 'Pilih subholding'}
          searchLabel={sheet === 'pt' ? 'Cari PT' : 'Cari subholding'}
          sections={sheetSections}
          query={query}
          onQuery={setQuery}
          onPick={onFilter}
          onClosed={() => {
            setSheet(null)
            setQuery('')
          }}
        />
      ) : null}

      {detail ? (
        <ReportScreen
          key={detail.id}
          report={detail}
          backLabel={backLabel(heading)}
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

/** Kontrol segmen selebar layar; penanda terpilih bergeser dengan pegas kritis. */
function RangeControl({ value, onChange }: { value: OverviewRange; onChange: (r: OverviewRange) => void }) {
  const layoutId = useId()
  return (
    <div role="group" aria-label="Rentang waktu" className="flex rounded-[var(--radius-sm)] bg-fill-1">
      {RANGES.map((r) => {
        const on = r.value === value
        return (
          <button
            key={r.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r.value)}
            className={cx('t-callout relative min-h-11 flex-1 rounded-[var(--radius-sm)] font-semibold text-ink', FOCUS_IN)}
          >
            {on ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                className="absolute inset-[3px] rounded-[var(--radius-xs)] bg-surface shadow-[var(--shadow-control)]"
              />
            ) : null}
            <span className="relative">{r.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  lead,
  label,
  a11y,
}: {
  active: boolean
  onClick: () => void
  lead?: React.ReactNode
  label: string
  a11y: string
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={a11y}
      onClick={onClick}
      className={cx(
        't-callout inline-flex min-h-11 max-w-full items-center gap-2 rounded-full font-semibold',
        lead ? 'pl-2.5 pr-3' : 'px-3.5',
        active ? 'bg-grafit-fill text-on-grafit' : 'bg-surface text-ink shadow-[var(--shadow-card)]',
        FOCUS,
      )}
    >
      {lead}
      <span className="min-w-0 truncate">{label}</span>
      <Icon name="bawah" size={12} strokeWidth={2.6} className="flex-none" />
    </button>
  )
}

function Mono({ letter, tone }: { letter: string; tone: ReturnType<typeof toneOf> }) {
  const t = toneVars(tone)
  return (
    <span
      aria-hidden
      className="t-caption flex h-6 w-6 flex-none items-center justify-center rounded-full font-bold"
      style={{ background: t.bg, color: t.fg }}
    >
      {letter}
    </span>
  )
}

function LoadingBlocks() {
  return (
    <div className="flex flex-col gap-[22px]" aria-busy="true" aria-label="Memuat ringkasan">
      <Skeleton h={132} r={22} />
      <Skeleton h={18} w={240} r={6} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={72} r={22} />
        ))}
      </div>
    </div>
  )
}
