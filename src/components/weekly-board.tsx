'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { Icon, IconButton, cx } from '@/components/mk'

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
  const weekly = lane.id === WEEKLY_LANE
  return (
    <section
      ref={setNodeRef}
      aria-label={lane.title}
      className={cx(
        'mk-wb-lane',
        weekly ? 'is-weekly' : lane.isToday ? 'is-today' : lane.weekend && 'is-weekend',
        isOver && active && 'is-over'
      )}
    >
      <header className="mk-wb-lane__head">
        <div className="min-w-0 flex-1">
          <div className="mk-wb-lane__title">
            {weekly && <Icon name="kalender" size={16} />}
            <span>{lane.title}</span>
            {lane.isToday && <span className="mk-wb-lane__today">Hari ini</span>}
          </div>
          {lane.hint && <div className="mk-wb-lane__hint">{lane.hint}</div>}
        </div>
        <span className="mk-wb-lane__count" aria-label={`${count} kartu`}>
          {count}
        </span>
        {onAdd && !disabled && <IconButton icon="tambah" label={`Tambah capaian di ${lane.title}`} onClick={onAdd} />}
      </header>
      <LaneBody count={count}>{children}</LaneBody>
    </section>
  )
}

/** Kartu yang terlihat sekaligus per lajur; sisanya digulir di dalam lajur. */
const VISIBLE_CARDS = 3

/**
 * Isi lajur: tinggi dibatasi setinggi {@link VISIBLE_CARDS} kartu pertama
 * (diukur, karena tinggi kartu berbeda-beda), lebihnya digulir di dalam lajur
 * supaya papan tidak memanjang. Kartu yang dibuka detailnya ikut terukur ulang.
 */
function LaneBody({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [maxH, setMaxH] = useState<number | null>(null)
  const [atEnd, setAtEnd] = useState(false)
  const scrolls = count > VISIBLE_CARDS

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !scrolls) {
      setMaxH(null)
      return
    }
    const measure = () => {
      const kids = Array.from(el.children) as HTMLElement[]
      const last = kids[VISIBLE_CARDS - 1]
      if (!last || !kids[0]) return
      // Bawah kartu ke-3 ditambah sedikit intipan kartu ke-4 sebagai tanda masih ada lagi.
      const h = last.offsetTop + last.offsetHeight - kids[0].offsetTop + 28
      setMaxH(h)
    }
    measure()
    const ro = new ResizeObserver(measure)
    Array.from(el.children).forEach((k) => ro.observe(k))
    return () => ro.disconnect()
  }, [scrolls, count])

  return (
    <>
      <div
        ref={ref}
        className={cx('mk-wb-lane__body', scrolls && 'is-scroll', scrolls && atEnd && 'is-end')}
        style={scrolls && maxH ? { maxHeight: maxH } : undefined}
        tabIndex={scrolls ? 0 : undefined}
        role={scrolls ? 'region' : undefined}
        aria-label={scrolls ? `${count} kartu, gulir untuk melihat semua` : undefined}
        onScroll={(e) => {
          const t = e.currentTarget
          setAtEnd(t.scrollTop + t.clientHeight >= t.scrollHeight - 4)
        }}
      >
        {children}
      </div>
      {scrolls && !atEnd && (
        <div className="mk-wb-lane__more" aria-hidden>
          +{count - VISIBLE_CARDS} kartu lagi · gulir
        </div>
      )}
    </>
  )
}

function SortableCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style = { transform: CSS.Translate.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={cx('mk-wb-sortable', !disabled && 'has-grip', isDragging && 'is-dragging')}>
      {!disabled && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Seret untuk memindahkan"
          className="mk-wb-grip"
        >
          <Icon name="lainnya" size={18} strokeWidth={2.4} style={{ transform: 'rotate(90deg)' }} />
        </button>
      )}
      <div className="mk-wb-sortable__body">{children}</div>
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
      <div className="mk-wb">
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
                {laneCards.length === 0 && <p className="mk-wb-lane__empty">{emptyText}</p>}
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
      <DragOverlay>{activeCard ? <div className="mk-wb-overlay">{renderCard(activeCard, true)}</div> : null}</DragOverlay>
    </DndContext>
  )
}
