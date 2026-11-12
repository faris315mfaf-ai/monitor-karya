'use client'

/**
 * Kepala halaman dashboard tablet & desktop (judul + kontrol tanggal) dan
 * pemilih subholding popover (dipakai juga layar Persetujuan Supervisor).
 */

import { useRef, useState, type KeyboardEvent } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Icon, cx } from '@/components/mk'
import { DateControl } from '../date-control'
import type { Tone } from '../logic'
import type { SubRow } from './logic'
import { FOCUS_RING, Mono } from './parts'

/* ---------- Kepala ---------- */

/** Kepala halaman (kedua tampilan): konteks + judul, kontrol tanggal di kanan. */
export function PageHeader({
  context,
  dateKey,
  todayKey,
  onDate,
}: {
  context: string
  dateKey: string
  todayKey: string
  onDate: (key: string) => void
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="t-footnote font-semibold text-ink-2">{context}</span>
        <h1 className="m-0 t-title-1 tracking-[-0.025em] text-ink">Laporan terbaru</h1>
      </div>
      <DateControl dateKey={dateKey} todayKey={todayKey} onDate={onDate} className="w-full max-w-[340px]" />
    </header>
  )
}

export type AllRow = { line: string }

/* ---------- Pemilih subholding (dua panel) ---------- */

export function SubPicker({
  rows,
  all,
  current,
  onPick,
}: {
  rows: SubRow[]
  all: AllRow
  current: SubRow | null
  onPick: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const options: Array<{ id: string | null; name: string; mono?: string; tone: Tone | null; line: string; warn: boolean }> = [
    { id: null, name: 'Semua subholding', mono: '∑', tone: null, line: all.line, warn: false },
    ...rows.map((r) => ({ id: r.id, name: r.name, tone: r.tone, line: r.line, warn: r.warn })),
  ]
  const curId = current?.id ?? null

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => {
      e.preventDefault()
      items[Math.max(0, Math.min(items.length - 1, i))]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(
            'flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] bg-surface py-1.5 pr-3 pl-2 text-left shadow-[var(--shadow-card)]',
            'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.98]',
            FOCUS_RING
          )}
        >
          <Mono name={current?.name ?? 'Semua'} text={current ? undefined : '∑'} tone={current?.tone ?? null} size={30} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="t-caption font-normal text-ink-2">Subholding</span>
            <span className="truncate t-body-strong text-ink">{current?.name ?? 'Semua subholding'}</span>
          </span>
          <Icon name="bawah" size={14} strokeWidth={2.4} className="shrink-0 text-ink-2" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Pilih subholding"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
            el?.focus()
          }}
          className={cx(
            'mk-popover w-[min(320px,calc(100vw-32px))]',
            'motion-safe:transition-[opacity,translate] motion-safe:duration-[var(--dur-base)] motion-safe:ease-[var(--ease-standard)]',
            'starting:opacity-0 motion-safe:starting:-translate-y-1'
          )}
        >
          <div
            ref={listRef}
            role="listbox"
            aria-label="Subholding"
            onKeyDown={move}
            className="scrollbar-thin flex flex-col gap-0.5 overflow-y-auto"
          >
            {options.map((o) => {
              const sel = o.id === curId
              return (
                <button
                  key={o.id ?? 'semua'}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  tabIndex={sel ? 0 : -1}
                  onClick={() => {
                    onPick(o.id)
                    setOpen(false)
                  }}
                  className={cx(
                    'flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left',
                    sel ? 'bg-fill-2' : 'hover:bg-fill-1',
                    FOCUS_RING
                  )}
                >
                  <Mono name={o.name} text={o.mono} tone={o.tone} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate t-callout font-semibold text-ink">{o.name}</span>
                    <span className={cx('truncate t-caption font-normal', o.warn ? 'text-waspada' : 'text-ink-2')}>{o.line}</span>
                  </span>
                  {sel ? <Icon name="selesai" size={16} strokeWidth={2.4} className="shrink-0 text-ink" /> : null}
                </button>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
