'use client'

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button, Card as MkCard, ErrorNote, Icon, IconButton, ProgressBar, Skeleton, StatusBadge, cx, type Status,
} from '@/components/mk'
import { useConfirm } from '@/components/companies/parts'
import { WeeklyBoard, WEEKLY_LANE, boardSignature, movesFor, wibKey, type BoardMove } from '@/components/weekly-board'
import { TaskDialog, TASK_STATUS_META, type ProjectOption, type TaskRecord } from '@/components/task-dialog'
import { URGENCY_META } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'

type WeekTask = TaskRecord & { workDate: string; scope: string; sortOrder: number }

type Data = {
  mode: 'MINGGUAN'
  period: { key: string; start: string; end: string; lockAt: string; current: boolean }
  locked: boolean
  today: string
  days: string[]
  tasks: WeekTask[]
  frozenDays?: string[]
}

type Card = WeekTask & { lane: string }

// Tanpa workDate (data pratinjau lama) kartu jatuh ke lajur mingguan, bukan galat RangeError.
const laneOf = (t: WeekTask) => (t.scope === 'MINGGUAN' || !t.workDate ? WEEKLY_LANE : wibKey(t.workDate))

const FROZEN_NOTE = 'Diteruskan ke holding · ajukan buka kunci'

/** Seluruh batch ditolak bila asal/tujuan beku, terkunci, atau kartu tidak dikenal. */
export function canMoveTasks(
  snapshot: Pick<Data, 'locked' | 'frozenDays' | 'days'>,
  cards: { id: string; lane: string }[],
  moves: BoardMove[],
): boolean {
  const frozen = new Set((snapshot.frozenDays ?? []).map(wibKey))
  const lanes = new Set([...snapshot.days.map(wibKey), WEEKLY_LANE])
  return !snapshot.locked && moves.length > 0 && moves.every((move) => {
    const source = cards.find((card) => card.id === move.id)
    return !!source && lanes.has(move.lane) && !frozen.has(source.lane) && !frozen.has(move.lane)
  })
}

/** Kunci minggu ISO ("2026-W37") untuk sebuah instan, dihitung dalam WIB. */
export function weekKeyOf(date: Date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 3600000)
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Kunci minggu yang bergeser `offset` minggu dari `key`. */
export function shiftWeekKey(key: string, offset: number): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(key)
  if (!m) return key
  const jan4 = Date.UTC(Number(m[1]), 0, 4)
  const dow = new Date(jan4).getUTCDay() || 7
  const monday = jan4 - (dow - 1) * 86400000 + (Number(m[2]) - 1 + offset) * 7 * 86400000
  // Senin 00:00 WIB sebagai instan UTC, lalu kunci minggunya.
  return weekKeyOf(new Date(monday - 7 * 3600000))
}

/** Status task → kosakata status desain (warna + ikon + kata). */
const TASK_STATUS: Record<string, Status> = {
  BELUM_MULAI: 'neutral',
  BERJALAN: 'on',
  SELESAI: 'done',
  TERKENDALA: 'risk',
  MENUNGGU_KEPUTUSAN: 'info',
}

/** Urgensi → nada tepi kartu dan titik label. */
const URGENCY_TONE: Record<string, 'late' | 'risk' | 'accent' | 'neutral'> = {
  KRITIS: 'late',
  TINGGI: 'risk',
  SEDANG: 'accent',
  RENDAH: 'neutral',
}

/** Kerangka memuat seukuran isi asli: navigasi minggu + empat lajur. */
function BoardSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat capaian mingguan">
      <div className="mk-card">
        <Skeleton h={20} w={180} />
        <div className="h-2" />
        <Skeleton h={14} w="60%" />
      </div>
      <div className="mk-wb">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={160} r={14} />
        ))}
      </div>
    </div>
  )
}

/**
 * Laporan mingguan seorang PIC = capaian task per hari (8 Sep 2026). Papan
 * ini memuat task minggu itu di lajur harinya masing-masing; kartu bisa
 * diseret antar hari, diubah, dihapus, dan ditambah — termasuk sebagai
 * "capaian mingguan" yang tidak terikat hari. Minggu yang sudah lewat kuncinya
 * (Jumat 17.00 WIB) hanya bisa dibaca.
 */
