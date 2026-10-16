'use client'

/**
 * Isi panel konten layar tablet & desktop (D4):
 * - Semua: Sorotan (grid kartu) + kartu ringkas per subholding (3 teratas, klik → pilih).
 * - Subholding/PT: kepala (inisial, nama, meta), sorotan, laporan per PT
 *   (foto asli + lencana jumlah, judul, 2 baris deskripsi, jam · pelapor).
 * - 7 hari: tabel subholding×hari (atau PT×hari) + sorotan 7 hari.
 */

import { useId, useLayoutEffect, useRef } from 'react'
import { ErrorNote, Icon, Skeleton, cx } from '@/components/mk'
import { timeLabel } from '../detail-logic'
import { displayName, photosOf, subholdingLabel, toneOf, toneVars, type Tone } from '../logic'
import { dayLabel, type Filter, type FlatV2, type V2Data, type WeekData } from '../model'
import type { OverviewRange } from '../screen-types'
import {
  heatCells, ptBlocks, ptShort, reportMeta, scopeMeta, subCards, weekHighlights, weekRangeLabel, weekRows,
  type PaneMode, type SubCard,
} from './logic'
import { FOCUS_RING, Mono, PRESS, PhotoBox, SectionHead, Star } from './parts'

const GRID = 'grid items-start gap-3.5 grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]'
const CARD = 'rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]'

export type ContentActions = {
  /** Ganti penyaring dari dalam isi (fokus pindah ke kepala isi baru). */
  pick: (f: Filter) => void
  open: (r: FlatV2) => void
  photo: (r: FlatV2, index: number) => void
}

function pad(mode: PaneMode) {
  return mode === 'three' ? 'px-7 pt-7 pb-10' : 'px-6 pt-6 pb-10'
}

/* ---------- Semua subholding (hari) ---------- */

export function AllView({
  mode,
  data,
  list,
  act,
}: {
  mode: PaneMode
  data: V2Data
  list: FlatV2[]
  act: ContentActions
}) {
  const uid = useId()
  const hi = list.filter((r) => r.highlight)
  const cards = subCards(data, list)
  return (
    <div className={cx('flex flex-col gap-[26px]', pad(mode))}>
      <section aria-labelledby={`${uid}-so`} className="flex flex-col gap-3">
        <div data-pane-focus tabIndex={-1} className="outline-none">
          <SectionHead id={`${uid}-so`} title="Sorotan" aside={hi.length ? `${hi.length} perlu perhatian` : undefined} />
        </div>
        {hi.length ? (
          <div className={GRID}>
            {hi.map((r) => (
              <HighlightCard key={r.id} r={r} onOpen={() => act.open(r)} />
            ))}
          </div>
        ) : (
          <p className={cx(CARD, 'm-0 px-4 py-3.5 t-callout font-normal text-ink-2')}>Tidak ada sorotan untuk tanggal ini.</p>
        )}
      </section>

      <section aria-labelledby={`${uid}-all`} className="flex flex-col gap-3">
        <SectionHead id={`${uid}-all`} title="Semua laporan" aside={`${list.length} laporan disetujui`} />
        <div className={GRID}>
          {cards.map((c) => (
            <SubCardButton key={c.id} c={c} onPick={() => act.pick({ sub: c.id, pt: null })} />
          ))}
        </div>
      </section>
    </div>
  )
}

function HighlightCard({ r, onOpen }: { r: FlatV2; onOpen: () => void }) {
  const photos = photosOf(r.evidence)
  const jam = timeLabel(r.decidedAt ?? null)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(CARD, 'flex cursor-pointer flex-col gap-2.5 p-4 text-left', PRESS, FOCUS_RING)}
    >
      <span className="flex w-full items-center gap-2">
        <Mono name={subholdingLabel(r.subName)} tone={toneOf(r.subId)} size={22} />
        <span className="min-w-0 flex-1 truncate t-caption text-ink-2">{subholdingLabel(r.subName)}</span>
        <Star size={14} label="Sorotan" />
      </span>
      <span className="flex w-full items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="t-headline leading-[1.3] text-ink">{r.kegiatan}</span>
          <span className="t-caption font-normal text-ink-2">{[ptShort(r.ptName), jam].filter(Boolean).join(' · ')}</span>
        </span>
        {photos[0] ? <PhotoBox photo={photos[0]} size={56} count={photos.length} /> : null}
      </span>
      {r.highlightNote?.trim() ? <Note>{r.highlightNote}</Note> : null}
    </button>
  )
}

