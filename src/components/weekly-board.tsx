'use client'

import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DAY_LABELS_ID, DAY_SHORT_ID } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { CalendarRange, GripVertical, Plus } from 'lucide-react'

/**
 * Papan mingguan (8 Sep 2026): tujuh lajur hari (Senin–Minggu) ditambah satu
 * lajur "Capaian mingguan" untuk hal yang tidak terikat hari. Kartu bisa
 * diseret antar lajur dan diurutkan di dalam lajur; tombol ubah/hapus di tiap
 * kartu dirender pemanggil. Komponen ini tidak tahu apa isi kartu — task
 * proyek dan item divisi sama-sama memakainya.
 *
 * Seret-lepas memakai @dnd-kit: sensor pointer + sentuh (ponsel) + papan
 * ketik (aksesibilitas). Setelah dilepas, pemanggil menerima daftar `moves`
 * (kartu, lajur tujuan, urutan) untuk disimpan ke server; papan langsung
 * menampilkan susunan baru supaya terasa ringan. Pemanggil mengganti `key`
 * komponen ini setiap kali data dari server berubah, sehingga susunan lokal
 * selalu disetel ulang dari data yang benar.
 */

export const WEEKLY_LANE = 'MINGGUAN'

export type BoardCard = { id: string; lane: string }

export type BoardMove = { id: string; lane: string; index: number }

type LaneDef = { id: string; title: string; hint?: string; isToday?: boolean; weekend?: boolean }

/** Kunci hari WIB ("YYYY-MM-DD") dari sebuah instan ISO — tengah malam WIB
 *  tersimpan sebagai 17:00 UTC hari sebelumnya, jadi tidak boleh dipotong mentah. */
export function wibKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10)
}

function laneDefs(days: string[], today: string | null): LaneDef[] {
  const todayKey = today ? wibKey(today) : null
  const defs: LaneDef[] = days.map((iso, i) => {
    const key = wibKey(iso)
    return {
      id: key,
      title: `${DAY_LABELS_ID[i] ?? DAY_SHORT_ID[i]} ${Number(key.slice(8, 10))}`,
      isToday: key === todayKey,
      weekend: i >= 5,
    }
  })
  defs.push({ id: WEEKLY_LANE, title: 'Capaian mingguan', hint: 'Tanpa hari tertentu' })
  return defs
}

/** Signature of an arrangement, to tell a real move from a drop in place. */
export function boardSignature(cards: BoardCard[]): string {
  return cards.map((c) => `${c.id}:${c.lane}`).join('|')
}

/**
 * Pindahkan kartu ke lajur lain, tepat sebelum kartu yang sedang dilayangi
 * (atau di ujung lajur bila yang dilayangi adalah lajurnya sendiri). Murni,
 * supaya bisa diuji tanpa DOM.
 */
export function relocate<T extends BoardCard>(prev: T[], movingId: string, to: string, overId: string): T[] {
  const moving = prev.find((c) => c.id === movingId)
  if (!moving) return prev
  const rest = prev.filter((c) => c.id !== movingId)
  const target = rest.filter((c) => c.lane === to)
  const overIndex = target.findIndex((c) => c.id === overId)
  const insertAt = overIndex >= 0 ? overIndex : target.length
  const updated = { ...moving, lane: to } as T
  const out: T[] = []
  let placed = false
  let seen = 0
  for (const c of rest) {
    if (c.lane === to) {
      if (seen === insertAt && !placed) {
        out.push(updated)
        placed = true
      }
      seen += 1
    }
    out.push(c)
  }
  if (!placed) out.push(updated)
  return out
}

/**
 * Susunan setelah kartu dilepas di atas `overId` — kartu lain di lajur yang
 * sama (urutan bergeser seperti arrayMove) atau lajurnya sendiri (tetap).
 * Null bila kartunya tidak dikenal.
 */
export function reorderOnDrop<T extends BoardCard>(items: T[], activeId: string, overId: string): { next: T[]; lane: string } | null {
  const moving = items.find((c) => c.id === activeId)
  if (!moving) return null
  const lane = moving.lane
  const laneItems = items.filter((c) => c.lane === lane)
  const oldIndex = laneItems.findIndex((c) => c.id === activeId)
  const newIndex = laneItems.findIndex((c) => c.id === overId)
  const reordered = newIndex >= 0 && oldIndex !== newIndex ? arrayMove(laneItems, oldIndex, newIndex) : laneItems

  const next: T[] = []
  let inserted = false
  for (const c of items) {
    if (c.lane === lane) {
      if (!inserted) {
        next.push(...reordered)
        inserted = true
      }
    } else next.push(c)
  }
  if (!inserted) next.push(...reordered)
  return { next, lane }
}

/** Urutan baru lajur-lajur yang berubah, untuk dikirim ke server. */
export function movesFor(cards: BoardCard[], lanes: string[]): BoardMove[] {
  const moves: BoardMove[] = []
  for (const l of new Set(lanes)) {
    cards.filter((c) => c.lane === l).forEach((c, i) => moves.push({ id: c.id, lane: l, index: i }))
  }
  return moves
}

