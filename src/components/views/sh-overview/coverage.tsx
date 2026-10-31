'use client'

/**
 * Kategori PT "Sudah melapor" / "Belum melapor" dashboard Manajemen &
 * Superuser (mockup MOCKUP-PELAPORAN-PT-DAN-PDF, layar A, B, C, F). Dipakai
 * bersama layar ponsel dan tablet:
 *  - CoverageTiles: dua ubin di bawah kartu status, pintasan ke tab.
 *  - CoverageTabs: segmen Semua / Sudah / Belum (tablist, panah kiri/kanan).
 *  - CoverageList: isi tab — Semua (3 belum + 4 sudah), Sudah (per
 *    subholding + PDF seluruh subholding), Belum (daftar datar lintas
 *    subholding dengan chip penyaring lokal).
 *  - CoverageSection: tabs + list dalam satu bagian (status tab dipegang layar).
 * Logika data: ptCoverage di model.ts. Hari kerja saja yang dihitung diam.
 */

import { useId, useState } from 'react'
import { Button, EmptyNote, Icon, StatusBadge, cx } from '@/components/mk'
import { shPdfHref } from '@/lib/subholding/pdf-href'
import { timeLabel } from './detail-logic'
import { displayName, subholdingLabel, toneOf } from './logic'
import {
  coverageCounts, groupBySub, lastReportLabel, silentDays, silentLabel,
  type Coverage, type CoverageReporting, type CoverageSilent, type CoverageTab,
} from './model'
import { PdfButton, PdfIconLink } from './pdf-link'
import type { OverviewRange } from './screen-types'
import { Mono, Star } from './tablet/parts'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const FOCUS_IN = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'

/** Batas baris di tab Semua. */
export const PREVIEW_SILENT = 3
export const PREVIEW_REPORTING = 4

const TABS: { value: CoverageTab; label: string }[] = [
  { value: 'semua', label: 'Semua' },
  { value: 'sudah', label: 'Sudah' },
  { value: 'belum', label: 'Belum' },
]

/** Id jangkar bagian kategori (untuk lompat dari ubin atau "Lihat semua"). */
export const COVERAGE_ANCHOR = 'sh-coverage'

/** Gulir ke bagian kategori dan pindahkan fokus ke tab terpilih. Gerak dikurangi → langsung. */
export function jumpToCoverage(): void {
  if (typeof document === 'undefined') return
  requestAnimationFrame(() => {
    const el = document.getElementById(COVERAGE_ANCHOR)
    if (!el) return
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true })
  })
}

/* ---------- Ubin ---------- */

