'use client'

/**
 * Panel kiri layar tablet & desktop (D4): kepala ringkasan + rentang, kartu
 * status, navigasi subholding, daftar PT (cari + Melapor/Belum melapor +
 * lencana jumlah), dan pemilih subholding popover untuk tata letak dua panel.
 */

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { LayoutGroup } from 'framer-motion'
import { Icon, Skeleton, cx } from '@/components/mk'
import { displayName, type Tone } from '../logic'
import type { V2Subholding } from '../model'
import type { OverviewRange } from '../screen-types'
import { ptPanel, ptShort, type PtItem, type SubRow } from './logic'
import { ActiveBg, FOCUS_RING, FadeSwap, Mono, RangeControl, Star } from './parts'

/* ---------- Kepala & status ---------- */

export function SideHeader({
  context,
  range,
  onRange,
}: {
  context: string
  range: OverviewRange
  onRange: (r: OverviewRange) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-2">
        <span className="t-footnote font-semibold text-ink-2">{context}</span>
        <h1 className="m-0 t-title-2 tracking-[-0.025em] text-ink">Ringkasan</h1>
      </div>
      <div className="px-1">
        <RangeControl value={range} onChange={onRange} />
      </div>
    </div>
  )
}

export function StatusCard({ line, sub, tone }: { line: string; sub: string; tone: 'ok' | 'warn' }) {
  return (
    <div className="mx-1 flex flex-col gap-1 rounded-[var(--radius-md)] bg-surface px-3.5 py-3 shadow-[var(--shadow-card)]">
      <span className="t-body-strong font-bold text-ink">{line}</span>
      <span className={cx('inline-flex items-start gap-1 t-caption font-normal', tone === 'ok' ? 'text-sukses' : 'text-waspada')}>
        <Icon name={tone === 'ok' ? 'selesai' : 'peringatan'} size={13} strokeWidth={2.2} className="mt-px shrink-0" />
        <span>{sub}</span>
      </span>
    </div>
  )
}

/* ---------- Navigasi subholding ---------- */

export type AllRow = { line: string }

export function SubNav({
  rows,
  all,
  current,
  week,
  onPick,
}: {
  rows: SubRow[]
  all: AllRow
  current: string | null
  week: boolean
  onPick: (id: string | null) => void
}) {
  const uid = useId()
  return (
    <LayoutGroup id={`${uid}-sub`}>
      <nav aria-label="Pilih subholding" className="flex flex-col gap-0.5">
        <SubButton
          name="Semua subholding"
          mono="∑"
          tone={null}
          line={all.line}
          warn={false}
          dot={null}
          highlights={0}
          current={current === null}
          layoutId={`${uid}-aktif`}
          onClick={() => onPick(null)}
        />
        {rows.map((r) => (
          <SubButton
            key={r.id}
            name={r.name}
            tone={r.tone}
            line={r.line}
            warn={r.warn}
            dot={r.warn ? 'warn' : 'ok'}
            highlights={week ? 0 : r.highlights}
            current={current === r.id}
            layoutId={`${uid}-aktif`}
            onClick={() => onPick(r.id)}
          />
        ))}
      </nav>
    </LayoutGroup>
  )
}

function SubButton({
  name,
  mono,
  tone,
  line,
  warn,
  dot,
  highlights,
  current,
  layoutId,
  onClick,
}: {
  name: string
  mono?: string
  tone: Tone | null
  line: string
  warn: boolean
  dot: 'ok' | 'warn' | null
  highlights: number
  current: boolean
  layoutId: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
      className={cx(
        'relative flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[12px] px-2.5 py-1.5 text-left',
        !current && 'hover:bg-fill-1',
        'motion-safe:transition-[transform,background-color] motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.98]',
        FOCUS_RING
      )}
    >
      {current ? <ActiveBg layoutId={layoutId} className="rounded-[12px]" /> : null}
      <Mono name={name} text={mono} tone={tone} size={32} dot={dot} className="relative" />
      <span className="relative flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate t-callout font-semibold text-ink">{name}</span>
        <span className={cx('truncate t-caption font-normal', warn ? 'text-waspada' : 'text-ink-2')}>{line}</span>
      </span>
      {highlights > 0 ? (
        <span className="relative inline-flex shrink-0 items-center gap-[3px] t-caption font-bold text-waspada">
          <Star size={11} />
          <span>{highlights}</span>
          <span className="sr-only">sorotan</span>
        </span>
      ) : null}
    </button>
  )
}

export function SideSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} h={52} r={12} />
      ))}
    </div>
  )
}

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

/* ---------- Daftar PT ---------- */

/**
 * Isi panel PT: kepala ("PT" + "9 dari 25 melapor"), kolom cari, lalu daftar
 * bergulir sendiri. Pencarian kembali kosong saat subholding berganti.
 */
