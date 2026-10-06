'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import {
  Button, Chip, EmptyNote, ErrorNote, Icon, ProgressBar, Sheet, Skeleton, StatusBadge, cx, type Status,
} from '@/components/mk'
import { TaskDialog, TASK_STATUS_META, URGENCY_STATUS, type ProjectOption, type TaskRecord } from '@/components/task-dialog'
import { Field, useConfirm } from '@/components/companies/parts'
import { EscalationStatusBadge } from '@/components/status-badges'
import { URGENCY_META } from '@/lib/constants'

type TaskRow = TaskRecord & {
  picUserId?: string | null
  escalation: { id: string; status: string; needed: string; decisionText: string | null } | null
}

type Data = {
  workDate: string
  /** Lewat tenggat atau laporan harinya dibekukan (sudah diteruskan), kecuali sedang dibuka. */
  locked: boolean
  frozen?: 'FORWARDED' | 'LOCKED' | null
  tasks: TaskRow[]
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

/** "HH:MM" WIB dari ISO, untuk dikirim balik ke /api/tasks (sama dengan meja kerja PIC). */
function wibHHMM(iso: string | null) {
  if (!iso) return undefined
  const d = new Date(Date.parse(iso) + 7 * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Urutan tampil: yang paling mendesak di atas, lalu yang belum selesai. */
const URGENCY_RANK: Record<string, number> = { KRITIS: 0, TINGGI: 1, SEDANG: 2, RENDAH: 3 }

/** Warna batang progres: aksen untuk yang berjalan, warna status untuk sisanya. */
function barTone(s: Status): Status | 'accent' {
  return s === 'on' || s === 'neutral' ? 'accent' : s
}

/**
 * Daftar progress (task) di bawah laporan harian satu proyek: apa yang
 * direncanakan PIC hari ini, sejauh mana, seberapa mendesak, dan jalur untuk
 * mengeskalasi yang tersangkut. Kotak centang menandai task selesai langsung
 * (dengan "Urungkan"). `prominent` menampilkan tombol tambah lebar penuh —
 * untuk PIC yang memegang satu proyek, itulah tindakan utamanya. `date`
 * ("YYYY-MM-DD") membuka hari lampau yang laporannya sedang dibuka lewat buka
 * kunci. Server tetap penentu: bila laporan harinya sudah diteruskan ke holding,
 * daftar ikut terkunci walau `locked` dari induk belum tahu.
 */
export function TaskSection({
  projectId,
  projectName,
  projects,
  locked: lockedProp,
  prominent = false,
  date,
}: {
  projectId: string
  projectName: string
  projects?: ProjectOption[]
  locked: boolean
  prominent?: boolean
  /** Hari lampau yang sedang dibuka ("YYYY-MM-DD"); kosong = hari ini. */
  date?: string
}) {
  const { data, loading, error, reload } = useResource<Data>(
    `/api/tasks?projectId=${encodeURIComponent(projectId)}${date ? `&date=${date}` : ''}`
  )
  const locked = lockedProp || Boolean(data?.locked)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TaskRecord | null>(null)
  const [escalating, setEscalating] = useState<TaskRecord | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [override, setOverride] = useState<Record<string, boolean>>({})
  const [confirmEl, confirm] = useConfirm()

  const tasks = [...(data?.tasks ?? [])].sort(
    (a, b) => (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
  )
  const isDone = (t: TaskRow) => override[t.id] ?? t.status === 'SELESAI'
  const done = tasks.filter(isDone).length
  const blocked = tasks.filter((t) => t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN')

  async function remove(t: TaskRow) {
    const ok = await confirm({
      title: 'Hapus progress ini?',
      description: (
        <>
          <strong className="text-ink">{t.title}</strong> beserta subtask dan buktinya dihapus dari laporan hari ini dan tidak bisa dikembalikan.
        </>
      ),
      confirmLabel: 'Hapus progress',
      destructive: true,
    })
    if (!ok) return
    setBusy(t.id)
    setActionError(null)
    try {
      const res = await fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setActionError(json.error || 'Progress belum terhapus')
        return
      }
      reload()
    } catch {
      setActionError('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  /** Simpan ulang task dengan status/progres/subtask tertentu (badan sama dengan meja kerja PIC). */
  async function putTask(t: TaskRow, next: { status: string; progressPct: number; subtasks: TaskRecord['subtasks'] }) {
    const res = await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: t.id,
        context: 'HARIAN',
        title: t.title,
        description: t.description,
        picName: t.picName,
        picUserId: t.picUserId ?? null,
        tags: t.tags,
        urgency: t.urgency,
        obstacle: t.obstacle,
        decisionNeeded: t.decisionNeeded,
        startTime: wibHHMM(t.startAt),
        endTime: wibHHMM(t.endAt),
        subtasks: next.subtasks.map((s) => ({ title: s.title, isDone: s.isDone })),
        status: next.status,
        progressPct: next.progressPct,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Task belum tersimpan')
  }

  async function toggle(t: TaskRow) {
    const next = !isDone(t)
    setOverride((o) => ({ ...o, [t.id]: next }))
    setBusy(t.id)
    setActionError(null)
    try {
      await putTask(t, {
        status: next ? 'SELESAI' : 'BERJALAN',
        progressPct: next ? 100 : Math.min(t.progressPct, 90),
        subtasks: t.subtasks.map((s) => ({ ...s, isDone: next ? true : s.isDone })),
      })
      reload()
      toast(next ? `${t.title} ditandai selesai` : `${t.title} dibuka kembali`, {
        action: {
          label: 'Urungkan',
          onClick: () => {
            setOverride((o) => ({ ...o, [t.id]: t.status === 'SELESAI' }))
            putTask(t, { status: t.status, progressPct: t.progressPct, subtasks: t.subtasks })
              .then(reload)
              .catch((e: Error) => toast.error(e.message))
          },
        },
      })
    } catch (e) {
      setOverride((o) => ({ ...o, [t.id]: !next }))
      toast.error(e instanceof Error && e.message ? e.message : 'Tidak dapat menghubungi server')
    } finally {
      setBusy(null)
    }
  }

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  return (
    <section className="mk-lap-stack" aria-label={date ? 'Progress hari itu' : 'Progress hari ini'}>
      <div className="mk-lap-head">
        <h3 className="t-headline text-ink">{date ? 'Yang dikerjakan hari itu' : 'Yang dikerjakan hari ini'}</h3>
        {tasks.length > 0 && (
          <span className="t-footnote text-ink-2 tabular-nums">
            {done} dari {tasks.length} selesai
          </span>
        )}
        <span className="mk-lap-grow" />
        {!locked && !prominent && (
          <Button size="sm" icon="tambah" onClick={openAdd}>
            Tambah progress
          </Button>
        )}
      </div>

      {!locked && prominent && (
        <Button size="lg" full icon="tambah" onClick={openAdd}>
          Tambah progress
        </Button>
      )}

      {tasks.length > 0 && (
        <ProgressBar value={(done / tasks.length) * 100} status={done === tasks.length ? 'done' : 'accent'} label="Progress selesai hari ini" />
      )}

      {loading && !data ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat progress">
          <Skeleton h={96} r={14} />
          <Skeleton h={96} r={14} />
        </div>
      ) : error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : tasks.length === 0 ? (
        <EmptyNote icon="kalender">
          {locked
            ? date
              ? 'Tidak ada progress tercatat pada hari itu.'
              : 'Tidak ada progress tercatat hari ini.'
            : `Belum ada progress ${date ? 'pada hari itu' : 'hari ini'}. Tambahkan rincian pekerjaan agar kemajuan proyek terekam.`}
        </EmptyNote>
      ) : (
        <ul className="mk-lap-tasks">
          {tasks.map((t) => {
            const meta = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.BELUM_MULAI
            const urg = URGENCY_META[t.urgency] ?? URGENCY_META.SEDANG
            const urgStatus = URGENCY_STATUS[t.urgency] ?? 'info'
            const range = timeRange(t.startAt, t.endAt)
            const subDone = t.subtasks.filter((s) => s.isDone).length
            const canEscalate = !t.escalationId && (t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN')
            const checked = isDone(t)

            return (
              <li key={t.id} className={cx('mk-lap-task', 'is-' + urgStatus, checked && 'is-done')}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`Tandai selesai: ${t.title}`}
                  className="mk-lap-check"
                  disabled={locked || busy === t.id}
                  onClick={() => toggle(t)}
                >
                  <span className="mk-lap-check__box">{checked ? <Icon name="selesai" size={16} strokeWidth={2.6} /> : null}</span>
                </button>

                <div className="mk-lap-task__body">
                  <div className="mk-lap-task__top">
                    <div className="min-w-0">
                      <p className="mk-lap-task__title">{t.title}</p>
                      {t.description && <p className="mk-lap-task__desc">{t.description}</p>}
                    </div>
                    <div className="mk-lap-task__badges">
                      <StatusBadge status={meta.status} size="sm">
                        {meta.label}
                      </StatusBadge>
                      <span className="mk-lap-urg">
                        <span className={cx('mk-dot', 'mk-bg--' + urgStatus)} aria-hidden />
                        Urgensi {urg.label.toLowerCase()}
                      </span>
                    </div>
                  </div>

                  {(range || t.picName || t.subtasks.length > 0 || (t.evidence?.length ?? 0) > 0) && (
                    <div className="mk-lap-meta">
                      {range && (
                        <span>
                          <Icon name="waktu" size={14} />
                          {range}
                          {t.durationMin ? ` · ${Math.floor(t.durationMin / 60)} j ${t.durationMin % 60} m` : ''}
                        </span>
                      )}
                      {t.picName && (
                        <span>
                          <Icon name="pengguna" size={14} />
                          {t.picName}
                        </span>
                      )}
                      {t.subtasks.length > 0 && (
                        <span>
                          <Icon name="persetujuan" size={14} />
                          {subDone} dari {t.subtasks.length} subtask
                        </span>
                      )}
                      {(t.evidence?.length ?? 0) > 0 && (
                        <span>
                          <Icon name="dokumen" size={14} />
                          {t.evidence!.length} bukti
                        </span>
                      )}
                    </div>
                  )}

                  {t.tags.length > 0 && (
                    <div className="mk-lap-tags">
                      {t.tags.map((tag) => (
                        <span key={tag} className="mk-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <ProgressBar value={t.progressPct} status={barTone(meta.status)} label={`Progres ${t.title}`} />

                  {t.obstacle && (
                    <p className="mk-note-box mk-soft--risk">
                      <strong>Kendala:</strong> {t.obstacle}
                    </p>
                  )}
                  {t.decisionNeeded && (
                    <p className="mk-note-box mk-soft--info">
                      <strong>Butuh keputusan:</strong> {t.decisionNeeded}
                    </p>
                  )}
                  {t.escalation && (
                    <div className="mk-note-box mk-soft--neutral flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        Sudah dieskalasi <EscalationStatusBadge status={t.escalation.status} />
                      </span>
                      {t.escalation.decisionText && (
                        <span className="text-ink">
                          <strong>Keputusan:</strong> {t.escalation.decisionText}
                        </span>
                      )}
                    </div>
                  )}

                  {!locked && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(t)
                          setDialogOpen(true)
                        }}
                      >
                        Ubah progress
                      </Button>
                      {canEscalate && (
                        <Button size="sm" icon="naik" onClick={() => setEscalating(t)}>
                          Ajukan eskalasi
                        </Button>
                      )}
                      {!t.escalationId && (
                        <Button size="sm" variant="destructive" onClick={() => remove(t)} disabled={busy === t.id}>
                          {busy === t.id ? 'Memproses…' : 'Hapus'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {actionError && (
        <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
          <Icon name="peringatan" size={18} className="shrink-0" />
          <span>{actionError}</span>
        </p>
      )}

      {blocked.length > 0 && (
        <p className="t-footnote text-ink-2 flex items-start gap-2">
          <Icon name="peringatan" size={16} className="shrink-0 mk-text--risk" />
          {blocked.length} progress terhambat. Ajukan eskalasi agar ditindaklanjuti tingkat atas.
        </p>
      )}

      {dialogOpen && (
        <TaskDialog
          key={editing?.id ?? 'baru'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          projectName={projectName}
          projects={projects}
          task={editing}
          locked={locked}
          workDate={date}
          onSaved={() => {
            setOverride({})
            reload()
          }}
        />
      )}

      {escalating && (
        <EscalationSheet
          task={escalating}
          onClose={() => setEscalating(null)}
          onDone={() => {
            setEscalating(null)
            reload()
          }}
        />
      )}
      {confirmEl}
    </section>
  )
}

/** Raising one task to the next level up. */
function EscalationSheet({ task, onClose, onDone }: { task: TaskRecord; onClose: () => void; onDone: () => void }) {
  const [summary, setSummary] = useState(task.status === 'TERKENDALA' ? (task.obstacle ?? '') : (task.decisionNeeded ?? ''))
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
        body: JSON.stringify({ action: 'raise', sourceType: 'TASK', sourceId: task.id, summary, needed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Eskalasi belum terkirim')
      else {
        toast.success('Eskalasi diajukan')
        onDone()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      eyebrow="Eskalasi"
      title="Ajukan eskalasi"
      subtitle={task.title}
      backLabel="Laporan"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon="kirim" onClick={submit} disabled={busy || summary.trim().length < 10}>
            {busy ? 'Mengajukan…' : 'Ajukan eskalasi'}
          </Button>
        </>
      }
    >
      <section className="mk-formsec">
        <Field label="Yang dibutuhkan">
          <div className="mk-lap-chips" role="group" aria-label="Yang dibutuhkan">
            {NEEDED_OPTIONS.map((o) => (
              <Chip key={o.value} selected={needed === o.value} onClick={() => setNeeded(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field
          label="Ringkasan untuk pengambil keputusan"
          htmlFor="esc-summary"
          required
          hint="Minimal 10 karakter. Ringkasan ini yang dibaca Direktur dan Manajemen."
        >
          <textarea
            id="esc-summary"
            className="mk-lap-input"
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Jelaskan hambatannya, dampaknya bila tidak diputuskan, dan opsi yang Anda usulkan."
          />
        </Field>
      </section>
      {err && (
        <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
          <Icon name="peringatan" size={18} className="shrink-0" />
          <span>{err}</span>
        </p>
      )}
    </Sheet>
  )
}
