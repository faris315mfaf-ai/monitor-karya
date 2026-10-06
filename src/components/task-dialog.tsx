'use client'

import { ChoiceGroup } from '@/components/mk/forms'
import { useState } from 'react'
import { Button, Chip, Icon, IconButton, Sheet, cx, type Status } from '@/components/mk'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import { Field, SectionTitle, selectCls } from '@/components/companies/parts'
import { wibKey } from '@/components/weekly-board'
import { URGENCY_META } from '@/lib/constants'
import { formatDateLong } from '@/lib/format'

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

/**
 * Label & warna status task. `status` = kosakata StatusBadge; `chip` = kelas
 * permukaan lembut bertoken untuk pemakai lama yang menempelkannya langsung.
 */
export const TASK_STATUS_META: Record<string, { label: string; chip: string; status: Status }> = {
  BELUM_MULAI: { label: 'Belum mulai', chip: 'mk-soft--neutral', status: 'neutral' },
  BERJALAN: { label: 'Berjalan', chip: 'mk-soft--on', status: 'on' },
  SELESAI: { label: 'Selesai', chip: 'mk-soft--done', status: 'done' },
  TERKENDALA: { label: 'Terkendala', chip: 'mk-soft--risk', status: 'risk' },
  MENUNGGU_KEPUTUSAN: { label: 'Menunggu keputusan', chip: 'mk-soft--info', status: 'info' },
}

