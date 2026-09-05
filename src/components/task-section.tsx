'use client'

import { useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { TaskDialog, TASK_STATUS_META, type TaskRecord } from '@/components/task-dialog'
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, ListChecks, Paperclip, Plus,
  Siren, SquarePen, Trash2,
} from 'lucide-react'

type Data = {
  workDate: string
  locked: boolean
  tasks: (TaskRecord & {
    escalation: { id: string; status: string; needed: string; decisionText: string | null } | null
  })[]
}

const NEEDED_OPTIONS = [
  { value: 'KEPUTUSAN', label: 'Keputusan' },
  { value: 'ANGGARAN', label: 'Anggaran' },
  { value: 'DUKUNGAN_LINTAS_FUNGSI', label: 'Dukungan lintas fungsi' },
]

function timeRange(startAt: string | null, endAt: string | null) {
  if (!startAt) return null
  const fmt = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(11, 16)
  return endAt ? `${fmt(startAt)}–${fmt(endAt)}` : fmt(startAt)
}

/**
 * The task list under one project's daily report: what the PIC planned for
 * today, how far each item got, and the route to escalate one that is stuck.
 */
export function TaskSection({
  projectId,
  projectName,
  locked,
}: {
  projectId: string
  projectName: string
  locked: boolean
}) {
  const { data, loading, error, reload } = useResource<Data>(`/api/tasks?projectId=${projectId}`)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TaskRecord | null>(null)
  const [escalating, setEscalating] = useState<TaskRecord | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const tasks = data?.tasks ?? []
  const done = tasks.filter((t) => t.status === 'SELESAI').length
  const blocked = tasks.filter((t) => t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN')

  async function remove(id: string) {
    setBusy(id)
    try {
      await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
      reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Task hari ini
        </div>
        {tasks.length > 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {done}/{tasks.length} selesai
          </span>
        )}
        <div className="flex-1" />
        {!locked && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            className="bg-gradient-to-r from-blue-600 to-blue-500 text-white"
          >
            <Plus className="h-5 w-5" /> Tambah task
          </Button>
        )}
      </div>

      {loading && <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto my-3" />}
      {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      {!loading && tasks.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
          Belum ada task. Tambahkan rincian pekerjaan hari ini agar progres proyek terekam.
        </p>
      )}

      {tasks.map((t) => {
        const meta = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.BELUM_MULAI
        const range = timeRange(t.startAt, t.endAt)
        const subDone = t.subtasks.filter((s) => s.isDone).length
        const canEscalate =
          !t.escalationId && (t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN')

        return (
          <div key={t.id} className="glass rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</div>
                {t.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                    {t.description}
                  </p>
                )}
              </div>
              <span className={`shrink-0 text-sm font-semibold px-2.5 py-1 rounded-full ${meta.chip}`}>
                {meta.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400">
              {range && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> {range}
                  {t.durationMin ? ` · ${Math.floor(t.durationMin / 60)}j ${t.durationMin % 60}m` : ''}
                </span>
              )}
              {t.picName && <span>PIC {t.picName}</span>}
              {t.subtasks.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4" /> {subDone}/{t.subtasks.length}
                </span>
              )}
              {(t.evidence?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <Paperclip className="h-4 w-4" /> {t.evidence!.length}
                </span>
              )}
            </div>

            {t.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {t.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[11px] px-2 py-0.5">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2.5">
              <Progress value={t.progressPct} className="h-2 flex-1" />
              <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400 w-11 text-right">
                {t.progressPct}%
              </span>
            </div>

            {t.obstacle && (
              <p className="text-sm rounded-lg bg-rose-500/10 border border-rose-500/25 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                <strong>Kendala:</strong> {t.obstacle}
              </p>
            )}
            {t.decisionNeeded && (
              <p className="text-sm rounded-lg bg-amber-500/10 border border-amber-500/25 px-2.5 py-2 text-amber-700 dark:text-amber-300">
                <strong>Butuh keputusan:</strong> {t.decisionNeeded}
              </p>
            )}

            {t.escalation && (
              <div className="text-sm rounded-lg bg-blue-500/10 border border-blue-500/25 px-2.5 py-2 text-blue-700 dark:text-blue-300">
                <Siren className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                Sudah dieskalasi · status {t.escalation.status}
                {t.escalation.decisionText && (
                  <div className="mt-1 text-slate-700 dark:text-slate-200">
                    <strong>Keputusan:</strong> {t.escalation.decisionText}
                  </div>
                )}
              </div>
            )}

            {!locked && (
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(t)
                    setDialogOpen(true)
                  }}
                >
                  <SquarePen className="h-4 w-4" /> Ubah
                </Button>
                {canEscalate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEscalating(t)}
                    className="border-rose-500/40 text-rose-700 dark:text-rose-300"
                  >
                    <Siren className="h-4 w-4" /> Ajukan eskalasi
                  </Button>
                )}
                {!t.escalationId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(t.id)}
                    disabled={busy === t.id}
                    className="text-slate-500 dark:text-slate-400 hover:text-rose-600"
                  >
                    {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {blocked.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {blocked.length} task terhambat. Ajukan eskalasi agar ditindaklanjuti tingkat atas.
        </p>
      )}

      {dialogOpen && (
        <TaskDialog
          key={editing?.id ?? 'baru'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          projectName={projectName}
          task={editing}
          locked={locked}
          onSaved={reload}
        />
      )}

      {escalating && (
        <EscalationDialog
          task={escalating}
          onClose={() => setEscalating(null)}
          onDone={() => {
            setEscalating(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

/** Raising one task to the next level up. */
function EscalationDialog({
  task,
  onClose,
  onDone,
}: {
  task: TaskRecord
  onClose: () => void
  onDone: () => void
}) {
  const [summary, setSummary] = useState(
    task.status === 'TERKENDALA' ? (task.obstacle ?? '') : (task.decisionNeeded ?? '')
  )
  const [needed, setNeeded] = useState(task.status === 'TERKENDALA' ? 'DUKUNGAN_LINTAS_FUNGSI' : 'KEPUTUSAN')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/escalations/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'raise',
          sourceType: 'TASK',
          sourceId: task.id,
          summary,
          needed,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal mengajukan eskalasi')
      else onDone()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-modal max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Siren className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            Ajukan Eskalasi
          </DialogTitle>
          <DialogDescription className="text-sm">{task.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Yang dibutuhkan</Label>
            <div className="flex flex-wrap gap-2">
              {NEEDED_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setNeeded(o.value)}
                  className={`min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors ${
                    needed === o.value
                      ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="esc-summary" className="text-sm font-medium">
              Ringkasan untuk pengambil keputusan <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="esc-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Jelaskan hambatannya, dampaknya bila tidak diputuskan, dan opsi yang Anda usulkan."
              className="bg-white/70 dark:bg-slate-900/50"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Minimal 10 karakter. Ringkasan ini yang dibaca Direktur dan Manajemen.
            </p>
          </div>

          {err && (
            <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {err}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={busy || summary.trim().length < 10}
            className="bg-gradient-to-r from-rose-600 to-rose-500 text-white"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Ajukan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