function SubCardButton({ c, onPick }: { c: SubCard; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cx(CARD, 'flex cursor-pointer flex-col px-4 pt-3.5 pb-1.5 text-left', PRESS, FOCUS_RING)}
    >
      <span className="flex w-full items-center gap-2.5 pb-2">
        <Mono name={c.name} tone={c.tone} size={26} />
        <span className="min-w-0 flex-1 truncate t-body-strong text-ink">{c.name}</span>
        {c.count ? <span className="t-caption font-normal text-ink-2">{c.count} laporan</span> : null}
        <Icon name="kanan" size={14} strokeWidth={2.2} className="shrink-0 text-ink-3" />
      </span>
      {c.top.map((r) => (
        <span key={r.id} className="flex w-full items-center gap-1.5 border-t border-line py-2 t-callout font-normal text-ink">
          {r.highlight ? <Star size={11} label="Sorotan" /> : null}
          <span className="min-w-0 flex-1 truncate">{r.kegiatan}</span>
          <span className="shrink-0 t-caption font-normal text-ink-2">{timeLabel(r.decidedAt ?? null)}</span>
        </span>
      ))}
      {c.empty ? (
        <span className="border-t border-line pt-2 pb-2.5 t-callout font-normal text-waspada">Belum ada laporan disetujui</span>
      ) : null}
    </button>
  )
}

/* ---------- Subholding / PT terpilih (hari) ---------- */

export function ScopeView({
  mode,
  range,
  crumb,
  title,
  tone,
  list,
  ptDone,
  ptTotal,
  ptSelected,
  act,
}: {
  mode: PaneMode
  range: OverviewRange
  crumb: string
  title: string
  tone: Tone
  list: FlatV2[]
  ptDone?: number
  ptTotal?: number
  ptSelected: boolean
  act: ContentActions
}) {
  const hi = list.filter((r) => r.highlight)
  const blocks = ptBlocks(list)
  const meta = scopeMeta({ reports: list.length, highlights: hi.length, ptDone, ptTotal: ptSelected ? undefined : ptTotal, range })
  const subId = list[0]?.subId
  return (
    <div className={cx('flex flex-col gap-5', pad(mode))}>
      <ScopeHead crumb={crumb} title={title} tone={tone} meta={meta} />

      {hi.length ? (
        <section aria-label="Sorotan" className="flex flex-col gap-2.5">
          {hi.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => act.open(r)}
              className={cx(CARD, 'flex cursor-pointer flex-col gap-2 px-4 py-3.5 text-left', PRESS, FOCUS_RING)}
            >
              <span className="flex items-center gap-1.5 t-caption font-bold text-waspada">
                <Star size={12} />
                Sorotan
                <span className="min-w-0 truncate font-medium text-ink-2">· {displayName(r.ptName)}</span>
              </span>
              <span className="t-headline text-ink">{r.kegiatan}</span>
              {r.highlightNote?.trim() ? <Note>{r.highlightNote}</Note> : null}
            </button>
          ))}
        </section>
      ) : null}

      {blocks.map((b) => (
        <section key={b.ptId || b.ptName} aria-label={displayName(b.ptName)} className="flex flex-col gap-2">
          {!ptSelected && subId ? (
            <button
              type="button"
              onClick={() => act.pick({ sub: subId, pt: b.ptId })}
              className={cx(
                '-my-2.5 inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-[var(--radius-xs)] t-footnote font-semibold text-ink-2 hover:text-ink',
                FOCUS_RING
              )}
            >
              {displayName(b.ptName)}
              <Icon name="kanan" size={12} strokeWidth={2.2} />
            </button>
          ) : null}
          <ul className={cx(CARD, 'm-0 list-none overflow-hidden p-0')}>
            {b.reports.map((r, i) => (
              <ReportRow key={r.id} r={r} first={i === 0} size={mode === 'three' ? 64 : 56} act={act} />
            ))}
          </ul>
        </section>
      ))}

      {list.length === 0 ? (
        <p className={cx(CARD, 'm-0 p-[18px] t-body text-waspada')}>
          {ptSelected
            ? `PT ini belum memiliki laporan disetujui ${range === 'yesterday' ? 'kemarin' : 'hari ini'}.`
            : `Subholding ini belum memiliki laporan disetujui ${range === 'yesterday' ? 'kemarin' : 'hari ini'}.`}
        </p>
      ) : null}
    </div>
  )
}

