'use client'

import { useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import {
  Avatar, Button, Card, EmptyNote, ErrorNote, Icon, IconButton, ProgressBar, SegmentedControl, Skeleton, StatusBadge,
  cx, type Status,
} from '@/components/mk'
import { DailyStatusBadge, WeeklyHeaderBadge, WeeklyItemStatusBadge, PriorityBadge } from '@/components/status-badges'
import { TASK_STATUS_META } from '@/components/task-dialog'
import { ACTIVITY_PRIORITY_OPTIONS, DAY_SHORT_ID, PROJECT_PHASE_LABELS, URGENCY_META } from '@/lib/constants'
import { formatDate, formatDateLong } from '@/lib/format'

type Cadence = 'HARIAN' | 'MINGGUAN' | 'BULANAN'

type Task = {
  id: string
  title: string
  workDate: string
  scope: string
  status: string
  progressPct: number
  urgency: string
  picName: string | null
  note: string | null
  subtaskDone: number
  subtaskTotal: number
}

type DailyReport = {
  id: string
  date: string
  status: string
  progressPct: number
  achievement: string
  obstacle: string | null
  followUp: string | null
  submitted: boolean
  late: boolean
  evidenceCount: number
}

type Project = {
  id: string
  code: string
  name: string
  phase: string
  picName: string | null
  tasks: Task[]
  taskStats: { total: number; done: number; blocked: number }
  dailyReports: DailyReport[]
  dailyStats: { submitted: number; late: number; blocked: number }
  progressReport: {
    status: string
    progressPct: number
    summary: string
    obstacle: string | null
    followUp: string | null
    submitted: boolean
    evidenceCount: number
  } | null
}

type Item = {
  id: string
  workItem: string
  workDate: string | null
  status: string
  progressPct: number
  achievement: string
  obstacle: string | null
  followUp: string | null
  priority: string
  aspect: string
  picName: string
  evidenceCount: number
}

type Division = {
  id: string
  name: string
  headName: string | null
  reports: { id: string; isoWeek: number; statusHeader: string; submitted: boolean; approved: boolean; itemCount: number }[]
  items: Item[]
  itemStats: { total: number; done: number; blocked: number }
}

type Entity = {
  id: string
  code: string
  name: string
  region: string | null
  stats: {
    projects: number
    divisions: number
    tasks: number
    tasksDone: number
    tasksBlocked: number
    dailyReports: number
    dailyLate: number
    weeklyItems: number
    weeklyItemsBlocked: number
    weeklyReports: number
  }
  projects: Project[]
  divisions: Division[]
}

type Data = {
  cadence: Cadence
  priority: string
  date: string
  period: { key: string; start: string; end: string; isoWeek: number; isoYear: number }
  prev: string
  next: string
  today: string
  entities: Entity[]
}

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'HARIAN', label: 'Harian' },
  { value: 'MINGGUAN', label: 'Mingguan' },
  { value: 'BULANAN', label: 'Bulanan' },
]

/** Status task → kosakata status desain. */
const TASK_STATUS: Record<string, Status> = {
  BELUM_MULAI: 'neutral',
  BERJALAN: 'on',
  SELESAI: 'done',
  TERKENDALA: 'risk',
  MENUNGGU_KEPUTUSAN: 'info',
}
/** Urgensi task / prioritas item → nada garis tepi & titik. */
const URGENCY_TONE: Record<string, Status> = { KRITIS: 'late', TINGGI: 'risk', SEDANG: 'info', RENDAH: 'neutral' }
const PRIORITY_TONE: Record<string, Status> = { TINGGI: 'late', SEDANG: 'risk', RENDAH: 'info' }

/** Nama hari pendek (WIB) untuk sebuah instan. */
function dayChip(iso: string): string {
  const wib = new Date(new Date(iso).getTime() + 7 * 3600000)
  const dow = (wib.getUTCDay() + 6) % 7
  return `${DAY_SHORT_ID[dow]} ${wib.getUTCDate()}`
}

function periodTitle(d: Data): string {
  if (d.cadence === 'HARIAN') return formatDateLong(d.period.start)
  if (d.cadence === 'MINGGUAN') return `Minggu ${d.period.isoWeek} · ${formatDate(d.period.start)}–${formatDate(d.period.end)}`
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(d.period.start))
}

