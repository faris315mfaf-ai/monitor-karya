'use client'

/**
 * Dashboard Manajemen & Superuser — ponsel < 600px (KONTRAK-MANAJEMEN-MOBILE.md
 * D3; papan M-Ponsel-Hari, M-Ponsel-Rincian, M-Ponsel-7Hari, F-Ponsel*).
 *
 * Tiga lapis: status melapor → sorotan supervisor → semua laporan, dengan
 * penyaring subholding → PT (lembar pemilih yang bisa diseret tutup) dan
 * rincian layar penuh yang didorong dari kanan. Navigasi bawah milik shell;
 * layar ini tidak membuat tab bar sendiri.
 */

import { useId, useMemo, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { EmptyNote, ErrorNote, Icon, Skeleton, cx } from '@/components/mk'
import { PullToRefresh } from '@/components/mk/pull-refresh'
import { EvidenceLightbox, type LightboxState } from '../evidence'
import { CoverageSection, CoverageTiles, jumpToCoverage } from '../coverage'
import { displayName, photosOf, toneOf, toneVars } from '../logic'
import { NO_FILTER, coverageCounts, ptBuckets, ptCoverage, statusSummary, type CoverageTab, type Filter, type FlatV2 } from '../model'
import type { OverviewRange, OverviewScreenProps } from '../screen-types'
import {
  addDays, backLabel, buildGroups, dayHeading, findSub, highlightCards, missingSentence, monoOf, progressPct,
  ptNameOf, ptSections, ptShort, ptTotal, rowMeta, screenHeading, subSections, subShort, subShorts, weekRangeLabel,
  type ListGroup,
} from './mobile-logic'
import { PhotoTile } from './photo'
import { PickerSheet } from './picker-sheet'
import { ReportScreen, Star } from './report-screen'
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
  const [covTab, setCovTab] = useState<CoverageTab>('semua')
  const ids = { status: useId(), sorotan: useId(), list: useId() }

  const sub = findSub(data, filter.sub)
  const heading = screenHeading(data, filter)
  const ptName = ptNameOf(sub, filter.pt)
  const isWeek = range === 'week'
  const summary = useMemo(() => statusSummary(data, filter), [data, filter])
  const list = useMemo(() => buildGroups(data, filter, range), [data, filter, range])
  const sorotan = useMemo(() => highlightCards(data, filter), [data, filter])
  const buckets = useMemo(() => ptBuckets(findSub(data, filter.sub)), [data, filter.sub])
  const reportingPts = buckets.reporting
  const coverage = useMemo(() => ptCoverage(data, filter), [data, filter])

  const dateLine = isWeek ? weekRangeLabel(week?.start ?? addDays(dateKey, -6), week?.end ?? dateKey) : dayHeading(dateKey)

  const openSheet = (k: 'sub' | 'pt') => {
    setQuery('')
    setSheet(k)
  }
  const pick = (f: Filter) => {
    onFilter(f)
  }
  // Ketuk PT "sudah melapor": persempit daftar laporan, lalu bawa pengguna ke daftar itu.
  const openPt = (subId: string, ptId: string) => {
    onFilter({ sub: subId, pt: ptId })
    requestAnimationFrame(() => {
      const el = document.getElementById(ids.list)
      if (!el) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    })
  }
  const pickTile = (t: 'sudah' | 'belum') => {
    setCovTab(t)
    jumpToCoverage()
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
          {/* Kepala: tanggal kecil, judul besar, segmen rentang, penyaring */}
          <header className="flex flex-col gap-3.5 px-1">
            <div className="flex flex-col gap-0.5">
              <span className="t-footnote font-semibold text-ink-2">{dateLine}</span>
              <h1 className="t-title-1 m-0 break-words text-ink">{heading}</h1>
            </div>
            <RangeControl value={range} onChange={onRange} />
            <div className="flex flex-wrap items-center gap-2">
              <FilterButton
                active={Boolean(sub)}
                onClick={() => openSheet('sub')}
                lead={
                  sub ? (
                    <Mono letter={monoOf(sub.name)} tone={toneOf(sub.id)} size="sm" />
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
                  onClick={() => pick(NO_FILTER)}
                  className={cx('t-callout min-h-11 rounded-full px-1.5 font-semibold text-accent', FOCUS)}
                >
                  Reset
                </button>
              ) : null}
            </div>
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
          ) : !data && loading ? (
            <LoadingBlocks />
          ) : !data || data.subholdings.length === 0 ? (
            <EmptyNote icon="gedung">Belum ada subholding dalam cakupan Anda.</EmptyNote>
          ) : (
            <>
              {/* Kartu status melapor */}
              <section aria-labelledby={ids.status} className="flex flex-col gap-3.5 rounded-[var(--radius-lg)] bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <h2 id={ids.status} className="t-headline m-0 min-w-0 font-bold text-ink">
                    {summary.level === 'sub'
                      ? `${summary.done} dari ${summary.total} melapor`
                      : summary.level === 'pt'
                        ? `${summary.done} dari ${summary.total} PT melapor`
                        : ptName ?? heading}
                  </h2>
                  <span className="t-footnote flex-none text-ink-2">
                    {summary.level === 'sub'
                      ? `${summary.reports} laporan disetujui`
                      : summary.level === 'pt'
                        ? `${summary.reports} laporan`
                        : `${summary.reports} laporan ${range === 'yesterday' ? 'kemarin' : 'hari ini'}`}
                  </span>
                </div>
                {summary.level === 'sub' ? (
                  <StatusCircles data={data.subholdings} onPick={(id) => pick({ sub: id, pt: null })} />
                ) : (
                  <div
                    role="progressbar"
                    aria-label="PT yang sudah melapor"
                    aria-valuemin={0}
                    aria-valuemax={summary.total}
                    aria-valuenow={summary.done}
                    className="h-2 overflow-hidden rounded-full bg-fill-2"
                  >
                    <motion.div
                      className="h-full origin-left rounded-full bg-sukses"
                      initial={false}
                      animate={{ scaleX: progressPct(summary.done, summary.total) / 100 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
                    />
                  </div>
                )}
                {summary.level === 'sub' && summary.missing.length ? (
                  <div className="t-footnote flex items-center gap-2 rounded-[var(--radius-md)] bg-waspada-soft px-3 py-2.5 text-ink">
                    <Icon name="peringatan" size={16} strokeWidth={2.2} className="flex-none text-waspada" />
                    <span>{missingSentence(summary.missing, range)}</span>
                  </div>
                ) : null}
                {summary.level === 'one' && summary.reports === 0 ? (
                  <span className="t-footnote text-waspada">Belum melapor {range === 'yesterday' ? 'kemarin' : 'hari ini'}</span>
                ) : null}
              </section>

              {/* Ubin pintasan + kategori PT sudah / belum melapor (lintas subholding) */}
              <CoverageTiles counts={coverageCounts(coverage)} tab={covTab} onPick={pickTile} />
              <CoverageSection
                coverage={coverage}
                tab={covTab}
                onTab={setCovTab}
                dateKey={dateKey}
                range={range}
                onOpenPt={openPt}
              />

              {/* Chip PT (subholding dipilih, tanpa PT) */}
              {sub && !filter.pt && reportingPts.length > 0 ? (
                <div role="group" aria-label="PT yang melapor" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                  <Chip pressed label="Semua PT" count={summary.reports} onClick={() => pick({ sub: sub.id, pt: null })} />
                  {reportingPts.map((p) => (
                    <Chip key={p.id} pressed={false} label={ptShort(p.name)} count={p.count} onClick={() => pick({ sub: sub.id, pt: p.id })} />
                  ))}
                </div>
              ) : null}

              {/* Sorotan supervisor */}
              <section aria-labelledby={ids.sorotan} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between px-1">
                  <h2 id={ids.sorotan} className="t-title-3 m-0 font-bold text-ink">
                    Sorotan
                  </h2>
                  {sorotan.length ? <span className="t-footnote text-ink-2">{sorotan.length} perlu perhatian</span> : null}
                </div>
                {sorotan.length ? (
                  <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1.5 pt-0.5 [scrollbar-width:none]">
                    {sorotan.map((r) => (
                      <SorotanCard key={r.id} report={r} where={r.where} single={sorotan.length === 1} onOpen={() => setDetail(r)} />
                    ))}
                  </div>
                ) : (
                  <p className="t-callout m-0 rounded-[var(--radius-md)] bg-surface px-4 py-3.5 font-normal text-ink-2">
                    Tidak ada sorotan untuk tanggal ini.
                  </p>
                )}
              </section>

              {/* Semua laporan */}
              <section aria-labelledby={ids.list} className="flex flex-col gap-2.5">
                <h2 id={ids.list} className="t-title-3 m-0 px-1 font-bold text-ink">
                  {list.title}
                </h2>
                {list.groups.length === 0 ? (
                  <EmptyNote>Belum ada laporan disetujui.</EmptyNote>
                ) : (
                  list.groups.map((g) => (
                    <ReportGroup key={g.key} group={g} level={list.level} onDrill={pick} onOpen={setDetail} />
                  ))
                )}
              </section>
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
          onPick={pick}
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

function Mono({ letter, tone, size }: { letter: string; tone: ReturnType<typeof toneOf>; size: 'sm' | 'md' | 'lg' }) {
  const t = toneVars(tone)
  return (
    <span
      aria-hidden
      className={cx(
        'flex flex-none items-center justify-center rounded-full font-bold',
        size === 'sm' && 't-caption h-6 w-6',
        size === 'md' && 't-caption h-[22px] w-[22px]',
        size === 'lg' && 't-headline h-11 w-11',
      )}
      style={{ background: t.bg, color: t.fg }}
    >
      {letter}
    </span>
  )
}

/** Baris lingkaran inisial subholding: lencana centang hijau (melapor) atau cincin peringatan. */
function StatusCircles({ data, onPick }: { data: { id: string; name: string; pts: { reports: unknown[] }[] }[]; onPick: (id: string) => void }) {
  const crowded = data.length > 5
  const shorts = subShorts(data.map((s) => s.name))
  return (
    <ul className={cx('m-0 flex list-none p-0', crowded ? '-mx-4 gap-1 overflow-x-auto px-4 [scrollbar-width:none]' : 'justify-between')}>
      {data.map((s, i) => {
        const done = s.pts.some((p) => p.reports.length > 0)
        const t = toneVars(toneOf(s.id))
        const short = shorts[i]
        return (
          <li key={s.id} className="flex-none">
            <button
              type="button"
              onClick={() => onPick(s.id)}
              aria-label={`${short}: ${done ? 'sudah melapor' : 'belum melapor'}. Tampilkan subholding ini`}
              className={cx('flex w-[62px] flex-col items-center gap-1.5 rounded-[var(--radius-md)] py-0.5', FOCUS)}
            >
              <span
                className="t-headline relative flex h-11 w-11 items-center justify-center rounded-full font-bold"
                style={done ? { background: t.bg, color: t.fg } : { color: t.fg, boxShadow: 'inset 0 0 0 2px var(--waspada)' }}
              >
                {monoOf(s.name)}
                <span
                  aria-hidden
                  className={cx(
                    'absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface',
                    done ? 'bg-sukses' : 'bg-waspada',
                  )}
                >
                  {done ? <Icon name="selesai" size={9} strokeWidth={4} className="text-surface" /> : null}
                </span>
              </span>
              <span className="t-caption w-full truncate text-center font-normal text-ink-2">{short}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Chip({ pressed, label, count, onClick }: { pressed: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={cx('flex min-h-11 flex-none items-center rounded-full', FOCUS)}>
      <span
        className={cx(
          't-footnote inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-semibold',
          pressed ? 'bg-grafit-fill text-on-grafit' : 'bg-surface text-ink',
        )}
      >
        {label}
        <span className="font-medium opacity-70">{count}</span>
      </span>
    </button>
  )
}

function SorotanCard({ report, where, single, onOpen }: { report: FlatV2; where: string; single: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex flex-none snap-start flex-col gap-2.5 rounded-[var(--radius-lg)] bg-surface p-3.5 text-left',
        single ? 'w-full' : 'w-[300px] max-w-[85vw]',
        FOCUS,
      )}
    >
      <span className="flex w-full items-center gap-2">
        <Mono letter={monoOf(report.subName)} tone={toneOf(report.subId)} size="md" />
        <span className="t-caption min-w-0 flex-1 truncate font-medium text-ink-2">{where}</span>
        <Star size={14} className="text-waspada" />
        <span className="sr-only">Sorotan</span>
      </span>
      <span className="flex w-full items-start gap-3">
        <span className="t-headline line-clamp-2 min-w-0 flex-1 font-semibold text-ink">{report.kegiatan}</span>
        <PhotoTile evidence={report.evidence} className="h-[52px] w-[52px] rounded-[var(--radius-sm)]" />
      </span>
      {report.highlightNote?.trim() ? (
        <span className="t-footnote line-clamp-3 w-full rounded-[var(--radius-sm)] bg-waspada-soft px-3 py-2.5 text-ink">
          <span className="sr-only">Catatan supervisor: </span>
          {report.highlightNote}
        </span>
      ) : null}
    </button>
  )
}

function ReportGroup({
  group,
  level,
  onDrill,
  onOpen,
}: {
  group: ListGroup
  level: 'sub' | 'pt' | 'one'
  onDrill: (f: Filter) => void
  onOpen: (r: FlatV2) => void
}) {
  const dot = toneVars(group.tone).fg
  const head = (
    <>
      <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1 truncate">{group.name}</span>
      {group.countLabel ? (
        <span className={cx('flex-none font-medium', group.rows.length === 0 && 'text-waspada')}>{group.countLabel}</span>
      ) : null}
      {group.drill ? <Icon name="kanan" size={12} strokeWidth={2.2} className="flex-none" /> : null}
    </>
  )
  const drill = group.drill
  return (
    <div className="flex flex-col gap-1">
      {drill ? (
        <button
          type="button"
          onClick={() => onDrill(drill)}
          className={cx('t-footnote flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-1 text-left font-semibold text-ink-2', FOCUS)}
        >
          {head}
        </button>
      ) : (
        <div className="t-footnote flex min-h-9 items-center gap-2 px-1 font-semibold text-ink-2">{head}</div>
      )}
      <div className="overflow-hidden rounded-[var(--radius-md)] bg-surface">
        {group.rows.length === 0 ? (
          <p className="t-body m-0 px-4 py-3.5 text-waspada">Belum ada laporan disetujui</p>
        ) : (
          group.rows.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r)}
              className={cx(
                'flex min-h-[60px] w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left active:bg-fill-1',
                i > 0 && 'shadow-[inset_0_1px_0_var(--line)]',
                FOCUS_IN,
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="t-body flex items-center gap-1.5 font-medium text-ink">
                  {r.highlight ? (
                    <>
                      <Star size={12} className="text-waspada" />
                      <span className="sr-only">Sorotan: </span>
                    </>
                  ) : null}
                  <span className="truncate">{r.kegiatan}</span>
                </span>
                <span className="t-caption truncate font-normal text-ink-2">{rowMeta(r, level)}</span>
              </span>
              <PhotoTile evidence={r.evidence} className="h-10 w-10 rounded-[var(--radius-sm)]" />
              <Icon name="kanan" size={14} strokeWidth={2} className="flex-none text-ink-3" />
            </button>
          ))
        )}
        {group.more > 0 && group.drill ? (
          <button
            type="button"
            onClick={() => onDrill(group.drill!)}
            className={cx('t-callout min-h-11 w-full font-semibold text-accent shadow-[inset_0_1px_0_var(--line)] active:bg-fill-1', FOCUS_IN)}
          >
            {group.moreLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function LoadingBlocks() {
  return (
    <div className="flex flex-col gap-[22px]" aria-busy="true" aria-label="Memuat ringkasan">
      <Skeleton h={132} r={22} />
      <div className="flex gap-3 overflow-hidden">
        <Skeleton h={156} w={300} r={22} className="flex-none" />
        <Skeleton h={156} w={300} r={22} className="flex-none" />
      </div>
      <Skeleton h={18} w={160} r={6} />
      <Skeleton h={180} r={14} />
      <Skeleton h={120} r={14} />
    </div>
  )
}
