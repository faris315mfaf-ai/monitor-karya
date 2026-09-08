'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import { wibKey } from '@/components/weekly-board'
import { URGENCY_META } from '@/lib/constants'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, CalendarDays, Check, Clock, FolderKanban, Flame, HelpCircle, ListChecks, Loader2,
  Plus, Tag as TagIcon, Trash2, User as UserIcon, X,
} from 'lucide-react'

export type Subtask = { id?: string; title: string; isDone: boolean }

export type TaskRecord = {
  id: string
  projectId?: string
  title: string
  description: string | null
  tags: string[]
  picName: string | null
  startAt: string | null
  endAt: string | null
  durationMin: number | null
  status: string
  progressPct: number
  urgency: string
  obstacle: string | null
  decisionNeeded: string | null
  escalationId: string | null
  subtasks: Subtask[]
  evidence?: EvidenceItem[]
}

export type ProjectOption = { id: string; code: string; name: string }

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
const URGENCIES = ['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS']

/** "2026-09-04T10:30:00Z" -> "17:30" in WIB, for the time inputs. */
function toWibTime(iso: string | null): string {
  if (!iso) return ''
  const wib = new Date(new Date(iso).getTime() + 7 * 3600000)
  return wib.toISOString().slice(11, 16)
}

const SUGGESTED_TAGS = ['Lapangan', 'Administrasi', 'Pengadaan', 'Koordinasi', 'Inspeksi', 'Laporan']