function Lane({
  lane,
  count,
  children,
  onAdd,
  disabled,
  active,
}: {
  lane: LaneDef
  count: number
  children: React.ReactNode
  onAdd?: () => void
  disabled: boolean
  active: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id, disabled })
  return (
    <section
      ref={setNodeRef}
      aria-label={lane.title}
      className={cn(
        'rounded-2xl border p-2.5 flex flex-col gap-2 min-h-[120px] transition-colors',
        lane.id === WEEKLY_LANE
          ? 'border-violet-500/30 bg-violet-500/5'
          : lane.isToday
            ? 'border-blue-500/40 bg-blue-500/5'
            : lane.weekend
              ? 'border-white/40 dark:border-white/5 bg-slate-500/5'
              : 'border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30',
        isOver && active && 'ring-2 ring-blue-500/50 bg-blue-500/10'
      )}
    >
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-sm font-semibold',
              lane.id === WEEKLY_LANE
                ? 'text-violet-700 dark:text-violet-300'
                : lane.isToday
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-slate-700 dark:text-slate-200'
            )}
          >
            {lane.id === WEEKLY_LANE && <CalendarRange className="inline h-4 w-4 -mt-0.5 mr-1" />}
            {lane.title}
            {lane.isToday && <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide">hari ini</span>}
          </div>
          {lane.hint && <div className="text-[11px] text-slate-500 dark:text-slate-400">{lane.hint}</div>}
        </div>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{count}</span>
        {onAdd && !disabled && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Tambah di ${lane.title}`}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-300 hover:bg-blue-500/10"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </header>
      <div className="flex flex-col gap-2 flex-1">{children}</div>
    </section>
  )
}

function SortableCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style = { transform: CSS.Translate.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={cn('relative', isDragging && 'opacity-40')}>
      {!disabled && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Seret untuk memindahkan"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-11 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className={cn(!disabled && 'pl-5')}>{children}</div>
    </div>
  )
}

export function WeeklyBoard<T extends BoardCard>({
  days,
  today,
  cards,
  disabled,
  renderCard,
  onMove,
  onAdd,
  emptyText = 'Belum ada capaian.',
}: {
  /** Tujuh hari Senin..Minggu (ISO, tengah malam WIB). */
  days: string[]
  today: string | null
  cards: T[]
  disabled: boolean
  renderCard: (card: T, dragging: boolean) => React.ReactNode
  /** Dipanggil setelah kartu dilepas, dengan urutan baru seluruh lajur yang berubah. */
  onMove: (moves: BoardMove[], next: T[]) => void
  onAdd?: (lane: string) => void
  emptyText?: string
}) {
  const lanes = useMemo(() => laneDefs(days, today), [days, today])
  const [items, setItems] = useState<T[]>(cards)
  const [activeId, setActiveId] = useState<string | null>(null)
  const originLane = useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byLane = useMemo(() => {
    const map = new Map<string, T[]>()
    for (const l of lanes) map.set(l.id, [])
    for (const c of items) {
      if (!map.has(c.lane)) map.set(c.lane, [])
      map.get(c.lane)!.push(c)
    }
    return map
  }, [items, lanes])

  function laneOf(id: string): string | null {
    if (lanes.some((l) => l.id === id)) return id
    return items.find((c) => c.id === id)?.lane ?? null
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const from = laneOf(String(active.id))
    const to = laneOf(String(over.id))
    if (!from || !to || from === to) return
    // Pindah lajur saat melayang, supaya kartu terlihat masuk ke lajur tujuan.
    setItems((prev) => relocate(prev, String(active.id), to, String(over.id)))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    const from = originLane.current
    originLane.current = null
    if (!over) {
      setItems(cards)
      return
    }

    const dropped = reorderOnDrop(items, String(active.id), String(over.id))
    if (!dropped) return
    setItems(dropped.next)

    if (boardSignature(dropped.next) === boardSignature(cards)) return

    // Lajur asal dan tujuan dikirim utuh dengan urutan barunya.
    onMove(movesFor(dropped.next, [from ?? dropped.lane, dropped.lane]), dropped.next)
  }

  const activeCard = activeId ? (items.find((c) => c.id === activeId) ?? null) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => {
        setActiveId(String(e.active.id))
        originLane.current = laneOf(String(e.active.id))
      }}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        originLane.current = null
        setItems(cards)
      }}
    >
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => {
          const laneCards = byLane.get(lane.id) ?? []
          return (
            <SortableContext key={lane.id} id={lane.id} items={laneCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <Lane
                lane={lane}
                count={laneCards.length}
                disabled={disabled}
                active={activeId !== null}
                onAdd={onAdd ? () => onAdd(lane.id) : undefined}
              >
                {laneCards.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 px-1 py-2">{emptyText}</p>}
                {laneCards.map((c) => (
                  <SortableCard key={c.id} id={c.id} disabled={disabled}>
                    {renderCard(c, false)}
                  </SortableCard>
                ))}
              </Lane>
            </SortableContext>
          )
        })}
      </div>
      <DragOverlay>{activeCard ? <div className="rotate-1 shadow-2xl">{renderCard(activeCard, true)}</div> : null}</DragOverlay>
    </DndContext>
  )
}