/** Urgensi task → nada status (garis kiri kartu, titik pilihan). */
export const URGENCY_STATUS: Record<string, Status> = {
  KRITIS: 'late',
  TINGGI: 'risk',
  SEDANG: 'info',
  RENDAH: 'neutral',
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

/**
 * Tambah / ubah satu progres (task) harian — Sheet lebar (desktop 640 di
 * samping, tablet form sheet, ponsel layar didorong dengan tombol menempel).
 * Satu tempat untuk semua yang dicatat PIC tentang sebuah pekerjaan: judul,
 * proyek, periode pengerjaan, pelaksana, subtask, status, urgensi, kendala,
 * dan bukti.
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
  workDate,
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
  /**
   * Meja harian: tanggal "YYYY-MM-DD" (WIB) bila bukan hari ini — hanya untuk
   * laporan tanggal lampau yang sedang dibuka lewat buka kunci.
   */
  workDate?: string
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
          : workDate && !editing
            ? { workDate }
            : {}),
      }
      const res = await fetch('/api/tasks', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(Array.isArray(json.errors) && json.errors.length ? json.errors : [json.error || 'Progress belum tersimpan'])
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
  const deskDay = workDate ? new Date(`${workDate}T00:00:00+07:00`) : new Date()
  const dayLabel = weekly ? (lane === 'MINGGUAN' ? 'Capaian mingguan' : formatDateLong(lane)) : formatDateLong(deskDay)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      eyebrow={project?.name ?? projectName}
      title={editing ? 'Ubah progress' : 'Tambah progress'}
      subtitle={dayLabel}
      backLabel="Laporan"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon="selesai" onClick={save} disabled={busy || locked || !title.trim()}>
            {busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan progress'}
          </Button>
        </>
      }
    >
      {locked && (
        <p className="mk-note-box mk-soft--neutral flex items-start gap-2">
          <Icon name="kunci" size={18} className="shrink-0" />
          <span>Laporan hari ini sudah terkunci, jadi progress ini hanya bisa dibaca.</span>
        </p>
      )}

      <section className="mk-formsec">
        <SectionTitle icon="proyek">Judul & proyek</SectionTitle>
        <Field label="Judul task" htmlFor="task-title" required>
          <input
            id="task-title"
            className="mk-lap-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mis. Pemasangan struktur tower segmen 3"
            disabled={locked}
          />
        </Field>
        <Field
          label="Proyek yang sedang dijalani"
          htmlFor="task-project"
          hint={options.length === 1 ? 'Anda memegang satu proyek, jadi proyek ini otomatis terpilih.' : undefined}
        >
          <select
            id="task-project"
            className={selectCls}
            value={chosenProject}
            onChange={(e) => setChosenProject(e.target.value)}
            disabled={locked || editing || options.length === 1}
          >
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} · ` : ''}
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Deskripsi" htmlFor="task-desc">
          <textarea
            id="task-desc"
            className="mk-lap-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Rincian pekerjaan, lokasi, alat, atau catatan penting."
            disabled={locked}
          />
        </Field>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="waktu">Periode pengerjaan</SectionTitle>
        <p className="t-footnote text-ink-2 -mt-2">
          {weekly
            ? 'Pilih hari di minggu ini, atau jadikan capaian mingguan tanpa hari tertentu.'
            : workDate
              ? 'Tanggal laporan yang sedang dibuka (WIB); isi jam mulai dan selesai.'
              : 'Tanggal hari ini (WIB); isi jam mulai dan selesai.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={weekly ? 'Hari pengerjaan' : 'Tanggal'} htmlFor="task-day">
            {weekly ? (
              <select id="task-day" className={selectCls} value={lane} onChange={(e) => setLane(e.target.value)} disabled={locked}>
                {weekly.days.map((d) => (
                  <option key={d} value={wibKey(d)}>
                    {formatDateLong(d)}
                  </option>
                ))}
                <option value="MINGGUAN">Capaian mingguan (tanpa hari)</option>
              </select>
            ) : (
              <div id="task-day" className="mk-lap-static">
                <Icon name="kalender" size={16} className="text-ink-3" />
                {formatDateLong(deskDay)}
              </div>
            )}
          </Field>
          <Field label="Mulai" htmlFor="task-start">
            <input id="task-start" className="mk-lap-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={locked} />
          </Field>
          <Field label="Selesai" htmlFor="task-end">
            <input id="task-end" className="mk-lap-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={locked} />
          </Field>
        </div>
        {startTime && endTime && (
          <p className="t-footnote text-ink-2">
            Durasi: <Duration start={startTime} end={endTime} />
          </p>
        )}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="pengguna">Pelaksana & tag</SectionTitle>
        <div className="mk-formgrid">
          <Field label="Nama pelaksana" htmlFor="task-pic">
            <input id="task-pic" className="mk-lap-input" value={picName} onChange={(e) => setPicName(e.target.value)} placeholder="Siapa yang mengerjakan" disabled={locked} />
          </Field>
          <Field label="Tag" htmlFor="task-tag" hint={tags.length >= 8 ? 'Maksimal 8 tag.' : 'Ketik lalu tekan Enter.'}>
            <input
              id="task-tag"
              className="mk-lap-input"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(tagDraft)
                }
              }}
              placeholder="Mis. Lapangan"
              disabled={locked || tags.length >= 8}
            />
          </Field>
        </div>
        {(tags.length > 0 || !locked) && (
          <div className="mk-lap-chips">
            {tags.map((t) =>
              locked ? (
                <span key={t} className="mk-tag">
                  {t}
                </span>
              ) : (
                <Chip key={t} selected onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`}>
                  <span className="inline-flex items-center gap-1">
                    {t}
                    <Icon name="tutup" size={14} strokeWidth={2.2} />
                  </span>
                </Chip>
              )
            )}
            {!locked &&
              SUGGESTED_TAGS.filter((t) => !tags.includes(t))
                .slice(0, 4)
                .map((t) => (
                  <Chip key={t} onClick={() => addTag(t)} disabled={tags.length >= 8} aria-label={`Tambah tag ${t}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="tambah" size={14} strokeWidth={2.2} />
                      {t}
                    </span>
                  </Chip>
                ))}
          </div>
        )}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="persetujuan">
          Subtask
          {subtasks.length > 0 && (
            <span className="t-footnote text-ink-2 font-normal">
              {doneCount} dari {subtasks.length} selesai
            </span>
          )}
        </SectionTitle>
        {subtasks.length > 0 ? (
          <ul className="mk-list">
            {subtasks.map((s, i) => (
              <li key={i} className="mk-listrow">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={s.isDone}
                  aria-label={s.title}
                  className="mk-lap-check mk-lap-check--flat"
                  onClick={() => setSubtasks(subtasks.map((x, j) => (i === j ? { ...x, isDone: !x.isDone } : x)))}
                  disabled={locked}
                >
                  <span className="mk-lap-check__box">{s.isDone ? <Icon name="selesai" size={16} strokeWidth={2.6} /> : null}</span>
                </button>
                <span className={cx('flex-1 min-w-0 t-body', s.isDone ? 'line-through text-ink-2' : 'text-ink')}>{s.title}</span>
                {!locked && (
                  <IconButton icon="tutup" label={`Hapus subtask ${s.title}`} onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-footnote text-ink-2">Pecah pekerjaan menjadi langkah kecil agar kemajuannya mudah dibaca.</p>
        )}
        {!locked && (
          <div className="flex items-center gap-2">
            <label htmlFor="task-sub" className="mk-sr">
              Langkah kerja baru
            </label>
            <input
              id="task-sub"
              className="mk-lap-input"
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSubtask()
                }
              }}
              placeholder="Tambah langkah kerja"
            />
            <IconButton icon="tambah" label="Tambah subtask" variant="filled" onClick={addSubtask} disabled={!subDraft.trim()} className="shrink-0" />
          </div>
        )}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="aktivitas">Status & progres</SectionTitle>
        <div className="mk-lap-chips" role="group" aria-label="Status task">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              selected={status === s}
              status={TASK_STATUS_META[s].status}
              onClick={() => setStatus(s)}
              disabled={locked}
            >
              {TASK_STATUS_META[s].label}
            </Chip>
          ))}
        </div>
        <Field label={`Progres ${progressPct}%`} htmlFor="task-progress">
          <input
            id="task-progress"
            className="mk-lap-range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={progressPct}
            onChange={(e) => setProgressPct(Number(e.target.value))}
            disabled={locked}
          />
        </Field>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="peringatan">Urgensi</SectionTitle>
        <ChoiceGroup aria-label="Urgensi">
          {URGENCIES.map((u) => {
            const m = URGENCY_META[u]
            const active = urgency === u
            return (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={active}
                className={cx('mk-choice', active && 'is-on')}
                onClick={() => setUrgency(u)}
                disabled={locked}
              >
                <span className="mk-choice__radio" aria-hidden />
                <span>
                  <span className="mk-choice__title">
                    <span className="inline-flex items-center gap-2">
                      <span className={cx('mk-dot', 'mk-bg--' + (URGENCY_STATUS[u] ?? 'neutral'))} aria-hidden />
                      {m.label}
                    </span>
                  </span>
                  <span className="mk-choice__hint">{m.hint}</span>
                </span>
              </button>
            )
          })}
        </ChoiceGroup>
      </section>

      {needsObstacle && (
        <section className="mk-formsec">
          <Field label="Uraian kendala" htmlFor="task-obstacle" required hint="Tulis faktanya: apa yang menghambat, sejak kapan, dan dampaknya.">
            <textarea
              id="task-obstacle"
              className="mk-lap-input"
              rows={3}
              value={obstacle}
              onChange={(e) => setObstacle(e.target.value)}
              placeholder="Mis. Perangkat uji belum tiba sejak Senin"
              disabled={locked}
            />
          </Field>
        </section>
      )}
      {needsDecision && (
        <section className="mk-formsec">
          <Field label="Keputusan yang dibutuhkan" htmlFor="task-decision" required hint="Keputusan apa yang diminta, dari siapa, dan batas waktunya.">
            <textarea
              id="task-decision"
              className="mk-lap-input"
              rows={3}
              value={decisionNeeded}
              onChange={(e) => setDecisionNeeded(e.target.value)}
              placeholder="Mis. Persetujuan geser jadwal rilis ke 31 Oktober"
              disabled={locked}
            />
          </Field>
        </section>
      )}

      {editing ? (
        <EvidencePanel targetType="TASK" targetId={task!.id} items={task!.evidence ?? []} disabled={locked} onChanged={onSaved} />
      ) : (
        <p className="t-footnote text-ink-2">Dokumen dan foto dapat dilampirkan setelah progress disimpan.</p>
      )}

      {errors.length > 0 && (
        <div className="mk-note-box mk-soft--late flex flex-col gap-1" role="alert">
          {errors.map((e, i) => (
            <p key={i} className="flex items-start gap-2">
              <Icon name="peringatan" size={18} className="shrink-0" />
              <span>{e}</span>
            </p>
          ))}
        </div>
      )}
    </Sheet>
  )
}

function Duration({ start, end }: { start: string; end: string }) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  if (mins <= 0) return <span className="text-bahaya font-medium">jam selesai harus setelah jam mulai</span>
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return (
    <span className="font-semibold text-ink tabular-nums">
      {h > 0 ? `${h} jam ` : ''}
      {m > 0 ? `${m} menit` : ''}
    </span>
  )
}
