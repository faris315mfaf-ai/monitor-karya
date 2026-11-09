'use client'

/**
 * Isi panel konten layar tablet & desktop rentang 7 hari (D4): tabel
 * subholding×hari (atau PT×hari) + sorotan 7 hari. Rentang hari memakai
 * opsi B (day-view.tsx).
 */

import { useId, useLayoutEffect, useRef } from 'react'
import { ErrorNote, Skeleton, cx } from '@/components/mk'
import { toneOf, toneVars, type Tone } from '../logic'
import { dayLabel, type Filter, type WeekData } from '../model'
import { heatCells, ptShort, weekHighlights, weekRangeLabel, weekRows, type PaneMode } from './logic'
import { Mono, SectionHead, Star } from './parts'

const CARD = 'rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]'

function pad(mode: PaneMode) {
  return mode === 'three' ? 'px-7 pt-7 pb-10' : 'px-6 pt-6 pb-10'
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