/** Section chrome: a titled block inside the sheet. */
function Section({
  icon: Icon,
  title,
  hint,
  children,
  tone = 'blue',
}: {
  icon: React.ElementType
  title: React.ReactNode
  hint?: string
  children: React.ReactNode
  tone?: 'blue' | 'violet' | 'amber' | 'rose' | 'emerald'
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    violet: 'text-violet-600 dark:text-violet-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
  }
  return (
    <section className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2">
        <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', tones[tone])} />
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {hint && <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Tambah / ubah satu progres (task) harian — dialog LAYAR PENUH di ponsel,
 * lembar lebar di desktop. Satu tempat untuk semua yang dicatat PIC tentang
 * sebuah pekerjaan: judul, proyek, periode pengerjaan, pelaksana, subtask,
 * status, urgensi, kendala, dan bukti.
 */
export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  projects,
  task,
  locked,
  onSaved,
  weekly,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  projectName: string
  /** Proyek yang bisa dipilih; bila hanya satu, dropdown-nya terkunci. */
  projects?: ProjectOption[]
  task: TaskRecord | null
  locked: boolean
  onSaved: () => void
  /**
   * Dibuka dari papan mingguan (8 Sep 2026): hari pengerjaan bisa dipilih di
   * antara tujuh hari minggu itu, atau "Capaian mingguan" tanpa hari tertentu.
   * `lane` = "YYYY-MM-DD" atau "MINGGUAN".
   */
  weekly?: { week: string; days: string[]; lane: string }
}) {
  const editing = Boolean(task)
  const options: ProjectOption[] =
    projects && projects.length > 0 ? projects : [{ id: projectId, code: '', name: projectName }]

  const [chosenProject, setChosenProject] = useState(task?.projectId ?? projectId)
  const [lane, setLane] = useState(weekly?.lane ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [picName, setPicName] = useState(task?.picName ?? '')
  const [tags, setTags] = useState<string[]>(task?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [startTime, setStartTime] = useState(toWibTime(task?.startAt ?? null))
  const [endTime, setEndTime] = useState(toWibTime(task?.endAt ?? null))
  const [status, setStatus] = useState(task?.status ?? 'BELUM_MULAI')
  const [urgency, setUrgency] = useState(task?.urgency ?? 'SEDANG')
  const [progressPct, setProgressPct] = useState(task?.progressPct ?? 0)
  const [obstacle, setObstacle] = useState(task?.obstacle ?? '')
  const [decisionNeeded, setDecisionNeeded] = useState(task?.decisionNeeded ?? '')
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? [])
  const [subDraft, setSubDraft] = useState('')

  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const needsObstacle = status === 'TERKENDALA'
  const needsDecision = status === 'MENUNGGU_KEPUTUSAN'
  const project = options.find((p) => p.id === chosenProject) ?? options[0]

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
        projectId: chosenProject,
        title,
        description,
        picName,
        tags,
        startTime,
        endTime,
        status,
        urgency,
        progressPct,
        obstacle,
        decisionNeeded,
        subtasks,
        ...(weekly
          ? {
              context: 'MINGGUAN',
              week: weekly.week,
              scope: lane === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN',
              workDate: lane === 'MINGGUAN' ? undefined : lane,
            }
          : {}),
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
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Ponsel: memenuhi layar, tanpa sudut. Desktop: lembar lebar di tengah.
          'glass-modal p-0 gap-0 flex flex-col overflow-hidden',
          'w-screen h-dvh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0',
          'sm:w-[min(96vw,56rem)] sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2'
        )}
      >
        {/* Kepala lembar */}
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                {editing ? 'Ubah Progress' : 'Tambah Progress'}
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                {weekly ? (lane === 'MINGGUAN' ? 'Capaian mingguan' : formatDateLong(lane)) : formatDateLong(new Date())} · {project?.name ?? projectName}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Tutup"
              className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Isi — menggulir sendiri */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-7 py-5 space-y-4">
          <Section icon={FolderKanban} title="Judul & proyek">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-title" className="text-sm font-medium">
                  Judul task <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="mis. Pemasangan struktur tower segmen 3"
                  disabled={locked}
                  className="bg-white/70 dark:bg-slate-900/50 h-11 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-project" className="text-sm font-medium">Proyek yang sedang dijalani</Label>
                <select
                  id="task-project"
                  value={chosenProject}
                  onChange={(e) => setChosenProject(e.target.value)}
                  disabled={locked || editing || options.length === 1}
                  className="h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 text-base text-slate-800 dark:text-slate-100 disabled:opacity-70"
                >
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ` : ''}{p.name}
                    </option>
                  ))}
                </select>
                {options.length === 1 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Anda memegang satu proyek — otomatis terpilih.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-desc" className="text-sm font-medium">Deskripsi</Label>
                <Textarea
                  id="task-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Rincian pekerjaan, lokasi, alat, atau catatan penting."
                  disabled={locked}
                  className="bg-white/70 dark:bg-slate-900/50 text-base"
                />
              </div>
            </div>
          </Section>

          <Section
            icon={Clock}
            title="Periode pengerjaan"
            hint={weekly ? 'Pilih hari di minggu ini, atau jadikan capaian mingguan tanpa hari tertentu.' : 'Tanggal hari ini (WIB); isi jam mulai dan selesai.'}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-day" className="text-sm">{weekly ? 'Hari pengerjaan' : 'Tanggal'}</Label>
                {weekly ? (
                  <select
                    id="task-day"
                    value={lane}
                    onChange={(e) => setLane(e.target.value)}
                    disabled={locked}
                    className="h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 text-base text-slate-800 dark:text-slate-100 disabled:opacity-70"
                  >
                    {weekly.days.map((d) => (
                      <option key={d} value={wibKey(d)}>
                        {formatDateLong(d)}
                      </option>
                    ))}
                    <option value="MINGGUAN">Capaian mingguan (tanpa hari)</option>
                  </select>
                ) : (
                  <div className="h-11 flex items-center gap-2 rounded-md border border-slate-200/70 dark:border-slate-700 bg-slate-500/5 px-3 text-base text-slate-700 dark:text-slate-200">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    {formatDateLong(new Date())}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-start" className="text-sm">Mulai</Label>
                <Input id="task-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={locked} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-end" className="text-sm">Selesai</Label>
                <Input id="task-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={locked} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
              </div>
            </div>
            {startTime && endTime && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Durasi: <Duration start={startTime} end={endTime} />
              </p>
            )}
          </Section>

          <Section icon={UserIcon} title="PIC pelaksana & tag">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-pic" className="text-sm">Nama pelaksana</Label>
                <Input id="task-pic" value={picName} onChange={(e) => setPicName(e.target.value)} placeholder="Siapa yang mengerjakan" disabled={locked} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-tag" className="text-sm flex items-center gap-1.5"><TagIcon className="h-4 w-4" /> Tag</Label>
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
                  className="bg-white/70 dark:bg-slate-900/50 h-11 text-base"
                />
              </div>
            </div>
            {(tags.length > 0 || !locked) && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <Badge key={t} className="bg-blue-500/15 text-blue-700 dark:text-blue-300 gap-1 py-1 px-2.5 text-sm">
                    {t}
                    {!locked && (
                      <button onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`} className="hover:text-rose-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </Badge>
                ))}
                {!locked &&
                  SUGGESTED_TAGS.filter((t) => !tags.includes(t)).slice(0, 4).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      className="min-h-11 text-sm rounded-full px-3 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-blue-500 hover:text-blue-600"
                    >
                      + {t}
                    </button>
                  ))}
              </div>
            )}
          </Section>

          <Section
            icon={ListChecks}
            tone="violet"
            title={
              <>
                Subtask{' '}
                {subtasks.length > 0 && (
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">· {doneCount}/{subtasks.length} selesai</span>
                )}
              </>
            }
          >
            <div className="space-y-2">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSubtasks(subtasks.map((x, j) => (i === j ? { ...x, isDone: !x.isDone } : x)))}
                    disabled={locked}
                    aria-label={s.isDone ? `Batalkan ${s.title}` : `Tandai selesai ${s.title}`}
                    className={cn(
                      'h-7 w-7 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                      s.isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                    )}
                  >
                    {s.isDone && <Check className="h-4 w-4" />}
                  </button>
                  <span className={cn('flex-1 text-base', s.isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200')}>
                    {s.title}
                  </span>
                  {!locked && (
                    <button type="button" onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} aria-label={`Hapus subtask ${s.title}`} className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-rose-600 shrink-0">
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
                    className="bg-white/70 dark:bg-slate-900/50 h-11 text-base"
                  />
                  <Button type="button" variant="outline" onClick={addSubtask} disabled={!subDraft.trim()} className="h-11 w-11 p-0">
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section icon={Check} tone="emerald" title={<>Status <span className="text-rose-500">*</span></>}>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    disabled={locked}
                    aria-pressed={status === s}
                    className={cn(
                      'min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50',
                      status === s
                        ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                    )}
                  >
                    {TASK_STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="task-progress" className="text-sm font-medium">Progres: {progressPct}%</Label>
                <Input id="task-progress" type="range" min={0} max={100} step={5} value={progressPct} onChange={(e) => setProgressPct(Number(e.target.value))} disabled={locked} className="cursor-pointer" />
              </div>
            </Section>

            <Section icon={Flame} tone="rose" title="Urgensi" hint="Seberapa mendesak pekerjaan ini bagi proyek.">
              <div className="grid grid-cols-2 gap-2">
                {URGENCIES.map((u) => {
                  const m = URGENCY_META[u]
                  const active = urgency === u
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(u)}
                      disabled={locked}
                      aria-pressed={active}
                      className={cn(
                        'min-h-14 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50',
                        active ? `border-transparent ring-2 ring-offset-1 ring-offset-transparent ${m.bg} ${m.text} ring-current` : 'border-slate-200 dark:border-slate-700 hover:bg-slate-500/10'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', m.dot)} />
                        <span className={cn('text-sm font-semibold', active ? '' : 'text-slate-700 dark:text-slate-200')}>{m.label}</span>
                      </div>
                      <div className={cn('text-xs mt-0.5', active ? 'opacity-80' : 'text-slate-500 dark:text-slate-400')}>{m.hint}</div>
                    </button>
                  )
                })}
              </div>
            </Section>
          </div>

          {needsObstacle && (
            <Section icon={AlertTriangle} tone="rose" title={<>Uraian kendala <span className="text-rose-500">*</span></>}>
              <Textarea rows={3} value={obstacle} onChange={(e) => setObstacle(e.target.value)} placeholder="Apa yang menghambat, sejak kapan, dan dampaknya." disabled={locked} className="bg-white/70 dark:bg-slate-900/50 text-base" />
            </Section>
          )}
          {needsDecision && (
            <Section icon={HelpCircle} tone="amber" title={<>Keputusan yang dibutuhkan <span className="text-rose-500">*</span></>}>
              <Textarea rows={3} value={decisionNeeded} onChange={(e) => setDecisionNeeded(e.target.value)} placeholder="Keputusan apa yang diminta, dari siapa, dan batas waktunya." disabled={locked} className="bg-white/70 dark:bg-slate-900/50 text-base" />
            </Section>
          )}

          {editing ? (
            <Section icon={ListChecks} tone="blue" title="Dokumen / foto pendukung">
              <EvidencePanel targetType="TASK" targetId={task!.id} items={task!.evidence ?? []} disabled={locked} onChanged={onSaved} />
            </Section>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 px-1">
              Dokumen dan foto dapat dilampirkan setelah progress disimpan.
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

        {/* Kaki — selalu terlihat */}
        <div className="px-5 sm:px-7 py-4 border-t border-white/40 dark:border-white/10 flex gap-2 justify-end bg-white/40 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="h-12 px-5 text-base">
            Batal
          </Button>
          <Button
            onClick={save}
            disabled={busy || locked || !title.trim()}
            className="h-12 px-6 text-base bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {editing ? 'Simpan perubahan' : 'Simpan progress'}
          </Button>
        </div>
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
