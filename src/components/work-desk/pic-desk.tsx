'use client'

/**
 * Meja kerja PIC proyek (05-pic-proyek.md): layar kerja, bukan layar pantau.
 * Jawaban di atas: laporan mana yang belum terkirim dan berapa lama lagi.
 * Di bawahnya antrean laporan per proyek, agenda task hari ini yang bisa
 * dicentang langsung, dan riwayat 10 hari kerja.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import {
  Button, Card, EmptyNote, ErrorNote, Hero, ProgressBar, Skeleton, StatTile, StatusBadge, cx, type Status,
} from '@/components/mk'
import { TaskDialog, TASK_STATUS_META, type TaskRecord } from '@/components/task-dialog'
import { DashHeader } from '@/components/views/dash-common'
import { PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatTime } from '@/lib/format'
import { Agenda, CountUp, DayStrip, DeadlineRing, remainLong, type AgendaEntry, type DayCell } from './parts'
import { useOutputs } from '@/components/pic/api'
import { OutputsCard } from '@/components/pic/outputs'
import { NotesCard } from '@/components/pic/notes'
import { RequestAccessCard } from '@/components/admin/request-access-form' // [F2-ADMIN]
import { ApprovalRequestsCard } from '@/components/oversight/approval-requests' // [F2-DIREKTUR]

type PicProject = {
  id: string
  code: string
  name: string
  phase: string
  startDate: string | null
  targetEndDate: string | null
  entityName: string
  tasks: { total: number; done: number; blocked: number }
  report: {
    status: string
    progressPct: number
    submittedAt: string | null
    forwardedAt: string | null
    isLate: boolean
    evidenceCount: number
  } | null
  history: { date: string; submitted: boolean; isLate: boolean; status: string | null; progressPct: number | null }[]
  remindedAt: string | null
  remindedBy: string | null
}

export type PicDesk = {
  kind: 'PIC'
  today: string
  lockAt: string
  locked: boolean
  countdown: { hours: number; minutes: number; totalMs: number; passed: boolean }
  cutoffLabel: string
  days: string[]
  projects: PicProject[]
}

type TaskRow = TaskRecord & { picUserId?: string | null }
type TasksData = { workDate: string; locked: boolean; tasks: TaskRow[] }

const WORK_START_H = 8

/** "HH:MM" WIB dari ISO, untuk dikirim balik ke /api/tasks. */
function wibHHMM(iso: string | null) {
  if (!iso) return undefined
  const d = new Date(Date.parse(iso) + 7 * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function reportStatus(p: PicProject, passed: boolean): { status: Status; text: string } {
  const r = p.report
  if (r?.forwardedAt) return { status: 'done', text: 'Diteruskan ke holding' }
  if (r?.submittedAt) return { status: r.isLate ? 'risk' : 'done', text: `${r.isLate ? 'Terlambat masuk' : 'Terkirim'} ${formatTime(r.submittedAt)}` }
  if (r) return { status: passed ? 'late' : 'risk', text: 'Draf belum dikirim' }
  return { status: passed ? 'late' : 'neutral', text: passed ? 'Tidak dikirim' : 'Belum diisi' }
}

function dayCells(p: PicProject, today: string): DayCell[] {
  return p.history.map((h) => {
    const isToday = h.date === today
    const state: DayCell['state'] = isToday ? (h.submitted ? 'today' : 'pending') : !h.submitted ? 'missing' : h.isLate ? 'late' : 'ontime'
    return { date: h.date, state, title: h.progressPct !== null && h.submitted ? `${h.isLate ? 'Terlambat' : 'Tepat waktu'} · progres ${h.progressPct}%` : undefined }
  })
}

export function PicDeskView({ data, reload }: { data: PicDesk; reload: () => void }) {
  const { setActiveTab } = useApp()
  const projects = data.projects
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = projects.find((p) => p.id === pickedId) ?? projects.find((p) => !p.report?.submittedAt) ?? projects[0] ?? null

  const submitted = projects.filter((p) => p.report?.submittedAt).length
  const outstanding = projects.length - submitted
  const tasksTotal = projects.reduce((a, p) => a + p.tasks.total, 0)
  const tasksDone = projects.reduce((a, p) => a + p.tasks.done, 0)
  const blocked = projects.reduce((a, p) => a + p.tasks.blocked, 0)
  const past = projects.flatMap((p) => p.history.filter((h) => h.date !== data.today))
  const onTime = past.filter((h) => h.submitted && !h.isLate).length
  const onTimePct = past.length ? Math.round((onTime / past.length) * 100) : 0
  const reminder = projects.find((p) => p.remindedAt && !p.report?.submittedAt)
  const workStart = new Date(Date.parse(data.today) + WORK_START_H * 3600000).toISOString()
  // Output & catatan kepala divisi untuk proyek yang dipilih di antrean.
  const outputs = useOutputs(picked?.id ?? null)

  if (projects.length === 0) {
    return (
      <>
        <DashHeader context="Meja kerja" />
        <Card>
          <EmptyNote icon="proyek">Belum ada proyek aktif yang Anda pegang. Hubungi Admin PT bila ini keliru.</EmptyNote>
        </Card>
      </>
    )
  }

  const answer =
    outstanding === 0
      ? projects.length === 1
        ? `Laporan ${projects[0].name} hari ini sudah terkirim.`
        : `Semua ${projects.length} laporan hari ini sudah terkirim.`
      : projects.length === 1
        ? `Laporan ${projects[0].name} hari ini belum dikirim.`
        : `${outstanding} dari ${projects.length} laporan hari ini belum dikirim.`

  const left = data.countdown.totalMs
  const support = [
    data.locked
      ? `Tenggat ${data.cutoffLabel} sudah lewat; laporan hari ini terkunci.`
      : outstanding
        ? `Tenggat ${data.cutoffLabel} WIB, ${remainLong(left)} lagi.`
        : 'Admin PT sudah bisa meneruskannya ke holding.',
    tasksTotal ? `${tasksDone} dari ${tasksTotal} task hari ini selesai.` : 'Belum ada task untuk hari ini.',
    reminder ? `${reminder.remindedBy ?? 'Admin PT'} mengingatkan pukul ${formatTime(reminder.remindedAt)}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <DashHeader
        context={projects.length === 1 ? projects[0].name : `${projects.length} proyek`}
        tools={
          outstanding === 0 ? (
            <StatusBadge status="done">Laporan hari ini · Terkirim</StatusBadge>
          ) : (
            <StatusBadge status={data.locked ? 'late' : 'risk'}>Laporan hari ini · Belum dikirim</StatusBadge>
          )
        }
      />

      <Hero
        eyebrow={`Meja kerja · ${new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' }).format(new Date(data.today))}`}
        answer={answer}
        support={support}
        actions={
          <>
            <Button variant="primary" icon={outstanding ? 'tambah' : 'catatan'} disabled={data.locked && outstanding > 0} onClick={() => setActiveTab('daily-input')}>
              {outstanding ? 'Isi laporan harian' : 'Ubah laporan harian'}
            </Button>
            <Button variant="plain" onClick={() => setActiveTab('projects')}>
              Lihat proyek
            </Button>
          </>
        }
        art={<DeadlineRing from={workStart} to={data.lockAt} done={outstanding === 0} doneCaption="semua laporan hari ini" caption={`menuju ${data.cutoffLabel} WIB`} />}
        kpis={
          <>
            <StatTile
              variant="gradient"
              label="Laporan terkirim"
              value={`${submitted} dari ${projects.length}`}
              delta={outstanding ? `${outstanding} menunggu Anda` : 'Semua beres hari ini'}
            />
            <StatTile label="Task selesai" value={`${tasksDone} dari ${tasksTotal}`} delta={tasksTotal ? `${Math.round((tasksDone / tasksTotal) * 100)}% hari ini` : 'Tambahkan task hari ini'} tone={tasksTotal && tasksDone === tasksTotal ? 'on' : 'neutral'} />
            <StatTile label="Tepat waktu 10 hari" value={`${onTimePct}%`} delta={onTimePct >= 85 ? 'Di atas target 85%' : 'Target 85%'} tone={onTimePct >= 85 ? 'on' : 'risk'} />
            <StatTile label="Task terkendala" value={blocked} delta={blocked ? 'Tulis kendalanya di laporan' : 'Tidak ada kendala'} tone={blocked ? 'risk' : 'on'} />
          </>
        }
      />

      <div className="mk-row">
        <Card
          className="is-wide"
          title="Antrean laporan hari ini"
          subtitle={data.locked ? `Terkunci sejak ${data.cutoffLabel}` : `Kirim sebelum ${data.cutoffLabel} WIB · pilih proyek untuk melihat agendanya`}
        >
          <ul className="mk-desk-queue">
            {projects.map((p, i) => {
              const st = reportStatus(p, data.locked)
              const sel = picked?.id === p.id
              return (
                <li key={p.id} className={cx('mk-desk-queue__row', sel && 'is-selected')} style={{ '--i': i } as React.CSSProperties}>
                  <button type="button" className="mk-desk-queue__hit" aria-pressed={sel} onClick={() => setPickedId(p.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="t-body-strong block truncate">{p.name}</span>
                      <span className="t-footnote text-ink-2 block truncate">
                        {p.code} · {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}
                        {p.report ? ` · progres ${p.report.progressPct}%` : ''}
                        {p.report?.evidenceCount ? ` · ${p.report.evidenceCount} bukti` : ''}
                      </span>
                    </span>
                    <span className="mk-desk-queue__bar">
                      <ProgressBar value={p.tasks.total ? (p.tasks.done / p.tasks.total) * 100 : 0} status={p.tasks.blocked ? 'risk' : 'accent'} showValue={false} label={`Task ${p.name}`} />
                      <span className="t-caption text-ink-2 tabular-nums">
                        {p.tasks.total ? `${p.tasks.done} dari ${p.tasks.total} task` : 'Belum ada task'}
                      </span>
                    </span>
                    <span key={st.text} className="mk-desk-pop">
                      <StatusBadge status={st.status} size="sm">
                        {st.text}
                      </StatusBadge>
                    </span>
                  </button>
                  {p.remindedAt && !p.report?.submittedAt ? (
                    <div className="mk-desk-queue__note mk-soft--risk">
                      Diingatkan {p.remindedBy ?? 'Admin PT'} pukul {formatTime(p.remindedAt)}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
        {picked && <AgendaCard key={picked.id} project={picked} projects={projects} locked={data.locked} onChanged={reload} />}
      </div>

      {picked && (
        <div className="mk-row">
          <OutputsCard key={`output-${picked.id}`} className="is-wide" projectId={picked.id} projectName={picked.name} res={outputs} />
          <NotesCard key={`catatan-${picked.id}`} className="is-narrow" projectId={picked.id} />
        </div>
      )}

      <Card title="Riwayat 10 hari kerja" subtitle={`${onTime} dari ${past.length} laporan sebelumnya tepat waktu`}>
        <div className="mk-desk-history">
          {projects.map((p) => (
            <div key={p.id} className="mk-desk-history__row">
              <div className="min-w-0">
                <div className="t-body-strong truncate">{p.name}</div>
                <div className="t-footnote text-ink-2">
                  <CountUp value={p.history.filter((h) => h.submitted && !h.isLate).length} /> tepat waktu
                </div>
              </div>
              <DayStrip days={dayCells(p, data.today)} label={`Riwayat laporan ${p.name}`} />
            </div>
          ))}
        </div>
        <div className="mk-desk-legend t-caption text-ink-2" aria-hidden>
          <span className="is-ontime">Tepat waktu</span>
          <span className="is-late">Terlambat</span>
          <span className="is-missing">Tidak dikirim</span>
          <span className="is-pending">Hari ini</span>
        </div>
      </Card>

      {/* [F2-ADMIN] permintaan akses ke Admin PT */}
      {/* [F2-DIREKTUR] materi/anggaran/cuti ke direktur */}
      <ApprovalRequestsCard />
      <RequestAccessCard />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Agenda task hari ini untuk satu proyek                              */
/* ------------------------------------------------------------------ */

function AgendaCard({ project, projects, locked, onChanged }: { project: PicProject; projects: PicProject[]; locked: boolean; onChanged: () => void }) {
  const { data, loading, error, reload } = useResource<TasksData>(`/api/tasks?projectId=${project.id}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [override, setOverride] = useState<Record<string, boolean>>({})
  const [dialog, setDialog] = useState<{ taskId: string | null } | null>(null)
  const isLocked = locked || Boolean(data?.locked)
  const options = useMemo(() => projects.map((p) => ({ id: p.id, code: p.code, name: p.name })), [projects])

  const tasks = data?.tasks ?? []
  const editing = tasks.find((t) => t.id === dialog?.taskId) ?? null
  function refresh() {
    setOverride({})
    reload()
    onChanged()
  }
  const entries: AgendaEntry[] = tasks.map((t) => {
    const done = override[t.id] ?? t.status === 'SELESAI'
    const blocked = t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN'
    const subDone = t.subtasks.filter((s) => s.isDone).length
    return {
      id: t.id,
      title: t.title,
      meta: [t.picName, t.subtasks.length ? `${subDone} dari ${t.subtasks.length} langkah` : null, blocked ? (t.obstacle ?? t.decisionNeeded) : null].filter(Boolean).join(' · ') || undefined,
      start: t.startAt,
      end: t.endAt,
      done,
      badge:
        blocked && !done ? (
          <StatusBadge status="risk" size="sm">
            {TASK_STATUS_META[t.status]?.label ?? 'Terkendala'}
          </StatusBadge>
        ) : null,
    }
  })
  const doneCount = entries.filter((e) => e.done).length

  async function toggle(e: AgendaEntry) {
    const t = tasks.find((x) => x.id === e.id)
    if (!t) return
    const next = !e.done
    setOverride((o) => ({ ...o, [t.id]: next }))
    setBusy(t.id)
    try {
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
          subtasks: t.subtasks.map((s) => ({ title: s.title, isDone: next ? true : s.isDone })),
          status: next ? 'SELESAI' : 'BERJALAN',
          progressPct: next ? 100 : Math.min(t.progressPct, 90),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOverride((o) => ({ ...o, [t.id]: !next }))
        toast.error(json.error || 'Task belum tersimpan')
      } else {
        refresh()
      }
    } catch {
      setOverride((o) => ({ ...o, [t.id]: !next }))
      toast.error('Tidak dapat menghubungi server')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      className="is-narrow"
      title="Agenda hari ini"
      subtitle={tasks.length ? `${doneCount} dari ${tasks.length} task selesai · ${project.name}` : project.name}
      action={
        <Button size="sm" variant="secondary" icon="tambah" disabled={isLocked} onClick={() => setDialog({ taskId: null })}>
          Tambah task
        </Button>
      }
    >
      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={44} />
          <Skeleton h={44} />
          <Skeleton h={44} />
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : entries.length === 0 ? (
        <EmptyNote icon="kalender" action={!isLocked ? <Button size="sm" variant="plain" onClick={() => setDialog({ taskId: null })}>Tambah task pertama</Button> : undefined}>
          Belum ada task untuk hari ini.
        </EmptyNote>
      ) : (
        <>
          <ProgressBar value={(doneCount / entries.length) * 100} status={doneCount === entries.length ? 'done' : 'accent'} label="Task selesai hari ini" className="mb-3" />
          <Agenda
            entries={entries}
            busyId={busy}
            locked={isLocked}
            onToggle={toggle}
            onOpen={(e) => setDialog({ taskId: e.id })}
          />
          {isLocked && <p className="t-footnote text-ink-2 mt-3">Laporan hari ini sudah terkunci; centang tidak bisa diubah.</p>}
        </>
      )}
      {dialog && (dialog.taskId === null || editing) && (
        <TaskDialog
          key={dialog.taskId ?? 'baru'}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          projectId={project.id}
          projectName={project.name}
          projects={options}
          task={editing}
          locked={isLocked}
          onSaved={refresh}
        />
      )}
    </Card>
  )
}