export function PtList({
  sub,
  range,
  current,
  onPick,
  top,
  className,
}: {
  sub: V2Subholding
  range: OverviewRange
  current: string | null
  onPick: (ptId: string | null) => void
  /** Isi di atas kepala PT (pemilih subholding di tata letak dua panel). */
  top?: ReactNode
  className?: string
}) {
  const uid = useId()
  const [search, setSearch] = useState<{ sub: string; q: string }>({ sub: sub.id, q: '' })
  const q = search.sub === sub.id ? search.q : ''
  const p = ptPanel(sub, q, range)

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="flex flex-none flex-col gap-2.5 px-3.5 pt-[22px] pb-2.5">
        {top}
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="m-0 t-headline font-bold text-ink">PT</h2>
          <span className="t-caption font-normal text-ink-2">{p.status}</span>
        </div>
        <label
          className={cx(
            'flex min-h-11 items-center gap-2 rounded-[11px] bg-fill-2 px-3',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]'
          )}
        >
          <Icon name="cari" size={15} strokeWidth={2.4} className="shrink-0 text-ink-2" />
          <input
            type="search"
            aria-label="Cari PT"
            placeholder="Cari PT"
            value={q}
            onChange={(e) => setSearch({ sub: sub.id, q: e.target.value })}
            className="min-w-0 flex-1 border-0 bg-transparent t-body-lg text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>
      <FadeSwap k={sub.id} className="flex-1">
        <LayoutGroup id={`${uid}-${sub.id}`}>
          <nav aria-label="Pilih PT" className="flex flex-col gap-3 px-2.5 pb-5">
            <div className="flex flex-col gap-1">
              <span className="px-1.5 py-1 t-caption font-semibold text-ink-2">{p.reportingTitle}</span>
              {p.showAll ? (
                <PtButton
                  name="Semua PT"
                  count={p.total}
                  strong
                  current={current === null}
                  layoutId={`${uid}-aktif`}
                  onClick={() => onPick(null)}
                />
              ) : null}
              {p.reporting.map((x) => (
                <PtRow key={x.id} item={x} current={current === x.id} layoutId={`${uid}-aktif`} onPick={onPick} strong />
              ))}
              {!p.showAll && p.reporting.length === 0 ? <ListNote>{q ? 'Tidak ada yang cocok.' : 'Belum ada PT yang melapor.'}</ListNote> : null}
            </div>
            <div className="flex flex-col gap-1">
              <span className="px-1.5 py-1 t-caption font-semibold text-waspada">{p.silentTitle}</span>
              {p.silent.map((x) => (
                <PtRow key={x.id} item={x} current={current === x.id} layoutId={`${uid}-aktif`} onPick={onPick} />
              ))}
              {p.silent.length === 0 ? <ListNote>{q ? 'Tidak ada yang cocok.' : 'Semua PT sudah melapor.'}</ListNote> : null}
            </div>
          </nav>
        </LayoutGroup>
      </FadeSwap>
    </div>
  )
}

function ListNote({ children }: { children: ReactNode }) {
  return <span className="px-2.5 py-1 t-footnote text-ink-2">{children}</span>
}

function PtRow({
  item,
  current,
  layoutId,
  onPick,
  strong,
}: {
  item: PtItem
  current: boolean
  layoutId: string
  onPick: (id: string) => void
  strong?: boolean
}) {
  return (
    <PtButton
      name={ptShort(item.name)}
      full={displayName(item.name)}
      count={item.count}
      strong={strong}
      current={current}
      layoutId={layoutId}
      onClick={() => onPick(item.id)}
    />
  )
}

function PtButton({
  name,
  full,
  count,
  strong,
  current,
  layoutId,
  onClick,
}: {
  name: string
  full?: string
  count: number
  strong?: boolean
  current: boolean
  layoutId: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      title={full}
      onClick={onClick}
      className={cx(
        'relative flex min-h-[46px] w-full cursor-pointer items-center gap-2.5 rounded-[11px] px-2.5 py-1.5 text-left',
        !current && 'hover:bg-fill-1',
        'motion-safe:transition-[transform,background-color] motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.98]',
        FOCUS_RING
      )}
    >
      {current ? <ActiveBg layoutId={layoutId} className="rounded-[11px]" /> : null}
      <span
        className={cx(
          'relative min-w-0 flex-1 truncate t-callout',
          strong ? 'font-semibold text-ink' : 'font-normal text-ink-2'
        )}
      >
        {name}
      </span>
      {count > 0 ? (
        <span
          className={cx(
            'relative flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-[7px] t-caption font-bold tabular-nums',
            current ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-fill-2 text-ink'
          )}
        >
          {count}
          <span className="sr-only"> laporan</span>
        </span>
      ) : null}
    </button>
  )
}