/** Dua ubin (Sudah melapor, Belum melapor) — pintasan tab. */
export function CoverageTiles({
  counts,
  tab,
  onPick,
}: {
  counts: Record<CoverageTab, number>
  tab: CoverageTab
  onPick: (t: 'sudah' | 'belum') => void
}) {
  const tiles = [
    { value: 'sudah' as const, label: 'Sudah melapor', icon: 'selesai' as const, color: 'var(--sukses)', cls: 'text-sukses' },
    { value: 'belum' as const, label: 'Belum melapor', icon: 'peringatan' as const, color: 'var(--waspada)', cls: 'text-waspada' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => {
        const on = tab === t.value
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={on}
            aria-label={`${t.label}: ${counts[t.value]} PT. Tampilkan daftarnya`}
            onClick={() => onPick(t.value)}
            style={on ? { boxShadow: `inset 0 0 0 2px ${t.color}` } : undefined}
            className={cx(
              'flex min-h-[76px] flex-col items-start justify-between gap-1 rounded-[var(--radius-lg)] bg-surface p-3.5 text-left',
              !on && 'shadow-[var(--shadow-card)]',
              'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.98]',
              FOCUS,
            )}
          >
            <span className="t-footnote inline-flex items-center gap-1.5 font-semibold text-ink-2">
              <Icon name={t.icon} size={14} strokeWidth={2.4} className={t.cls} />
              {t.label}
            </span>
            <span className={cx('t-title-1 font-bold tabular-nums', t.cls)}>{counts[t.value]}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Tab ---------- */

const tabId = (base: string, t: CoverageTab) => `${base}-tab-${t}`

/** Segmen Semua / Sudah / Belum: tablist dengan fokus bergulir dan panah kiri/kanan. */
export function CoverageTabs({
  counts,
  tab,
  onTab,
  idBase,
  panelId,
}: {
  counts: Record<CoverageTab, number>
  tab: CoverageTab
  onTab: (t: CoverageTab) => void
  idBase: string
  panelId: string
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.value === tab)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    const to = TABS[next].value
    onTab(to)
    document.getElementById(tabId(idBase, to))?.focus()
  }
  return (
    <div role="tablist" aria-label="Kategori PT" onKeyDown={onKeyDown} className="flex rounded-[var(--radius-sm)] bg-fill-1 p-[3px]">
      {TABS.map((t) => {
        const on = t.value === tab
        return (
          <button
            key={t.value}
            id={tabId(idBase, t.value)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(t.value)}
            className={cx(
              't-callout flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] font-semibold',
              on ? 'bg-surface text-ink shadow-[var(--shadow-control)]' : 'text-ink-2',
              'motion-safe:transition-colors motion-safe:duration-[var(--dur-base)]',
              FOCUS_IN,
            )}
          >
            {t.label}
            <span
              className={cx(
                'font-semibold tabular-nums',
                t.value === 'sudah' ? 'text-sukses' : t.value === 'belum' ? 'text-waspada' : 'text-ink-2',
              )}
            >
              {counts[t.value]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Baris ---------- */

const subLine = (subName: string) => subholdingLabel(subName)

function ReportingRow({
  row,
  first,
  dateKey,
  onOpen,
  hideSub,
}: {
  row: CoverageReporting
  first: boolean
  dateKey: string
  onOpen: () => void
  hideSub?: boolean
}) {
  const name = displayName(row.name)
  const jam = timeLabel(row.lastAt)
  return (
    <li className={cx('flex items-center gap-1 pr-2', !first && 'shadow-[inset_0_1px_0_var(--line)]')}>
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          'flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-1 text-left active:bg-fill-1',
          FOCUS_IN,
        )}
      >
        <Mono name={row.subName} tone={toneOf(row.subId)} size={36} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="t-body line-clamp-2 font-medium text-ink">{name}</span>
          <span className="t-caption flex min-w-0 items-center gap-1 font-normal text-ink-2">
            <span className="truncate">
              {hideSub ? '' : `${subLine(row.subName)} · `}
              {row.count} laporan
            </span>
            {row.highlights > 0 ? (
              <span className="inline-flex flex-none items-center gap-1 font-semibold text-waspada">
                <span aria-hidden>·</span>
                <Star size={11} />
                Sorotan
              </span>
            ) : null}
          </span>
        </span>
        <StatusBadge status="done" size="sm" className="flex-none">
          {jam ? (
            <>
              <span className="sr-only">Disetujui terakhir pukul </span>
              {jam}
            </>
          ) : (
            'Disetujui'
          )}
        </StatusBadge>
        <Icon name="kanan" size={14} strokeWidth={2} className="flex-none text-ink-3" />
      </button>
      <PdfIconLink href={shPdfHref({ pt: row.id, date: dateKey })} label={`Lihat PDF ${name}`} />
    </li>
  )
}

function SilentRow({ row, first, dateKey, range }: { row: CoverageSilent; first: boolean; dateKey: string; range: OverviewRange }) {
  const days = silentDays(dateKey, row.lastReportDate)
  // Satu hari = baru terlewat (waspada, segitiga); lebih lama atau tak pernah = terlambat (bahaya, jam).
  const status = days === 1 || days === 0 ? 'risk' : 'late'
  return (
    <li className={cx('flex min-h-[60px] items-center gap-3 px-4 py-2.5', !first && 'shadow-[inset_0_1px_0_var(--line)]')}>
      <Mono name={row.subName} tone={toneOf(row.subId)} size={36} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-body line-clamp-2 font-medium text-ink">{displayName(row.name)}</span>
        <span className="t-caption line-clamp-2 font-normal text-ink-2">
          {subLine(row.subName)} · {lastReportLabel(row.lastReportDate)}
        </span>
      </span>
      <StatusBadge status={status} size="sm" className="flex-none">
        <span className="sr-only">Belum melapor: </span>
        {silentLabel(days, range)}
      </StatusBadge>
    </li>
  )
}

/* ---------- Kerangka daftar ---------- */

function CardList({ wide, children, label }: { wide?: boolean; children: React.ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className={cx(
        'm-0 list-none overflow-hidden bg-surface p-0',
        wide ? 'rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]' : 'rounded-[var(--radius-md)]',
      )}
    >
      {children}
    </ul>
  )
}

function Cap({ id, tone, title, aside }: { id?: string; tone?: 'ok' | 'warn'; title: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h3
        id={id}
        className={cx('t-footnote m-0 font-semibold', tone === 'ok' ? 'text-sukses' : tone === 'warn' ? 'text-waspada' : 'text-ink-2')}
      >
        {title}
      </h3>
      {aside ? <span className="t-footnote flex-none text-ink-2">{aside}</span> : null}
    </div>
  )
}

/* ---------- Isi tab ---------- */

export function CoverageList({
  coverage,
  tab,
  onTab,
  dateKey,
  range,
  onOpenPt,
  wide,
}: {
  coverage: Coverage
  tab: CoverageTab
  onTab: (t: CoverageTab) => void
  dateKey: string
  range: OverviewRange
  /** Ketuk baris "sudah": persempit daftar laporan ke PT itu. */
  onOpenPt: (subId: string, ptId: string) => void
  wide?: boolean
}) {
  const ids = { belum: useId(), sudah: useId() }
  const [chip, setChip] = useState<string | null>(null)
  const { reporting, silent } = coverage
  const when = range === 'yesterday' ? 'kemarin' : 'hari ini'

  if (coverage.total === 0) return <EmptyNote icon="gedung">Belum ada PT dalam cakupan ini.</EmptyNote>

  const showAll = (t: 'sudah' | 'belum') => {
    onTab(t)
    jumpToCoverage()
  }

  /* --- Belum --- */
  const subs = groupBySub(silent)
  const activeChip = chip && subs.some((g) => g.subId === chip) ? chip : null
  const silentShown = tab === 'belum' ? (activeChip ? silent.filter((p) => p.subId === activeChip) : silent) : silent.slice(0, PREVIEW_SILENT)
  const silentSection = (
    <section aria-labelledby={ids.belum} className="flex flex-col gap-2.5">
      <Cap
        id={ids.belum}
        tone="warn"
        title={`Belum melapor · ${silent.length} PT`}
        aside={tab === 'belum' ? undefined : 'semua subholding'}
      />
      {tab === 'belum' && subs.length > 1 ? (
        <div role="group" aria-label="Penyaring subholding" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <FilterChip pressed={activeChip === null} label="Semua" count={silent.length} onClick={() => setChip(null)} />
          {subs.map((g) => (
            <FilterChip
              key={g.subId}
              pressed={activeChip === g.subId}
              label={subholdingLabel(g.subName)}
              count={g.rows.length}
              onClick={() => setChip(g.subId)}
            />
          ))}
        </div>
      ) : null}
      {tab === 'belum' && silent.length > 0 ? (
        <p className="t-footnote m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-fill-1 px-3 py-2.5 text-ink-2">
          <Icon name="info" size={16} strokeWidth={2} className="mt-px flex-none" />
          <span>Hari kerja saja yang dihitung. Sabtu dan Minggu tidak menambah hitungan diam.</span>
        </p>
      ) : null}
      {silent.length === 0 ? (
        <EmptyNote done>Semua PT sudah melapor {when}.</EmptyNote>
      ) : (
        <CardList wide={wide} label="PT belum melapor">
          {silentShown.map((p, i) => (
            <SilentRow key={p.id} row={p} first={i === 0} dateKey={dateKey} range={range} />
          ))}
        </CardList>
      )}
      {tab === 'semua' && silent.length > PREVIEW_SILENT ? (
        <Button variant="secondary" full onClick={() => showAll('belum')}>
          {`Lihat semua ${silent.length} PT belum melapor`}
        </Button>
      ) : null}
    </section>
  )

  /* --- Sudah --- */
  const reportingShown = tab === 'semua' ? reporting.slice(0, PREVIEW_REPORTING) : reporting
  const reportingSection = (
    <section aria-labelledby={ids.sudah} className="flex flex-col gap-2.5">
      <Cap id={ids.sudah} tone="ok" title={`Sudah melapor · ${reporting.length} PT`} />
      {reporting.length === 0 ? (
        <EmptyNote>Belum ada PT yang laporannya disetujui {when}.</EmptyNote>
      ) : tab === 'semua' ? (
        <>
          <CardList wide={wide} label="PT sudah melapor">
            {reportingShown.map((p, i) => (
              <ReportingRow key={p.id} row={p} first={i === 0} dateKey={dateKey} onOpen={() => onOpenPt(p.subId, p.id)} />
            ))}
          </CardList>
          {reporting.length > PREVIEW_REPORTING ? (
            <Button variant="secondary" full onClick={() => showAll('sudah')}>
              {`Lihat semua ${reporting.length} PT sudah melapor`}
            </Button>
          ) : null}
        </>
      ) : (
        groupBySub(reporting).map((g) => {
          const label = subholdingLabel(g.subName)
          const full = /^sub-?holding\b/i.test(g.subName.trim()) ? displayName(g.subName) : `Subholding ${label}`
          return (
            <div key={g.subId} className="flex flex-col gap-2">
              <Cap title={label} aside={`${g.rows.length} PT`} />
              <CardList wide={wide} label={`PT sudah melapor, ${label}`}>
                {g.rows.map((p, i) => (
                  <ReportingRow key={p.id} row={p} first={i === 0} dateKey={dateKey} hideSub onOpen={() => onOpenPt(p.subId, p.id)} />
                ))}
              </CardList>
              <PdfButton href={shPdfHref({ sub: g.subId, date: dateKey })} variant="secondary" full>
                {`Lihat PDF seluruh ${full}`}
              </PdfButton>
            </div>
          )
        })
      )}
    </section>
  )

  return (
    <div className="flex flex-col gap-[22px]">
      {tab !== 'sudah' ? silentSection : null}
      {tab !== 'belum' ? reportingSection : null}
    </div>
  )
}

function FilterChip({ pressed, label, count, onClick }: { pressed: boolean; label: string; count: number; onClick: () => void }) {
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

/* ---------- Bagian lengkap ---------- */

/** Tab + isi. Status tab dipegang layar supaya ubin di atasnya bisa mengendalikannya. */
export function CoverageSection({
  coverage,
  tab,
  onTab,
  dateKey,
  range,
  onOpenPt,
  wide,
  title,
}: {
  coverage: Coverage
  tab: CoverageTab
  onTab: (t: CoverageTab) => void
  dateKey: string
  range: OverviewRange
  onOpenPt: (subId: string, ptId: string) => void
  wide?: boolean
  /** Judul bagian bila perlu (tablet); ponsel tanpa judul. */
  title?: string
}) {
  const base = useId()
  const panelId = `${base}-panel`
  const counts = coverageCounts(coverage)
  return (
    <section id={COVERAGE_ANCHOR} aria-label="Pelaporan PT" className="flex scroll-mt-4 flex-col gap-3.5">
      {title ? <h2 className="t-title-3 m-0 px-1 font-bold text-ink">{title}</h2> : null}
      <CoverageTabs counts={counts} tab={tab} onTab={onTab} idBase={base} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(base, tab)} tabIndex={-1} className="outline-none">
        <CoverageList coverage={coverage} tab={tab} onTab={onTab} dateKey={dateKey} range={range} onOpenPt={onOpenPt} wide={wide} />
      </div>
    </section>
  )
}