function ScopeHead({ crumb, title, tone, meta }: { crumb: string; title: string; tone: Tone; meta: string }) {
  return (
    <header className="flex items-center gap-4">
      <Mono name={title} tone={tone} size={52} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate t-footnote text-ink-2">{crumb}</span>
        <h2 data-pane-focus tabIndex={-1} className="m-0 t-title-2 tracking-[-0.02em] break-words text-ink outline-none">
          {title}
        </h2>
        <span className="t-callout font-normal text-ink-2">{meta}</span>
      </div>
    </header>
  )
}

function ReportRow({ r, first, size, act }: { r: FlatV2; first: boolean; size: number; act: ContentActions }) {
  const photos = photosOf(r.evidence)
  const meta = reportMeta(r)
  return (
    <li className={cx('flex items-start gap-3.5 px-4 py-3.5', !first && 'border-t border-line')}>
      {photos[0] ? (
        <button
          type="button"
          onClick={() => act.photo(r, 0)}
          aria-label={`Perbesar foto ${r.kegiatan}, ${photos.length} foto`}
          className={cx(
            'shrink-0 cursor-zoom-in rounded-[12px] hover:opacity-90',
            'motion-safe:transition-[transform,opacity] motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.96]',
            FOCUS_RING
          )}
        >
          <PhotoBox photo={photos[0]} size={size} count={photos.length} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => act.open(r)}
        className={cx(
          'group flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 rounded-[var(--radius-xs)] text-left',
          'motion-safe:transition-opacity motion-safe:duration-[var(--dur-fast)] active:opacity-70',
          FOCUS_RING
        )}
      >
        <span className="flex max-w-full items-start gap-1.5 t-headline text-ink">
          {r.highlight ? <Star size={12} label="Sorotan" className="mt-[0.4em] shrink-0" /> : null}
          <span className="min-w-0 underline-offset-4 group-hover:underline">{r.kegiatan}</span>
        </span>
        {r.deskripsi?.trim() ? (
          <span className="line-clamp-2 t-callout font-normal leading-[1.45] text-ink-2">{r.deskripsi}</span>
        ) : null}
        {meta ? <span className="t-caption font-normal text-ink-2">{meta}</span> : null}
      </button>
    </li>
  )
}

/* ---------- 7 hari ---------- */

export function WeekView({
  mode,
  week,
  filter,
  loading,
  error,
  reload,
  head,
  ptName,
}: {
  mode: PaneMode
  week: WeekData | null
  filter: Filter
  loading: boolean
  error: string | null
  reload: () => void
  /** Kepala bila subholding dipilih. */
  head: { crumb: string; title: string; tone: Tone } | null
  ptName: string
}) {
  const uid = useId()
  const { level, rows } = weekRows(week, filter)
  const his = weekHighlights(week, filter, ptName)
  const wide = mode === 'three'
  const cell = wide ? 'h-8 w-8 rounded-[9px]' : 'h-[30px] w-7 rounded-[8px]'
  // Kolom hari ini (paling kanan) harus terlihat tanpa menggeser: bila tabel
  // tetap lebih lebar dari panel, gulir awal diletakkan di ujung kanan.
  const scroller = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [week, filter.sub, filter.pt])
  const toneFor = (id: string): Tone => (level === 'pt' && head ? head.tone : toneOf(id))

  return (
    <div className={cx('flex flex-col gap-[26px]', pad(mode))}>
      {head ? (
        <ScopeHead
          crumb={head.crumb}
          title={head.title}
          tone={head.tone}
          meta={week ? `Pola 7 hari · ${weekRangeLabel(week.days)}` : 'Pola 7 hari'}
        />
      ) : null}

      <section aria-labelledby={`${uid}-wk`} className="flex flex-col gap-3">
        <div data-pane-focus={head ? undefined : true} tabIndex={head ? undefined : -1} className="outline-none">
          <SectionHead id={`${uid}-wk`} title="Pola melapor 7 hari" aside="Angka = laporan disetujui" />
        </div>
        {!week ? (
          loading || !error ? (
            <Skeleton h={260} r={22} />
          ) : (
            <div className={cx(CARD, 'p-4')}>
              <ErrorNote message={error} onRetry={reload} />
            </div>
          )
        ) : rows.length === 0 ? (
          <p className={cx(CARD, 'm-0 px-4 py-3.5 t-callout font-normal text-ink-2')}>Belum ada data 7 hari.</p>
        ) : (
          <div ref={scroller} className={cx(CARD, 'scrollbar-thin overflow-x-auto')}>
            <table className="w-full border-collapse t-callout font-normal">
              <caption className="sr-only">Jumlah laporan disetujui per hari, {weekRangeLabel(week.days)}</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-3 text-left t-caption font-semibold text-ink-2">
                    {level === 'pt' ? 'PT' : 'Subholding'}
                  </th>
                  {week.days.map((d, i) => (
                    <th
                      key={d}
                      scope="col"
                      className={cx(
                        'px-1 py-3 text-center t-caption font-semibold whitespace-nowrap',
                        i === week.days.length - 1 ? 'text-ink' : 'text-ink-2'
                      )}
                    >
                      <span className="flex flex-col items-center leading-tight">
                        <span>{dayLabel(d).short.split(' ')[0]}</span>
                        <span className="font-normal tabular-nums">{dayLabel(d).short.split(' ')[1]}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const t = toneVars(toneFor(w.id))
                  return (
                    <tr key={w.id} className="border-t border-line">
                      <th scope="row" className="w-full max-w-0 px-4 py-2.5 text-left font-semibold">
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-2 text-ink" title={w.name}>
                            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.fg }} />
                            <span className="min-w-0 truncate">{w.name}</span>
                          </span>
                          <span
                            className={cx(
                              't-caption',
                              w.note.tone === 'muted' ? 'font-normal text-ink-2' : 'text-waspada',
                              w.note.tone === 'strong-warn' ? 'font-bold' : 'font-normal'
                            )}
                          >
                            {w.note.text}
                          </span>
                        </span>
                      </th>
                      {heatCells(week.days, w.counts).map((c) => (
                        <td key={c.key} className={cx('py-1.5 text-center', wide ? 'px-1' : 'px-0.5')}>
                          <span
                            aria-label={c.aria}
                            role="img"
                            className={cx(
                              'inline-flex items-center justify-center t-footnote font-bold tabular-nums text-ink',
                              cell,
                              c.kind === 'gap' && 'shadow-[inset_0_0_0_1.5px_var(--waspada)]',
                              c.kind === 'weekend' && 'bg-fill-1 opacity-40'
                            )}
                            style={
                              c.kind === 'filled'
                                ? { background: `color-mix(in srgb, ${t.fg} ${c.pct}%, transparent)` }
                                : undefined
                            }
                          >
                            {c.count > 0 ? c.count : ''}
                          </span>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-wh`} className="flex flex-col gap-3">
        <h2 id={`${uid}-wh`} className="m-0 t-title-3 font-bold tracking-[-0.015em] text-ink">
          Sorotan 7 hari
        </h2>
        {week && his.length ? (
          <ul className={cx(CARD, 'm-0 list-none overflow-hidden p-0')}>
            {his.map((h, i) => (
              <li key={h.id} className={cx('flex items-baseline gap-4 px-4 py-3', i > 0 && 'border-t border-line')}>
                <span className={cx('shrink-0 t-footnote text-ink-2', wide ? 'w-[88px]' : 'w-[76px]')}>{h.day}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="inline-flex items-baseline gap-1.5 t-body-strong text-ink">
                    <Star size={11} className="translate-y-px" />
                    <span className="min-w-0">{h.kegiatan}</span>
                  </span>
                  {h.highlightNote?.trim() ? (
                    <span className="line-clamp-2 t-footnote text-ink-2">{h.highlightNote}</span>
                  ) : null}
                </span>
                <span className="max-w-[40%] shrink-0 truncate text-right t-footnote text-ink-2">
                  {filter.sub ? ptShort(h.ptName) : h.subShort}
                </span>
              </li>
            ))}
          </ul>
        ) : week ? (
          <p className={cx(CARD, 'm-0 px-4 py-3.5 t-callout font-normal text-ink-2')}>Tidak ada sorotan dalam 7 hari ini.</p>
        ) : (
          <Skeleton h={120} r={22} />
        )}
      </section>
    </div>
  )
}

/* ---------- Bantu ---------- */

function Note({ children }: { children: string | null | undefined }) {
  return (
    <span className="block w-full rounded-[12px] bg-waspada-soft px-3 py-2.5 t-footnote leading-[1.45] text-ink">{children}</span>
  )
}

/** Kerangka isi saat data pertama dimuat. */
export function ContentSkeleton({ mode }: { mode: PaneMode }) {
  return (
    <div className={cx('flex flex-col gap-5', pad(mode))} aria-busy="true" aria-label="Memuat laporan">
      <Skeleton h={28} w={160} r={8} />
      <div className={GRID}>
        {[180, 150, 170].map((h, i) => (
          <Skeleton key={i} h={h} r={22} />
        ))}
      </div>
      <Skeleton h={28} w={200} r={8} />
      <div className={GRID}>
        {[160, 160].map((h, i) => (
          <Skeleton key={i} h={h} r={22} />
        ))}
      </div>
    </div>
  )
}
