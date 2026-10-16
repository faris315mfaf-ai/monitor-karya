'use client'

/**
 * Pola 7 hari ponsel (papan M-Ponsel-7Hari): tiap subholding (atau tiap PT bila
 * subholding dipilih) satu baris tujuh kotak dengan huruf hari di kepala.
 * Intensitas isian sesuai jumlah laporan disetujui; hari kerja kosong bergaris
 * peringatan, akhir pekan pudar; catatan baris dari `weekNote`. Lalu
 * "Sorotan 7 hari".
 */

import { useId } from 'react'
import { EmptyNote, cx } from '@/components/mk'
import { dayLabel, weekNote, type Filter, type WeekData } from '../model'
import { subholdingLabel, toneVars } from '../logic'
import { shortDay, shortRange, weekAria, weekCell, weekHighlights, weekRows } from './mobile-logic'
import { Star } from './report-screen'

export function WeekPattern({ week, filter, ptName }: { week: WeekData; filter: Filter; ptName: string | null }) {
  const patternId = useId()
  const hiId = useId()
  const rows = weekRows(week, filter)
  const highlights = weekHighlights(week, filter, ptName)
  const last = week.days.length - 1

  return (
    <>
      <section aria-labelledby={patternId} className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between px-1">
          <h2 id={patternId} className="t-title-3 m-0 font-bold text-ink">
            Pola melapor
          </h2>
          <span className="t-footnote text-ink-2">{shortRange(week.start, week.end)}</span>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-lg)] bg-surface">
          <div className="flex items-center gap-2.5 px-4 pb-1.5 pt-2.5">
            <span className="flex-1" />
            <div aria-hidden className="flex gap-[5px]">
              {week.days.map((d, i) => (
                <span key={d} className={cx('t-caption w-[22px] text-center font-semibold', i === last ? 'text-ink' : 'text-ink-2')}>
                  {dayLabel(d).letter}
                </span>
              ))}
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="t-callout m-0 px-4 pb-3.5 pt-1 font-normal text-ink-2 shadow-[inset_0_1px_0_var(--line)]">Belum ada data 7 hari.</p>
          ) : (
            rows.map((row) => {
              const note = weekNote(week.days, row.counts)
              const tone = toneVars(row.tone)
              return (
                <div key={row.id} className="flex flex-col gap-1 px-4 pb-3 pt-2.5 shadow-[inset_0_1px_0_var(--line)]">
                  <div className="flex items-center gap-2.5">
                    <span className="t-body flex min-w-0 flex-1 items-center gap-2 font-semibold text-ink">
                      <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: tone.fg }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <div role="img" aria-label={weekAria(row.name, week.days, row.counts)} className="flex flex-none gap-[5px]">
                      {week.days.map((d, i) => {
                        const c = weekCell(row.counts[i] ?? 0, d)
                        return (
                          <span
                            key={d}
                            className={cx(
                              't-caption flex h-[22px] w-[22px] items-center justify-center rounded-[var(--radius-xs)] font-bold tabular-nums',
                              c.kind === 'rest' && 'bg-fill-2 opacity-40',
                              c.kind === 'gap' && 'shadow-[inset_0_0_0_1.5px_var(--waspada)]',
                              c.kind === 'filled' && (c.strong ? 'text-[var(--putih)]' : 'text-ink'),
                            )}
                            style={
                              c.kind === 'filled'
                                ? { background: `color-mix(in srgb, ${tone.fg} ${Math.round(c.alpha * 100)}%, transparent)` }
                                : undefined
                            }
                          >
                            {c.count || ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <span
                    className={cx(
                      't-caption',
                      note.tone === 'muted' ? 'font-normal text-ink-2' : 'text-waspada',
                      note.tone === 'strong-warn' ? 'font-bold' : note.tone === 'warn' && 'font-normal',
                    )}
                  >
                    {note.text}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section aria-labelledby={hiId} className="flex flex-col gap-2.5">
        <h2 id={hiId} className="t-title-3 m-0 px-1 font-bold text-ink">
          Sorotan 7 hari
        </h2>
        {highlights.length === 0 ? (
          <EmptyNote>Tidak ada sorotan dalam 7 hari ini.</EmptyNote>
        ) : (
          <ul className="m-0 list-none overflow-hidden rounded-[var(--radius-lg)] bg-surface p-0">
            {highlights.map((h, i) => (
              <li key={h.id} className={cx('flex flex-col gap-0.5 px-4 py-[11px]', i > 0 && 'shadow-[inset_0_1px_0_var(--line)]')}>
                <span className="t-body flex items-start gap-1.5 font-semibold text-ink">
                  <Star size={12} className="mt-[5px] text-waspada" />
                  <span className="sr-only">Sorotan: </span>
                  <span>{h.kegiatan}</span>
                </span>
                <span className="t-caption font-normal text-ink-2">
                  {shortDay(h.date)} · {filter.sub ? h.ptName : subholdingLabel(h.subholdingName)}
                </span>
                {h.highlightNote ? (
                  <span className="t-footnote mt-1 line-clamp-2 rounded-[var(--radius-sm)] bg-waspada-soft px-2.5 py-1.5 text-ink">{h.highlightNote}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
