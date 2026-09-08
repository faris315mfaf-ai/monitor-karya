'use client'

import { useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, ErrorState } from '@/components/loading-states'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { WeeklyBoard, WEEKLY_LANE, boardSignature, wibKey, type BoardMove } from '@/components/weekly-board'
import { TaskDialog, TASK_STATUS_META, type ProjectOption, type TaskRecord } from '@/components/task-dialog'
import { URGENCY_META } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Loader2, Lock, Paperclip, Plus,
  SquarePen, Trash2,
} from 'lucide-react'

type WeekTask = TaskRecord & { workDate: string; scope: string; sortOrder: number }

type Data = {
  mode: 'MINGGUAN'
  period: { key: string; start: string; end: string; lockAt: string; current: boolean }
  locked: boolean
  today: string
  days: string[]
  tasks: WeekTask[]
}

type Card = WeekTask & { lane: string }

const laneOf = (t: WeekTask) => (t.scope === 'MINGGUAN' ? WEEKLY_LANE : wibKey(t.workDate))

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
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const cards = useMemo<Card[]>(() => (data?.tasks ?? []).map((t) => ({ ...t, lane: laneOf(t) })), [data])

  if (loading) return <LoadingSpinner className="py-8" />
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} />

  const done = data.tasks.filter((t) => t.status === 'SELESAI').length
  const blocked = data.tasks.filter((t) => t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN').length
  const avg = data.tasks.length ? Math.round(data.tasks.reduce((s, t) => s + t.progressPct, 0) / data.tasks.length) : 0
  const weekNo = Number(data.period.key.split('-W')[1])

  async function move(moves: BoardMove[]) {
    setMsg(null)
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
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal memindahkan kartu' })
      else setMsg({ kind: 'ok', text: 'Susunan tersimpan.' })
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setVersion((v) => v + 1)
      reload()
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Hapus capaian ini beserta lampirannya?')) return
    setBusy(id)
    setMsg(null)
    try {
      const res = await fetch(`/api/tasks?id=${id}&context=MINGGUAN`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal menghapus' })
      else reload()
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Navigasi minggu + ringkasan */}
      <div className="glass rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="Minggu sebelumnya" onClick={() => onWeekChange(shiftWeekKey(data.period.key, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 px-1">
            <div className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-tight">
              Minggu {weekNo}
              {data.period.current && (
                <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5">
                  Berjalan
                </span>
              )}
            </div>
            <div className="text-[13px] text-slate-500 dark:text-slate-400">
              {formatDate(data.period.start)} – {formatDate(data.period.end)} ·{' '}
              {data.locked ? `dikunci ${formatDateTime(data.period.lockAt)}` : `kunci ${formatDateTime(data.period.lockAt)}`}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Minggu berikutnya"
            disabled={data.period.current}
            onClick={() => onWeekChange(shiftWeekKey(data.period.key, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          <span>
            <strong className="text-slate-800 dark:text-slate-100">{data.tasks.length}</strong> capaian
          </span>
          <span>
            <strong className="text-emerald-600">{done}</strong> selesai
          </span>
          {blocked > 0 && (
            <span>
              <strong className="text-rose-600">{blocked}</strong> terhambat
            </span>
          )}
          <span className="flex items-center gap-2 min-w-[120px]">
            <Progress value={avg} className="h-1.5 flex-1" /> <span className="tabular-nums">{avg}%</span>
          </span>
        </div>
        {!data.locked ? (
          <Button
            onClick={() => setDialog({ task: null, lane: wibKey(data.today) })}
            className="h-11 bg-gradient-to-r from-blue-600 to-blue-500 text-white"
          >
            <Plus className="h-5 w-5" /> Tambah capaian
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-rose-700 dark:text-rose-300">
            <Lock className="h-4 w-4" /> Minggu terkunci
          </span>
        )}
      </div>

      {msg && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg p-2.5 text-[13px]',
            msg.kind === 'ok'
              ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300'
          )}
        >
          {msg.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}

      {!data.locked && (
        <p className="text-[13px] text-slate-500 dark:text-slate-400 px-1">
          Seret pegangan ⋮ untuk memindahkan capaian antar hari atau ke lajur mingguan. Di ponsel, tahan kartu sebentar lalu geser.
        </p>
      )}

      <WeeklyBoard<Card>
        key={`${data.period.key}:${version}:${boardSignature(cards)}`}
        days={data.days}
        today={data.today}
        cards={cards}
        disabled={data.locked}
        onMove={move}
        onAdd={(lane) => setDialog({ task: null, lane })}
        emptyText="Belum ada capaian."
        renderCard={(t, dragging) => (
          <TaskCard
            task={t}
            dragging={dragging}
            locked={data.locked}
            busy={busy === t.id}
            onEdit={() => setDialog({ task: t, lane: t.lane })}
            onDelete={() => remove(t.id)}
          />
        )}
      />

      {dialog && (
        <TaskDialog
          key={dialog.task?.id ?? `baru-${dialog.lane}`}
          open
          onOpenChange={(v) => !v && setDialog(null)}
          projectId={projectId}
          projectName={projectName}
          projects={projects}
          task={dialog.task}
          locked={data.locked}
          onSaved={reload}
          weekly={{ week: data.period.key, days: data.days, lane: dialog.lane }}
        />
      )}
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
  const subDone = t.subtasks.filter((s) => s.isDone).length
  return (
    <div
      className={cn(
        'glass rounded-xl p-3 space-y-2 border-l-4',
        t.urgency === 'KRITIS'
          ? 'border-l-rose-500'
          : t.urgency === 'TINGGI'
            ? 'border-l-amber-500'
            : t.urgency === 'RENDAH'
              ? 'border-l-slate-300 dark:border-l-slate-600'
              : 'border-l-blue-500',
        dragging && 'ring-2 ring-blue-500/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{t.title}</div>
        <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full', meta.chip)}>{meta.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className={cn('inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full', urg.bg, urg.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', urg.dot)} /> {urg.label}
        </span>
        {t.picName && <span>PIC {t.picName}</span>}
        {t.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" /> {subDone}/{t.subtasks.length}
          </span>
        )}
        {(t.evidence?.length ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Paperclip className="h-3.5 w-3.5" /> {t.evidence!.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Progress value={t.progressPct} className="h-1.5 flex-1" />
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{t.progressPct}%</span>
      </div>
      {(t.obstacle || t.decisionNeeded) && (
        <p className="text-xs rounded-md bg-rose-500/10 border border-rose-500/25 px-2 py-1 text-rose-700 dark:text-rose-300 line-clamp-2">
          {t.obstacle ?? t.decisionNeeded}
        </p>
      )}
      {!locked && !dragging && (
        <div className="flex gap-1.5 pt-0.5">
          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={onEdit}>
            <SquarePen className="h-3.5 w-3.5" /> Ubah
          </Button>
          {!t.escalationId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 text-slate-500 hover:text-rose-600"
              aria-label="Hapus capaian"
              onClick={onDelete}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
