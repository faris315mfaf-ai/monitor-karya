'use client'

import { useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { DailyStatusBadge, WeeklyHeaderBadge, WeeklyItemStatusBadge, PriorityBadge } from '@/components/status-badges'
import { TASK_STATUS_META } from '@/components/task-dialog'
import { ACTIVITY_PRIORITY_OPTIONS, DAY_SHORT_ID, PROJECT_PHASE_LABELS, URGENCY_META } from '@/lib/constants'
import { formatDate, formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Building2, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Filter, FolderKanban,
  Paperclip, Users,
} from 'lucide-react'

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

const CADENCE_TABS: { id: Cadence; label: string; icon: typeof CalendarDays }[] = [
  { id: 'HARIAN', label: 'Harian', icon: CalendarDays },
  { id: 'MINGGUAN', label: 'Mingguan', icon: CalendarRange },
  { id: 'BULANAN', label: 'Bulanan', icon: ClipboardCheck },
]

/** Nama hari pendek (WIB) untuk sebuah instan. */
function dayChip(iso: string): string {
  const wib = new Date(new Date(iso).getTime() + 7 * 3600000)
  const dow = (wib.getUTCDay() + 6) % 7
  return `${DAY_SHORT_ID[dow]} ${wib.getUTCDate()}`
}

function periodTitle(d: Data): string {
  if (d.cadence === 'HARIAN') return formatDateLong(d.period.start)
  if (d.cadence === 'MINGGUAN') return `Minggu ${d.period.isoWeek} · ${formatDate(d.period.start)} – ${formatDate(d.period.end)}`
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(d.period.start))
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
  const { data, loading, error } = useFetch<Data>(url)

  const allCollapsed = data ? data.entities.every((e) => collapsed[e.id]) : false

  return (
    <section className="space-y-3" aria-label="Aktivitas per perusahaan">
      {/* Pengaturan: kadens · tanggal · prioritas */}
      <div className="glass rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shrink-0 shadow-glow-blue">
              <Building2 className="h-4.5 w-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">Aktivitas per Perusahaan</div>
              <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{data ? periodTitle(data) : 'Memuat…'}</div>
            </div>
          </div>
          <div className="flex-1" />
          <div className="grid grid-cols-3 gap-1 glass rounded-xl p-1">
            {CADENCE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCadence(t.id)}
                aria-pressed={cadence === t.id}
                className={cn(
                  'h-10 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors',
                  cadence === t.id ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue' : 'text-slate-600 dark:text-slate-300 hover:bg-blue-500/10'
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Periode sebelumnya" disabled={!data} onClick={() => data && setDate(data.prev)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="date" value={date || data?.date || ''} onChange={(e) => setDate(e.target.value)} aria-label="Tanggal" className="h-10 w-[160px] bg-white/70 dark:bg-slate-900/50 text-sm" />
          <Button variant="outline" size="icon-sm" aria-label="Periode berikutnya" disabled={!data} onClick={() => data && setDate(data.next)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-10 text-sm" disabled={!date} onClick={() => setDate('')}>
            Hari ini
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 ml-auto">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="sr-only">Skala prioritas</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Skala prioritas"
              className="h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-2.5 text-sm text-slate-800 dark:text-slate-100"
            >
              {ACTIVITY_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {data && data.entities.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-sm"
              onClick={() => setCollapsed(Object.fromEntries(data.entities.map((e) => [e.id, !allCollapsed])))}
            >
              {allCollapsed ? 'Buka semua' : 'Tutup semua'}
            </Button>
          )}
        </div>
        {priority !== 'ALL' && (
          <p className="text-[13px] text-amber-700 dark:text-amber-300">
            Penyaring prioritas berlaku pada task proyek dan item divisi; laporan proyek tidak membawa prioritas, jadi disembunyikan.
          </p>
        )}
      </div>

      {loading && !data ? (
        <LoadingSpinner className="py-8" />
      ) : error || !data ? (
        <EmptyState title="Gagal memuat aktivitas perusahaan" description={error ?? undefined} />
      ) : data.entities.length === 0 ? (
        <EmptyState title="Tidak ada perusahaan dalam cakupan Anda" />
      ) : (
        <div className={cn('space-y-3', loading && 'opacity-60 transition-opacity')}>
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
    </section>
  )
}

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'rose' | 'amber' | 'blue' | 'violet' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-200',
    emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums', tones[tone])}>{children}</span>
}

function EntitySection({ entity: e, cadence, open, onToggle }: { entity: Entity; cadence: Cadence; open: boolean; onToggle: () => void }) {
  const s = e.stats
  const quiet = s.tasks === 0 && s.dailyReports === 0 && s.weeklyItems === 0 && e.projects.every((p) => !p.progressReport)
  const initials = e.name.replace(/^PT\s+/i, '').slice(0, 2).toUpperCase()

  return (
    <article className="glass rounded-2xl overflow-hidden card-hover">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-4 py-3.5 flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold text-base flex items-center justify-center shrink-0 shadow-glow-blue">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{e.name}</span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{e.code}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone="blue"><FolderKanban className="h-3 w-3" /> {s.projects} proyek</Chip>
            <Chip tone="violet"><Users className="h-3 w-3" /> {s.divisions} divisi</Chip>
            {s.tasks > 0 && <Chip>{s.tasks} task · {s.tasksDone} selesai</Chip>}
            {s.tasksBlocked > 0 && <Chip tone="rose">{s.tasksBlocked} task terhambat</Chip>}
            {cadence !== 'BULANAN' ? (
              s.dailyReports > 0 && <Chip tone="emerald">{s.dailyReports} laporan harian{s.dailyLate > 0 ? ` · ${s.dailyLate} terlambat` : ''}</Chip>
            ) : (
              <Chip tone="emerald">{s.dailyReports} laporan harian · {s.weeklyReports} mingguan divisi</Chip>
            )}
            {s.weeklyItems > 0 && <Chip tone="amber">{s.weeklyItems} item divisi{s.weeklyItemsBlocked > 0 ? ` · ${s.weeklyItemsBlocked} terkendala` : ''}</Chip>}
          </div>
        </div>
        <ChevronDown className={cn('h-5 w-5 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-white/40 dark:border-white/10 px-4 py-4">
          {quiet ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada aktivitas tercatat pada periode ini.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <FolderKanban className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Proyek
                </h4>
                {e.projects.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada proyek aktif.</p>}
                {e.projects.map((p) => (
                  <ProjectBlock key={p.id} project={p} cadence={cadence} />
                ))}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" /> Divisi
                </h4>
                {e.divisions.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada divisi.</p>}
                {e.divisions.map((d) => (
                  <DivisionBlock key={d.id} division={d} cadence={cadence} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
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
    <div className="rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug">{p.name}</div>
          <div className="text-[12px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-1.5">
            <span className="font-mono">{p.code}</span>
            <span>· {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}</span>
            {p.picName && <span>· PIC {p.picName}</span>}
          </div>
        </div>
        {todays ? <DailyStatusBadge status={todays.status} size="xs" /> : pr ? <DailyStatusBadge status={pr.status} size="xs" /> : null}
      </div>

      {/* Laporan kemajuan minggu/bulan */}
      {pr && (
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Laporan {cadence === 'MINGGUAN' ? 'mingguan' : 'bulanan'}</span>
            <span>· {pr.submitted ? 'terkirim' : 'draft'}</span>
            {pr.evidenceCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> {pr.evidenceCount}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={pr.progressPct} className="h-1.5 flex-1" />
            <span className="text-xs tabular-nums font-semibold">{pr.progressPct}%</span>
          </div>
          <p className="text-[13px] text-slate-700 dark:text-slate-200">{pr.summary}</p>
          {pr.obstacle && <p className="text-[12px] text-rose-700 dark:text-rose-300"><strong>Kendala:</strong> {pr.obstacle}</p>}
          {pr.followUp && <p className="text-[12px] text-blue-700 dark:text-blue-300"><strong>Tindak lanjut:</strong> {pr.followUp}</p>}
        </div>
      )}

      {/* Laporan harian */}
      {cadence === 'HARIAN' &&
        (todays ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Progress value={todays.progressPct} className="h-1.5 flex-1" />
              <span className="text-xs tabular-nums font-semibold">{todays.progressPct}%</span>
              {todays.late && <Chip tone="rose">terlambat</Chip>}
              {!todays.submitted && <Chip tone="amber">belum dikirim</Chip>}
            </div>
            <p className="text-[13px] text-slate-700 dark:text-slate-200">{todays.achievement}</p>
            {todays.obstacle && <p className="text-[12px] text-rose-700 dark:text-rose-300"><strong>Kendala:</strong> {todays.obstacle}</p>}
            {todays.followUp && <p className="text-[12px] text-blue-700 dark:text-blue-300"><strong>Tindak lanjut:</strong> {todays.followUp}</p>}
          </div>
        ) : (
          p.tasks.length === 0 && <p className="text-[13px] text-slate-500 dark:text-slate-400">Belum ada laporan harian.</p>
        ))}
      {cadence === 'MINGGUAN' && p.dailyReports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.dailyReports.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[11px] text-slate-700 dark:text-slate-200" title={r.achievement}>
              {dayChip(r.date)} <DailyStatusBadge status={r.status} size="xs" />
            </span>
          ))}
        </div>
      )}
      {cadence === 'BULANAN' && (
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="emerald">{p.dailyStats.submitted} laporan harian</Chip>
          {p.dailyStats.late > 0 && <Chip tone="rose">{p.dailyStats.late} terlambat</Chip>}
          {p.dailyStats.blocked > 0 && <Chip tone="amber">{p.dailyStats.blocked} terkendala</Chip>}
          {p.taskStats.total > 0 && <Chip>{p.taskStats.total} task · {p.taskStats.done} selesai</Chip>}
        </div>
      )}

      {/* Task */}
      {p.tasks.length > 0 && (
        <div className="space-y-1.5">
          {cadence !== 'HARIAN' && (
            <button type="button" onClick={() => setShowTasks((v) => !v)} aria-expanded={showTasks} className="text-[13px] font-medium text-blue-600 dark:text-blue-300 inline-flex items-center gap-1">
              {p.tasks.length} task{cadence === 'BULANAN' ? ' terhambat' : ''} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTasks && 'rotate-180')} />
            </button>
          )}
          {showTasks &&
            Array.from(groups.entries()).map(([label, tasks]) => (
              <div key={label} className="space-y-1">
                {cadence !== 'HARIAN' && (
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label === 'MINGGUAN' ? 'Capaian mingguan' : label}</div>
                )}
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task: t }: { task: Task }) {
  const meta = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.BELUM_MULAI
  const urg = URGENCY_META[t.urgency] ?? URGENCY_META.SEDANG
  return (
    <div className={cn('rounded-lg bg-white/60 dark:bg-slate-900/40 px-2.5 py-2 border-l-2', t.urgency === 'KRITIS' ? 'border-l-rose-500' : t.urgency === 'TINGGI' ? 'border-l-amber-500' : t.urgency === 'RENDAH' ? 'border-l-slate-300' : 'border-l-blue-500')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 leading-snug">{t.title}</span>
        <span className={cn('shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full', meta.chip)}>{meta.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className={cn('inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full', urg.bg, urg.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', urg.dot)} /> {urg.label}
        </span>
        {t.picName && <span>PIC {t.picName}</span>}
        {t.subtaskTotal > 0 && <span>{t.subtaskDone}/{t.subtaskTotal} langkah</span>}
        <span className="tabular-nums ml-auto">{t.progressPct}%</span>
      </div>
      {t.note && <p className="mt-1 text-[12px] text-rose-700 dark:text-rose-300 line-clamp-2">{t.note}</p>}
    </div>
  )
}

function DivisionBlock({ division: d, cadence }: { division: Division; cadence: Cadence }) {
  const report = d.reports[0] ?? null
  return (
    <div className="rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug">{d.name}</div>
          {d.headName && <div className="text-[12px] text-slate-500 dark:text-slate-400">Kepala: {d.headName}</div>}
        </div>
        {cadence !== 'BULANAN' ? (
          report ? <WeeklyHeaderBadge status={report.statusHeader} /> : <Chip tone="amber">belum lapor</Chip>
        ) : (
          <div className="flex flex-wrap gap-1 justify-end">
            {d.reports.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                M{r.isoWeek} <WeeklyHeaderBadge status={r.statusHeader} />
              </span>
            ))}
            {d.reports.length === 0 && <Chip tone="amber">belum lapor</Chip>}
          </div>
        )}
      </div>

      {cadence === 'BULANAN' && (
        <div className="flex flex-wrap gap-1.5">
          <Chip>{d.itemStats.total} item · {d.itemStats.done} selesai</Chip>
          {d.itemStats.blocked > 0 && <Chip tone="rose">{d.itemStats.blocked} terkendala</Chip>}
        </div>
      )}

      {d.items.length === 0 ? (
        cadence !== 'BULANAN' && <p className="text-[13px] text-slate-500 dark:text-slate-400">Tidak ada item pada periode ini.</p>
      ) : (
        <div className="space-y-1.5">
          {d.items.map((it) => (
            <div key={it.id} className={cn('rounded-lg bg-white/60 dark:bg-slate-900/40 px-2.5 py-2 border-l-2', it.priority === 'TINGGI' ? 'border-l-rose-500' : it.priority === 'RENDAH' ? 'border-l-sky-400' : 'border-l-amber-500')}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 leading-snug">{it.workItem}</span>
                <WeeklyItemStatusBadge status={it.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <PriorityBadge priority={it.priority} />
                {it.workDate && cadence !== 'HARIAN' && <Chip tone="blue">{dayChip(it.workDate)}</Chip>}
                <span>{it.aspect}</span>
                <span>PIC {it.picName}</span>
                <span className="tabular-nums ml-auto">{it.progressPct}%</span>
              </div>
              {it.achievement && <p className="mt-1 text-[12px] text-slate-700 dark:text-slate-200 line-clamp-2">{it.achievement}</p>}
              {it.obstacle && <p className="mt-0.5 text-[12px] text-rose-700 dark:text-rose-300 line-clamp-2"><strong>Kendala:</strong> {it.obstacle}</p>}
              {it.followUp && <p className="mt-0.5 text-[12px] text-blue-700 dark:text-blue-300 line-clamp-2"><strong>Tindak lanjut:</strong> {it.followUp}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
