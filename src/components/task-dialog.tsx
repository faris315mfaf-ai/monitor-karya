'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import {
  AlertTriangle, Check, Clock, HelpCircle, ListChecks, Loader2, Plus, Tag as TagIcon,
  Trash2, User as UserIcon, X,
} from 'lucide-react'

export type Subtask = { id?: string; title: string; isDone: boolean }

export type TaskRecord = {
  id: string
  title: string
  description: string | null
  tags: string[]
  picName: string | null
  startAt: string | null
  endAt: string | null
  durationMin: number | null
  status: string
  progressPct: number
  obstacle: string | null
  decisionNeeded: string | null
  escalationId: string | null
  subtasks: Subtask[]
  evidence?: EvidenceItem[]
}

export const TASK_STATUS_META: Record<string, { label: string; chip: string }> = {
  BELUM_MULAI: { label: 'Belum mulai', chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  BERJALAN: { label: 'Berjalan', chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  SELESAI: { label: 'Selesai', chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  TERKENDALA: { label: 'Terkendala', chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  MENUNGGU_KEPUTUSAN: {
    label: 'Menunggu keputusan',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
}

const STATUSES = ['BELUM_MULAI', 'BERJALAN', 'SELESAI', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN']

/** "2026-09-04T10:30:00Z" -> "17:30" in WIB, for the time inputs. */
function toWibTime(iso: string | null): string {
  if (!iso) return ''
  const wib = new Date(new Date(iso).getTime() + 7 * 3600000)
  return wib.toISOString().slice(11, 16)
}

const SUGGESTED_TAGS = ['Lapangan', 'Administrasi', 'Pengadaan', 'Koordinasi', 'Inspeksi', 'Laporan']

/**
 * Create or edit one daily task. Everything a PIC records about a piece of work
 * in a single sheet: what it is, who does it, when, how far along, what is
 * blocking it, and the evidence behind it.
 */
export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  task,
  locked,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  projectName: string
  task: TaskRecord | null
  locked: boolean
  onSaved: () => void
}) {
  const editing = Boolean(task)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [picName, setPicName] = useState(task?.picName ?? '')
  const [tags, setTags] = useState<string[]>(task?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [startTime, setStartTime] = useState(toWibTime(task?.startAt ?? null))
  const [endTime, setEndTime] = useState(toWibTime(task?.endAt ?? null))
  const [status, setStatus] = useState(task?.status ?? 'BELUM_MULAI')
  const [progressPct, setProgressPct] = useState(task?.progressPct ?? 0)
  const [obstacle, setObstacle] = useState(task?.obstacle ?? '')
  const [decisionNeeded, setDecisionNeeded] = useState(task?.decisionNeeded ?? '')
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? [])
  const [subDraft, setSubDraft] = useState('')

  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const needsObstacle = status === 'TERKENDALA'
  const needsDecision = status === 'MENUNGGU_KEPUTUSAN'

  function addTag(value: string) {
    const v = value.trim()
    if (!v || tags.includes(v) || tags.length >= 8) return
    setTags([...tags, v])
    setTagDraft('')
  }

  function addSubtask() {
    const v = subDraft.trim()
    if (!v) return
    setSubtasks([...subtasks, { title: v, isDone: false }])
    setSubDraft('')
  }

  async function save() {
    setBusy(true)
    setErrors([])
    try {
      const payload = {
        id: task?.id,
        projectId,
        title,
        description,
        picName,
        tags,
        startTime,
        endTime,
        status,
        progressPct,
        obstacle,
        decisionNeeded,
        subtasks,
      }
      const res = await fetch('/api/tasks', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(Array.isArray(json.errors) && json.errors.length ? json.errors : [json.error || 'Gagal menyimpan'])
        return
      }
      onSaved()
      onOpenChange(false)
    } catch {
      setErrors(['Tidak dapat menghubungi server.'])
    } finally {
      setBusy(false)
    }
  }

  const doneCount = subtasks.filter((s) => s.isDone).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-modal max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="text-xl">{editing ? 'Ubah Task' : 'Tambah Task'}</DialogTitle>
          <DialogDescription className="text-sm">{projectName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Judul & deskripsi */}
          <div className="space-y-2">
            <Label htmlFor="task-title" className="text-sm font-medium">
              Judul task <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Pemasangan struktur tower segmen 3"
              disabled={locked}
              className="bg-white/70 dark:bg-slate-900/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc" className="text-sm font-medium">Deskripsi</Label>
            <Textarea
              id="task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rincian pekerjaan, lokasi, alat, atau catatan penting."
              disabled={locked}
              className="bg-white/70 dark:bg-slate-900/50"
            />
          </div>

          {/* Waktu pengerjaan */}
          <div className="rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Periode pengerjaan (WIB)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-start" className="text-sm">Mulai</Label>
                <Input
                  id="task-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={locked}
                  className="bg-white/70 dark:bg-slate-900/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-end" className="text-sm">Selesai</Label>
                <Input
                  id="task-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={locked}
                  className="bg-white/70 dark:bg-slate-900/50"
                />
              </div>
            </div>
            {startTime && endTime && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Durasi: <Duration start={startTime} end={endTime} />
              </p>
            )}
          </div>

          {/* PIC & tag */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-pic" className="text-sm font-medium flex items-center gap-1.5">
                <UserIcon className="h-4 w-4" /> PIC pelaksana
              </Label>
              <Input
                id="task-pic"
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
                placeholder="Nama pelaksana"
                disabled={locked}
                className="bg-white/70 dark:bg-slate-900/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-tag" className="text-sm font-medium flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" /> Tag
              </Label>
              <Input
                id="task-tag"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTag(tagDraft)
                  }
                }}
                placeholder="Ketik lalu Enter"
                disabled={locked || tags.length >= 8}
                className="bg-white/70 dark:bg-slate-900/50"
              />
            </div>
          </div>

          {(tags.length > 0 || !locked) && (
            <div className="flex flex-wrap gap-2 -mt-2">
              {tags.map((t) => (
                <Badge key={t} className="bg-blue-500/15 text-blue-700 dark:text-blue-300 gap-1 py-1 px-2.5">
                  {t}
                  {!locked && (
                    <button
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      aria-label={`Hapus tag ${t}`}
                      className="hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </Badge>
              ))}
              {!locked &&
                SUGGESTED_TAGS.filter((t) => !tags.includes(t)).slice(0, 4).map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="text-sm rounded-full px-2.5 py-1 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-blue-500 hover:text-blue-600"
                  >
                    + {t}
                  </button>
                ))}
            </div>
          )}

          {/* Subtask */}
          <div className="rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Subtask
              {subtasks.length > 0 && (
                <span className="ml-auto text-sm font-normal text-slate-500 dark:text-slate-400">
                  {doneCount}/{subtasks.length} selesai
                </span>
              )}
            </div>

            {subtasks.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <button
                  onClick={() =>
                    setSubtasks(subtasks.map((x, j) => (i === j ? { ...x, isDone: !x.isDone } : x)))
                  }
                  disabled={locked}
                  aria-label={s.isDone ? `Batalkan ${s.title}` : `Tandai selesai ${s.title}`}
                  className={`h-6 w-6 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                    s.isDone
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                  }`}
                >
                  {s.isDone && <Check className="h-4 w-4" />}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    s.isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {s.title}
                </span>
                {!locked && (
                  <button
                    onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                    aria-label={`Hapus subtask ${s.title}`}
                    className="text-slate-400 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {!locked && (
              <div className="flex gap-2">
                <Input
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSubtask()
                    }
                  }}
                  placeholder="Tambah langkah kerja"
                  className="bg-white/70 dark:bg-slate-900/50"
                />
                <Button variant="outline" onClick={addSubtask} disabled={!subDraft.trim()}>
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>

          {/* Status & progres */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Status <span className="text-rose-500">*</span></Label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  disabled={locked}
                  className={`min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 ${
                    status === s
                      ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                  }`}
                >
                  {TASK_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-progress" className="text-sm font-medium">
              Progres: {progressPct}%
            </Label>
            <Input
              id="task-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progressPct}
              onChange={(e) => setProgressPct(Number(e.target.value))}
              disabled={locked}
              className="cursor-pointer"
            />
          </div>

          {needsObstacle && (
            <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
              <Label htmlFor="task-obstacle" className="text-sm font-medium flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4" /> Uraian kendala <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="task-obstacle"
                rows={3}
                value={obstacle}
                onChange={(e) => setObstacle(e.target.value)}
                placeholder="Apa yang menghambat, sejak kapan, dan dampaknya."
                disabled={locked}
                className="bg-white/70 dark:bg-slate-900/50"
              />
            </div>
          )}

          {needsDecision && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <Label htmlFor="task-decision" className="text-sm font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <HelpCircle className="h-4 w-4" /> Keputusan yang dibutuhkan <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="task-decision"
                rows={3}
                value={decisionNeeded}
                onChange={(e) => setDecisionNeeded(e.target.value)}
                placeholder="Keputusan apa yang diminta, dari siapa, dan batas waktunya."
                disabled={locked}
                className="bg-white/70 dark:bg-slate-900/50"
              />
            </div>
          )}

          {/* Lampiran — hanya setelah task punya id */}
          {editing ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dokumen / foto pendukung</Label>
              <EvidencePanel
                targetType="TASK"
                targetId={task!.id}
                items={task!.evidence ?? []}
                disabled={locked}
                onChanged={onSaved}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Dokumen dan foto dapat dilampirkan setelah task disimpan.
            </p>
          )}

          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button
            onClick={save}
            disabled={busy || locked || !title.trim()}
            className="bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {editing ? 'Simpan perubahan' : 'Tambah task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Duration({ start, end }: { start: string; end: string }) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  if (mins <= 0) return <span className="text-rose-600 dark:text-rose-400">jam selesai harus setelah jam mulai</span>
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return (
    <span className="font-semibold text-slate-700 dark:text-slate-200">
      {h > 0 ? `${h} jam ` : ''}
      {m > 0 ? `${m} menit` : ''}
    </span>
  )
}