export function WeeklyTaskBoard({
  projectId,
  projectName,
  projects,
  weekKey,
  onWeekChange,
}: {
  projectId: string
  projectName: string
  projects?: ProjectOption[]
  weekKey: string
  onWeekChange: (key: string) => void
}) {
  const { data, loading, error, reload } = useResource<Data>(`/api/tasks?projectId=${projectId}&week=${weekKey}`)
  const [dialog, setDialog] = useState<{ task: WeekTask | null; lane: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [confirmEl, confirm] = useConfirm()
  const noteId = useId()
  // Urungkan dapat hidup lebih lama daripada render yang membuat toast.
  const current = useRef({ data, projectId, weekKey, loading, error })
  useLayoutEffect(() => {
    current.current = { data, projectId, weekKey, loading, error }
    return () => { current.current = { ...current.current, loading: true } }
  }, [data, projectId, weekKey, loading, error])

  const cards = useMemo<Card[]>(() => (data?.tasks ?? []).map((t) => ({ ...t, lane: laneOf(t) })), [data])

  if (loading && !data) return <BoardSkeleton />
  if (error || !data) return <ErrorNote message={error ?? 'Data capaian mingguan belum termuat.'} onRetry={reload} />

  const frozen = new Set((data.frozenDays ?? []).map(wibKey))
  const editableDays = data.days.filter((day) => !frozen.has(wibKey(day)))
  const editableCards = cards.filter((card) => !frozen.has(card.lane))
  const frozenSignature = [...frozen].sort().join(',')
  const dialogAllowed = dialog && data.period.key === weekKey && !data.locked && !loading && !frozen.has(dialog.lane)
    && (!dialog.task || !frozen.has(laneOf(data.tasks.find((t) => t.id === dialog.task!.id) ?? dialog.task)))

  function canEdit(lane: string, id?: string): boolean {
    const state = current.current
    if (!state.data || state.loading || state.error || state.projectId !== projectId || state.weekKey !== weekKey || state.data.locked) return false
    const lockedDays = new Set((state.data.frozenDays ?? []).map(wibKey))
    const source = id ? state.data.tasks.find((t) => t.id === id) : null
    return !lockedDays.has(lane) && (!id || (!!source && !lockedDays.has(laneOf(source))))
  }

  function openDialog(lane: string, task: WeekTask | null = null) {
    if (canEdit(lane, task?.id)) setDialog({ task, lane })
  }

  const done = data.tasks.filter((t) => t.status === 'SELESAI').length
  const blocked = data.tasks.filter((t) => t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN').length
  const avg = data.tasks.length ? Math.round(data.tasks.reduce((s, t) => s + t.progressPct, 0) / data.tasks.length) : 0
  const weekNo = Number(data.period.key.split('-W')[1])
  const answer =
    data.tasks.length === 0
      ? `Belum ada capaian di minggu ${weekNo}.`
      : `${done} dari ${data.tasks.length} capaian minggu ${weekNo} sudah selesai.`

  /** Kirim susunan ke server; true bila tersimpan. */
  async function persist(moves: BoardMove[]): Promise<boolean> {
    const state = current.current
    if (!state.data || state.loading || state.error || state.projectId !== projectId || state.weekKey !== weekKey
      || state.data.period.key !== data!.period.key
      || !canMoveTasks(state.data, state.data.tasks.map((t) => ({ id: t.id, lane: laneOf(t) })), moves)) {
      toast.error('Susunan tidak dapat diubah. Periksa kunci hari dan muat ulang papan.')
      setVersion((v) => v + 1)
      return false
    }
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          week: data!.period.key,
          moves: moves.map((m) => ({ id: m.id, lane: m.lane, sortOrder: m.index })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Kartu belum berpindah. Coba lagi.')
        return false
      }
      return true
    } catch {
      toast.error('Tidak dapat menghubungi server.')
      return false
    } finally {
      setVersion((v) => v + 1)
      reload()
    }
  }

  async function move(moves: BoardMove[]) {
    // Susunan sebelum dipindah, untuk "Urungkan": lajur yang sama, urutan lama.
    const sourceLanes = moves.map((m) => cards.find((c) => c.id === m.id)?.lane).filter((lane): lane is string => !!lane)
    const undo = movesFor(cards, [...sourceLanes, ...moves.map((m) => m.lane)])
    if (!(await persist(moves))) return
    toast('Susunan tersimpan.', {
      action: {
        label: 'Urungkan',
        onClick: () => {
          void persist(undo).then((ok) => ok && toast('Susunan dikembalikan.'))
        },
      },
    })
  }

  async function remove(t: WeekTask) {
    if (!canEdit(laneOf(t), t.id)) return
    const ok = await confirm({
      title: 'Hapus capaian ini?',
      description: `"${t.title}" beserta lampirannya akan dihapus permanen.`,
      confirmLabel: 'Hapus capaian',
      destructive: true,
    })
    if (!ok || !canEdit(laneOf(t), t.id)) return
    setBusy(t.id)
    try {
      const res = await fetch(`/api/tasks?id=${t.id}&context=MINGGUAN`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(json.error || 'Capaian belum terhapus.')
      else {
        toast.success('Capaian dihapus.')
        reload()
      }
    } catch {
      toast.error('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cx('space-y-3', loading && 'opacity-60 pointer-events-none transition-opacity')} aria-busy={loading || undefined}>
      {/* Navigasi minggu + ringkasan */}
      <MkCard>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-1">
            <IconButton icon="kiri" label="Minggu sebelumnya" onClick={() => onWeekChange(shiftWeekKey(data.period.key, -1))} />
            <div className="min-w-0 px-1">
              <div className="t-headline text-ink flex items-center gap-2">
                Minggu {weekNo}
                {data.period.current && <span className="t-caption font-semibold text-accent">Berjalan</span>}
              </div>
              <div className="t-footnote text-ink-2">
                {formatDate(data.period.start)}–{formatDate(data.period.end)} ·{' '}
                {data.locked ? `dikunci ${formatDateTime(data.period.lockAt)}` : `kunci ${formatDateTime(data.period.lockAt)}`}
              </div>
            </div>
            <IconButton
              icon="kanan"
              label="Minggu berikutnya"
              disabled={data.period.current}
              onClick={() => onWeekChange(shiftWeekKey(data.period.key, 1))}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="t-body-strong text-ink">{answer}</p>
            <div className="mk-wb-sum">
              <span>
                <strong>{data.tasks.length}</strong> capaian
              </span>
              <span>
                <strong>{done}</strong> selesai
              </span>
              {blocked > 0 && (
                <span className="mk-text--risk">
                  <strong className="mk-text--risk">{blocked}</strong> terhambat
                </span>
              )}
              <span className="mk-wb-sum__bar">
                <ProgressBar value={avg} label="Rata-rata progres minggu ini" />
              </span>
            </div>
          </div>
          {!data.locked ? (
            <Button variant="primary" icon="tambah" onClick={() => openDialog(frozen.has(wibKey(data.today)) ? WEEKLY_LANE : wibKey(data.today))}>
              Tambah capaian
            </Button>
          ) : (
            <p className="mk-wb-note is-neutral">
              <Icon name="kunci" size={16} />
              <span>Minggu terkunci, hanya dapat dibaca.</span>
            </p>
          )}
        </div>
      </MkCard>

      {!data.locked && (
        <p className="t-footnote text-ink-2 px-1">
          Seret pegangan ⋮ untuk memindahkan capaian antar hari atau ke lajur mingguan. Di ponsel, tahan kartu sebentar lalu geser.
        </p>
      )}

      {/* WeeklyBoard belum memiliki API kunci per lajur. Lajur beku dikeluarkan
          dari kartu interaktif dan ditampilkan sebagai bagian baca-saja. Hari
          tetap utuh agar label hari/weekend pada WeeklyBoard tidak bergeser. */}
      <div className={cx('mk-weekly-task-editable', ...data.days.flatMap((day, index) => frozen.has(wibKey(day)) ? [`has-frozen-${index + 1}`] : []))}>
        <WeeklyBoard<Card>
          key={`${data.period.key}:${version}:${frozenSignature}:${boardSignature(cards)}`}
          days={data.days}
          today={data.today}
          cards={editableCards}
          disabled={data.locked || loading}
          onMove={move}
          onAdd={(lane) => openDialog(lane)}
          emptyText="Belum ada capaian."
          renderCard={(t, dragging) => (
            <TaskCard
              task={t}
              dragging={dragging}
              locked={data.locked || frozen.has(t.lane)}
              busy={busy === t.id}
              onEdit={() => openDialog(t.lane, t)}
              onDelete={() => remove(t)}
            />
          )}
        />
      </div>

      {frozen.size > 0 && (
        <div className="mk-wb" aria-label="Hari yang dibekukan">
          {data.days.filter((day) => frozen.has(wibKey(day))).map((day) => {
            const lane = wibKey(day)
            const laneCards = cards.filter((card) => card.lane === lane)
            const descriptionId = `${noteId}-${lane}`
            return (
              <section key={lane} className="mk-wb-lane mk-wt-frozen" tabIndex={0}
                aria-label={`${formatDate(day)} · hanya dapat dibaca`} aria-describedby={descriptionId}>
                <header className="mk-wb-lane__head">
                  <span className="mk-wb-lane__title">{formatDate(day)}</span>
                  <span className="mk-wb-lane__count" aria-label={`${laneCards.length} kartu`}>{laneCards.length}</span>
                </header>
                <p id={descriptionId} className="mk-wt-frozen__note"><Icon name="kunci" size={16} /><span>{FROZEN_NOTE}</span></p>
                <div className="mk-wb-lane__body">
                  {laneCards.length === 0 && <p className="mk-wb-lane__empty">Belum ada capaian.</p>}
                  {laneCards.map((t) => (
                    <div key={t.id} aria-describedby={descriptionId}>
                      <TaskCard task={t} dragging={false} locked busy={false} onEdit={() => {}} onDelete={() => {}} />
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {dialogAllowed && dialog && (
        <TaskDialog
          key={`${dialog.task?.id ?? `baru-${dialog.lane}`}:${data.period.key}:${frozenSignature}`}
          open
          onOpenChange={(v) => !v && setDialog(null)}
          projectId={projectId}
          projectName={projectName}
          projects={projects}
          task={dialog.task}
          locked={data.locked}
          onSaved={reload}
          weekly={{ week: data.period.key, days: editableDays, lane: dialog.lane }}
        />
      )}
      {confirmEl}
    </div>
  )
}

function TaskCard({
  task: t,
  dragging,
  locked,
  busy,
  onEdit,
  onDelete,
}: {
  task: Card
  dragging: boolean
  locked: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.BELUM_MULAI
  const urg = URGENCY_META[t.urgency] ?? URGENCY_META.SEDANG
  const urgTone = URGENCY_TONE[t.urgency] ?? 'accent'
  const subDone = t.subtasks.filter((s) => s.isDone).length
  const files = t.evidence?.length ?? 0
  return (
    <article className={cx('mk-wb-card', `is-${urgTone}`, dragging && 'is-dragging')} aria-label={t.title}>
      <div className="mk-wb-card__top">
        <div className="mk-wb-card__title">{t.title}</div>
        <StatusBadge status={TASK_STATUS[t.status] ?? 'neutral'} size="sm" className="shrink-0">
          {meta.label}
        </StatusBadge>
      </div>
      <div className="mk-wb-card__meta">
        <span>
          <span className={cx('mk-dot', `mk-bg--${urgTone}`)} aria-hidden /> Urgensi {urg.label.toLowerCase()}
        </span>
        {t.picName && <span>PIC {t.picName}</span>}
        {t.subtasks.length > 0 && (
          <span aria-label={`${subDone} dari ${t.subtasks.length} langkah selesai`}>
            <Icon name="persetujuan" size={14} /> {subDone}/{t.subtasks.length}
          </span>
        )}
        {files > 0 && (
          <span className="mk-text--done" aria-label={`${files} bukti`}>
            <Icon name="dokumen" size={14} /> {files}
          </span>
        )}
      </div>
      <ProgressBar value={t.progressPct} label={`Progres ${t.title}`} />
      {(t.obstacle || t.decisionNeeded) && (
        <p className="mk-wb-note mk-wb-note--clamp is-late">
          <Icon name="peringatan" size={14} />
          <span>{t.obstacle ?? t.decisionNeeded}</span>
        </p>
      )}
      {!locked && !dragging && (
        <div className="mk-wb-card__actions">
          <Button size="sm" icon="catatan" className="mk-wk-tap" onClick={onEdit}>
            Ubah capaian
          </Button>
          {!t.escalationId && (
            <Button size="sm" variant="plain" className="mk-wk-tap" onClick={onDelete} disabled={busy} aria-busy={busy || undefined}>
              {busy ? 'Menghapus…' : 'Hapus'}
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