/** Satu kalimat jawaban untuk periode yang dipilih. */
function periodAnswer(d: Data): string {
  if (d.entities.length === 0) return 'Tidak ada perusahaan dalam cakupan Anda.'
  const active = d.entities.filter(
    (e) => e.stats.tasks > 0 || e.stats.dailyReports > 0 || e.stats.weeklyItems > 0 || e.projects.some((p) => p.progressReport)
  ).length
  const blocked = d.entities.reduce((s, e) => s + e.stats.tasksBlocked + e.stats.weeklyItemsBlocked, 0)
  const head = `${active} dari ${d.entities.length} perusahaan mencatat aktivitas`
  return blocked > 0 ? `${head}; ${blocked} pekerjaan terhambat.` : `${head}; tidak ada yang terhambat.`
}

/**
 * Bagian teratas dashboard pengawas (8 Sep 2026): apa yang dikerjakan tiap
 * perusahaan pada tanggal / minggu / bulan yang dipilih, disaring menurut
 * skala prioritas. Satu bagian per PT — proyek-proyeknya (task, laporan
 * harian, laporan kemajuan) dan divisi-divisinya (item mingguan).
 */
export function EntityActivityBoard() {
  const [cadence, setCadence] = useState<Cadence>('HARIAN')
  const [date, setDate] = useState('')
  const [priority, setPriority] = useState('ALL')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const url = `/api/entity-activity?cadence=${cadence}&priority=${priority}${date ? `&date=${date}` : ''}`
  const { data, loading, error, reload } = useFetch<Data>(url)

  const allCollapsed = data ? data.entities.every((e) => collapsed[e.id]) : false

  return (
    <Card
      title="Aktivitas per perusahaan"
      subtitle={data ? `${periodTitle(data)} · ${periodAnswer(data)}` : 'Memuat periode…'}
      ariaLabel="Aktivitas per perusahaan"
    >
      <div className="flex flex-col gap-4">
        {/* Pengaturan: kadens · tanggal · prioritas */}
        <div className="mk-actboard__controls">
          <SegmentedControl
            label="Rentang"
            options={CADENCE_OPTIONS}
            value={cadence}
            onChange={(v) => setCadence(v as Cadence)}
          />
          <div className="flex items-center gap-1">
            <IconButton icon="kiri" label="Periode sebelumnya" disabled={!data} onClick={() => data && setDate(data.prev)} />
            <input
              type="date"
              className="mk-adm-input is-date"
              value={date || data?.date || ''}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Tanggal"
            />
            <IconButton icon="kanan" label="Periode berikutnya" disabled={!data} onClick={() => data && setDate(data.next)} />
          </div>
          <Button size="sm" variant="plain" disabled={!date} onClick={() => setDate('')}>
            Kembali ke hari ini
          </Button>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Skala prioritas" className="mk-select">
              {ACTIVITY_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {data && data.entities.length > 1 ? (
              <Button size="sm" variant="plain" onClick={() => setCollapsed(Object.fromEntries(data.entities.map((e) => [e.id, !allCollapsed])))}>
                {allCollapsed ? 'Buka semua' : 'Ciutkan semua'}
              </Button>
            ) : null}
          </div>
        </div>
        {priority !== 'ALL' ? (
          <p className="mk-note-box mk-soft--info t-footnote">
            Saringan prioritas berlaku pada task proyek dan item divisi. Laporan proyek tidak membawa prioritas, jadi disembunyikan.
          </p>
        ) : null}

        {loading && !data ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat aktivitas">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={72} r={14} />
            ))}
          </div>
        ) : error || !data ? (
          <ErrorNote message={error ?? 'Aktivitas perusahaan belum termuat.'} onRetry={reload} />
        ) : data.entities.length === 0 ? (
          <EmptyNote icon="gedung">Tidak ada perusahaan dalam cakupan Anda.</EmptyNote>
        ) : (
          <div className={cx('flex flex-col gap-3', loading && 'mk-is-loading')} aria-busy={loading || undefined}>
            {data.entities.map((e) => (
              <EntitySection
                key={e.id}
                entity={e}
                cadence={data.cadence}
                open={!collapsed[e.id]}
                onToggle={() => setCollapsed((c) => ({ ...c, [e.id]: !c[e.id] }))}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="mk-tag mk-adm-num">{children}</span>
}

function EntitySection({ entity: e, cadence, open, onToggle }: { entity: Entity; cadence: Cadence; open: boolean; onToggle: () => void }) {
  const s = e.stats
  const quiet = s.tasks === 0 && s.dailyReports === 0 && s.weeklyItems === 0 && e.projects.every((p) => !p.progressReport)
  const initials = e.name.replace(/^PT\s+/i, '').slice(0, 2).toUpperCase()
  const bodyId = `akt-${e.id}`

  return (
    <article className="mk-entsec">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId} className="mk-entsec__head">
        <Avatar initials={initials} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="t-headline text-ink">{e.name}</span>
            <span className="mk-adm-code">{e.code}</span>
          </div>
          <div className="mk-entsec__tags">
            <Tag>{s.projects} proyek</Tag>
            <Tag>{s.divisions} divisi</Tag>
            {s.tasks > 0 ? <Tag>{s.tasks} task · {s.tasksDone} selesai</Tag> : null}
            {cadence !== 'BULANAN' ? (
              s.dailyReports > 0 ? <Tag>{s.dailyReports} laporan harian</Tag> : null
            ) : (
              <Tag>
                {s.dailyReports} laporan harian · {s.weeklyReports} mingguan divisi
              </Tag>
            )}
            {s.weeklyItems > 0 ? <Tag>{s.weeklyItems} item divisi</Tag> : null}
            {s.tasksBlocked > 0 ? <StatusBadge status="risk" size="sm">{s.tasksBlocked} task terhambat</StatusBadge> : null}
            {cadence !== 'BULANAN' && s.dailyLate > 0 ? <StatusBadge status="late" size="sm">{s.dailyLate} laporan terlambat</StatusBadge> : null}
            {s.weeklyItemsBlocked > 0 ? <StatusBadge status="risk" size="sm">{s.weeklyItemsBlocked} item terkendala</StatusBadge> : null}
          </div>
        </div>
        <Icon name="bawah" size={20} className={cx('mk-entsec__chev', open && 'is-open')} />
      </button>

      {open ? (
        <div className="mk-entsec__body" id={bodyId}>
          {quiet ? (
            <EmptyNote icon="kalender">Tidak ada aktivitas tercatat pada periode ini.</EmptyNote>
          ) : (
            <div className="mk-entsec__cols">
              <div className="flex flex-col gap-3 min-w-0">
                <h4 className="t-body-strong text-ink-2 flex items-center gap-2">
                  <Icon name="proyek" size={16} /> Proyek
                </h4>
                {e.projects.length === 0 ? <p className="t-footnote text-ink-2">Belum ada proyek aktif.</p> : null}
                {e.projects.map((p) => (
                  <ProjectBlock key={p.id} project={p} cadence={cadence} />
                ))}
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <h4 className="t-body-strong text-ink-2 flex items-center gap-2">
                  <Icon name="tim" size={16} /> Divisi
                </h4>
                {e.divisions.length === 0 ? <p className="t-footnote text-ink-2">Belum ada divisi.</p> : null}
                {e.divisions.map((d) => (
                  <DivisionBlock key={d.id} division={d} cadence={cadence} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}

function Notes({ obstacle, followUp, clamp }: { obstacle: string | null; followUp: string | null; clamp?: boolean }) {
  return (
    <>
      {obstacle ? (
        <p className={cx('mk-actnote is-obstacle', clamp && 'line-clamp-2')}>
          <strong>Kendala:</strong> {obstacle}
        </p>
      ) : null}
      {followUp ? (
        <p className={cx('mk-actnote is-follow', clamp && 'line-clamp-2')}>
          <strong>Tindak lanjut:</strong> {followUp}
        </p>
      ) : null}
    </>
  )
}

function ProjectBlock({ project: p, cadence }: { project: Project; cadence: Cadence }) {
  const [showTasks, setShowTasks] = useState(cadence === 'HARIAN')
  const pr = p.progressReport
  const todays = cadence === 'HARIAN' ? (p.dailyReports[0] ?? null) : null

  // Kelompokkan task per hari untuk tampilan mingguan.
  const groups = new Map<string, Task[]>()
  for (const t of p.tasks) {
    const key = t.scope === 'MINGGUAN' ? 'MINGGUAN' : dayChip(t.workDate)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  return (
    <div className="mk-actblock">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="t-body-strong text-ink">{p.name}</div>
          <div className="t-footnote text-ink-2 flex flex-wrap gap-x-1.5">
            <span className="font-mono">{p.code}</span>
            <span>· {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}</span>
            {p.picName ? <span>· PIC {p.picName}</span> : null}
          </div>
        </div>
        {todays ? <DailyStatusBadge status={todays.status} size="xs" /> : pr ? <DailyStatusBadge status={pr.status} size="xs" /> : null}
      </div>

      {/* Laporan kemajuan minggu/bulan */}
      {pr ? (
        <div className="mk-inset flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 t-footnote text-ink-2">
            <span className="t-body-strong text-ink">Laporan {cadence === 'MINGGUAN' ? 'mingguan' : 'bulanan'}</span>
            {pr.submitted ? <StatusBadge status="done" size="sm">Terkirim</StatusBadge> : <StatusBadge status="neutral" size="sm">Draf</StatusBadge>}
            {pr.evidenceCount > 0 ? <span className="mk-adm-num">{pr.evidenceCount} bukti</span> : null}
          </div>
          <ProgressBar value={pr.progressPct} label={`Progres ${p.name}`} />
          <p className="t-footnote text-ink">{pr.summary}</p>
          <Notes obstacle={pr.obstacle} followUp={pr.followUp} />
        </div>
      ) : null}

      {/* Laporan harian */}
      {cadence === 'HARIAN' &&
        (todays ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ProgressBar value={todays.progressPct} className="flex-1 min-w-32" label={`Progres harian ${p.name}`} />
              {todays.late ? <StatusBadge status="late" size="sm">Terlambat</StatusBadge> : null}
              {!todays.submitted ? <StatusBadge status="risk" size="sm">Belum dikirim</StatusBadge> : null}
            </div>
            <p className="t-footnote text-ink">{todays.achievement}</p>
            <Notes obstacle={todays.obstacle} followUp={todays.followUp} />
          </div>
        ) : p.tasks.length === 0 ? (
          <p className="t-footnote text-ink-2">Belum ada laporan harian.</p>
        ) : null)}
      {cadence === 'MINGGUAN' && p.dailyReports.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {p.dailyReports.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 t-caption text-ink-2" title={r.achievement}>
              {dayChip(r.date)} <DailyStatusBadge status={r.status} size="xs" />
            </span>
          ))}
        </div>
      ) : null}
      {cadence === 'BULANAN' ? (
        <div className="flex flex-wrap gap-1.5">
          <Tag>{p.dailyStats.submitted} laporan harian</Tag>
          {p.dailyStats.late > 0 ? <StatusBadge status="late" size="sm">{p.dailyStats.late} terlambat</StatusBadge> : null}
          {p.dailyStats.blocked > 0 ? <StatusBadge status="risk" size="sm">{p.dailyStats.blocked} terkendala</StatusBadge> : null}
          {p.taskStats.total > 0 ? <Tag>{p.taskStats.total} task · {p.taskStats.done} selesai</Tag> : null}
        </div>
      ) : null}

      {/* Task */}
      {p.tasks.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {cadence !== 'HARIAN' ? (
            <button type="button" onClick={() => setShowTasks((v) => !v)} aria-expanded={showTasks} className="mk-disclose">
              {showTasks ? 'Sembunyikan' : 'Tampilkan'} {p.tasks.length} task{cadence === 'BULANAN' ? ' terhambat' : ''}
              <Icon name="bawah" size={16} className={cx('mk-entsec__chev', showTasks && 'is-open')} />
            </button>
          ) : null}
          {showTasks &&
            Array.from(groups.entries()).map(([label, tasks]) => (
              <div key={label} className="flex flex-col gap-1.5">
                {cadence !== 'HARIAN' ? <div className="t-caption text-ink-2">{label === 'MINGGUAN' ? 'Capaian mingguan' : label}</div> : null}
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}

function TaskRow({ task: t }: { task: Task }) {
  const meta = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.BELUM_MULAI
  const urg = URGENCY_META[t.urgency] ?? URGENCY_META.SEDANG
  const urgTone = URGENCY_TONE[t.urgency] ?? 'info'
  return (
    <div className={cx('mk-actitem', `is-${urgTone}`)}>
      <div className="flex items-start justify-between gap-2">
        <span className="t-footnote text-ink font-medium">{t.title}</span>
        <StatusBadge status={TASK_STATUS[t.status] ?? 'neutral'} size="sm">
          {meta.label}
        </StatusBadge>
      </div>
      <div className="mk-actitem__meta">
        <span className="inline-flex items-center gap-1">
          <span className={cx('mk-dot', `mk-bg--${urgTone}`)} aria-hidden /> Urgensi {urg.label.toLowerCase()}
        </span>
        {t.picName ? <span>PIC {t.picName}</span> : null}
        {t.subtaskTotal > 0 ? (
          <span className="mk-adm-num">
            {t.subtaskDone} dari {t.subtaskTotal} langkah
          </span>
        ) : null}
        <span className="mk-adm-num ml-auto">{t.progressPct}%</span>
      </div>
      {t.note ? <p className="mk-actnote is-obstacle line-clamp-2">{t.note}</p> : null}
    </div>
  )
}

function DivisionBlock({ division: d, cadence }: { division: Division; cadence: Cadence }) {
  const report = d.reports[0] ?? null
  return (
    <div className="mk-actblock">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="t-body-strong text-ink">{d.name}</div>
          {d.headName ? <div className="t-footnote text-ink-2">Kepala: {d.headName}</div> : null}
        </div>
        {cadence !== 'BULANAN' ? (
          report ? (
            <WeeklyHeaderBadge status={report.statusHeader} />
          ) : (
            <StatusBadge status="risk" size="sm">Belum masuk</StatusBadge>
          )
        ) : (
          <div className="flex flex-wrap gap-1 justify-end">
            {d.reports.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 t-caption text-ink-2">
                M{r.isoWeek} <WeeklyHeaderBadge status={r.statusHeader} />
              </span>
            ))}
            {d.reports.length === 0 ? <StatusBadge status="risk" size="sm">Belum masuk</StatusBadge> : null}
          </div>
        )}
      </div>

      {cadence === 'BULANAN' ? (
        <div className="flex flex-wrap gap-1.5">
          <Tag>
            {d.itemStats.total} item · {d.itemStats.done} selesai
          </Tag>
          {d.itemStats.blocked > 0 ? <StatusBadge status="risk" size="sm">{d.itemStats.blocked} terkendala</StatusBadge> : null}
        </div>
      ) : null}

      {d.items.length === 0 ? (
        cadence !== 'BULANAN' ? <p className="t-footnote text-ink-2">Tidak ada item pada periode ini.</p> : null
      ) : (
        <div className="flex flex-col gap-1.5">
          {d.items.map((it) => (
            <div key={it.id} className={cx('mk-actitem', `is-${PRIORITY_TONE[it.priority] ?? 'risk'}`)}>
              <div className="flex items-start justify-between gap-2">
                <span className="t-footnote text-ink font-medium">{it.workItem}</span>
                <WeeklyItemStatusBadge status={it.status} />
              </div>
              <div className="mk-actitem__meta">
                <PriorityBadge priority={it.priority} />
                {it.workDate && cadence !== 'HARIAN' ? <Tag>{dayChip(it.workDate)}</Tag> : null}
                <span>{it.aspect}</span>
                <span>PIC {it.picName}</span>
                <span className="mk-adm-num ml-auto">{it.progressPct}%</span>
              </div>
              {it.achievement ? <p className="mk-actnote text-ink line-clamp-2">{it.achievement}</p> : null}
              <Notes obstacle={it.obstacle} followUp={it.followUp} clamp />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
