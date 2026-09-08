'use client'

import { useApp } from '@/components/app-provider'
import { StatCard } from '@/components'
import { DailyStatusBadge, WeeklyHeaderBadge } from '@/components/status-badges'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/loading-states'
import { PROJECT_PHASE_LABELS, ROLE_LABELS } from '@/lib/constants'
import { ROLE_DUTIES } from '@/lib/rbac'
import { formatDate, formatDateLong, formatPercent, formatTime } from '@/lib/format'
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, CalendarCheck, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock, FolderKanban, Hourglass, Inbox, Lock, Paperclip, Plus, Siren, Users,
} from 'lucide-react'

// ------------------------------------------------------------------
// Shared chrome
// ------------------------------------------------------------------

function Header({ subtitle, right }: { subtitle: string; right?: React.ReactNode }) {
  const { user } = useApp()
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Dashboard {ROLE_LABELS[user.role] ?? 'Pemantauan'}
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        {right}
      </div>
      {ROLE_DUTIES[user.role] && (
        <div className="glass rounded-xl px-3 py-2.5 flex items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
          <BadgeCheck className="h-4 w-4 text-blue-600 shrink-0 mt-px" />
          <span>{ROLE_DUTIES[user.role]}</span>
        </div>
      )}
    </>
  )
}

function Countdown({
  passed,
  hours,
  minutes,
  label,
  passedLabel,
}: {
  passed: boolean
  hours: number
  minutes: number
  label: string
  passedLabel: string
}) {
  return (
    <div className={`glass rounded-xl px-3 py-2 flex items-center gap-2 ${passed ? 'text-rose-600' : 'text-amber-600'}`}>
      {passed ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      <div className="leading-tight">
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{passed ? 'Terkunci' : label}</div>
        <div className="text-base font-semibold tabular-nums">
          {passed ? passedLabel : `${hours}j ${minutes}m lagi`}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// PIC Proyek — what do I still owe today?
// ------------------------------------------------------------------

export type PicData = {
  kind: 'PIC'
  countdown: { hours: number; minutes: number; passed: boolean }
  lockAt: string
  summary: { projects: number; submitted: number; outstanding: number; blocked: number; onTimePct: number }
  projects: Array<{
    id: string
    code: string
    name: string
    phase: string
    targetEndDate: string | null
    entityName: string
    status: string | null
    progressPct: number | null
    evidenceCount: number
    submitted: boolean
    forwarded: boolean
    needsEscalation: boolean
  }>
}

export function PicDashboard({ data }: { data: PicData }) {
  const { setActiveTab } = useApp()
  const s = data.summary
  // Aturan sejak 7 Sep 2026: satu PIC memegang satu proyek. Bila memang satu,
  // proyek itu jadi "pahlawan" layar dengan tindakan utamanya langsung terlihat.
  const single = data.projects.length === 1 ? data.projects[0] : null

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <Header
        subtitle={formatDateLong(new Date())}
        right={
          <Countdown
            passed={data.countdown.passed}
            hours={data.countdown.hours}
            minutes={data.countdown.minutes}
            label="Batas lapor"
            passedLabel={`Lewat ${formatTime(data.lockAt)} WIB`}
          />
        }
      />

      {single && (
        <div className="hero-strip p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Proyek yang Anda pegang</div>
            <div className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5">{single.name}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono">{single.code}</span>
              <span>· {single.entityName}</span>
              <span>· {PROJECT_PHASE_LABELS[single.phase] ?? single.phase}</span>
              {single.targetEndDate && <span>· target {formatDate(single.targetEndDate)}</span>}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={single.progressPct ?? 0} className="h-2 flex-1 max-w-md" />
              <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{single.progressPct ?? 0}%</span>
              {single.status && <DailyStatusBadge status={single.status} size="xs" />}
            </div>
          </div>
          <Button
            onClick={() => setActiveTab('daily-input')}
            className="h-14 px-6 text-base font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white btn-primary-glow shrink-0"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} /> Tambah Progress
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Proyek Saya" value={s.projects} sub="ditugaskan aktif" icon={FolderKanban} tone="blue" />
        <StatCard label="Sudah Dilapor" value={s.submitted} sub="terkirim ke Admin PT" icon={CheckCircle2} tone="emerald" />
        <StatCard label="Belum Dilapor" value={s.outstanding} sub="butuh tindakan" icon={Hourglass} tone={s.outstanding > 0 ? 'amber' : 'blue'} />
        <StatCard label="Terkendala" value={s.blocked} sub="perlu eskalasi" icon={AlertTriangle} tone={s.blocked > 0 ? 'rose' : 'emerald'} />
      </div>

      <Card className="glass">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Ketepatan waktu 7 hari terakhir</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Progress value={s.onTimePct} className="h-2 flex-1" />
            <span className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatPercent(s.onTimePct, 0)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Proyek Hari Ini</CardTitle>
                <CardDescription className="text-sm">Status laporan per proyek</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-sm text-blue-600 h-7" onClick={() => setActiveTab('daily-input')}>
              Lapor <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.projects.length === 0 ? (
            <EmptyState title="Belum ada proyek ditugaskan" description="Hubungi Admin PT." />
          ) : (
            data.projects.map((p) => (
              <div key={p.id} className="glass rounded-xl p-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono">{p.code}</span>
                    <span>· {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}</span>
                    <span className={p.evidenceCount > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                      · {p.evidenceCount} bukti
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.status ? <DailyStatusBadge status={p.status} /> : null}
                  <Badge
                    variant="outline"
                    className={`text-[11px] h-5 ${
                      p.forwarded
                        ? 'text-blue-700 dark:text-blue-300 border-blue-500/40'
                        : p.submitted
                          ? 'text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                          : 'text-amber-700 dark:text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {p.forwarded ? 'Diteruskan' : p.submitted ? 'Terkirim' : 'Belum'}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------
// Kepala Divisi — where is this week's bundle?
// ------------------------------------------------------------------

export type KadivData = {
  kind: 'KADIV'
  week: { isoYear: number; isoWeek: number; handoverBy: string; lockAt: string }
  handoverHoursLeft: number
  handoverPassed: boolean
  summary: {
    divisions: number
    items: number
    done: number
    blocked: number
    missingEvidence: number
    needsEscalation: number
  }
  byStatus: Record<string, number>
  divisions: Array<{
    id: string
    name: string
    statusHeader: string
    itemCount: number
    submitted: boolean
    approved: boolean
    forwarded: boolean
  }>
}

export function KadivDashboard({ data }: { data: KadivData }) {
  const { setActiveTab } = useApp()
  const s = data.summary
  const completion = s.items > 0 ? (s.done / s.items) * 100 : 0

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <Header
        subtitle={`Minggu ${data.week.isoWeek}/${data.week.isoYear} · ${formatDateLong(new Date())}`}
        right={
          <Countdown
            passed={data.handoverPassed}
            hours={data.handoverHoursLeft}
            minutes={0}
            label="Serahkan sebelum Kamis"
            passedLabel="Tenggat Kamis lewat"
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Item Minggu Ini" value={s.items} sub={`${s.divisions} divisi`} icon={CalendarCheck} tone="violet" />
        <StatCard label="Selesai" value={s.done} sub={formatPercent(completion, 0)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Terkendala" value={s.blocked} sub="perlu tindak lanjut" icon={AlertTriangle} tone={s.blocked > 0 ? 'rose' : 'emerald'} />
        <StatCard label="Bukti Kurang" value={s.missingEvidence} sub="menahan penyerahan" icon={Paperclip} tone={s.missingEvidence > 0 ? 'amber' : 'emerald'} />
      </div>

      {s.missingEvidence > 0 && (
        <div className="glass rounded-xl px-3 py-2.5 flex items-start gap-2 text-[13px] text-amber-700 dark:text-amber-300 border border-amber-500/25">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          <span>
            {s.missingEvidence} item belum punya bukti pendukung. Penyerahan akan ditolak sampai
            bukti dilampirkan.
          </span>
        </div>
      )}

      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <Users className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Divisi Saya</CardTitle>
                <CardDescription className="text-sm">Status penyerahan minggu ini</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-sm text-violet-600 h-7" onClick={() => setActiveTab('weekly-input')}>
              Isi capaian <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.divisions.length === 0 ? (
            <EmptyState title="Belum ada divisi ditugaskan" description="Hubungi Admin PT." />
          ) : (
            data.divisions.map((d) => (
              <div key={d.id} className="glass rounded-xl p-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-slate-800 dark:text-slate-100 truncate">{d.name}</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400">{d.itemCount} item pekerjaan</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <WeeklyHeaderBadge status={d.statusHeader} />
                  {d.forwarded && (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] h-5">Diteruskan</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------
// Admin PT — what came in, what still has to go out?
// ------------------------------------------------------------------

export type AdminData = {
  kind: 'ADMIN'
  entity: { name: string; code: string; region: string | null } | null
  countdown: { hours: number; minutes: number; passed: boolean }
  summary: {
    projects: number
    divisions: number
    dailyReceived: number
    dailyAwaitingForward: number
    dailyMissing: number
    weeklyApproved: number
    weeklyAwaitingForward: number
    weeklyDraft: number
    lateThisMonth: number
    openEscalations: number
    complianceScore: number
    onTimeDailyPct: number
  }
}

export function AdminDashboard({ data }: { data: AdminData }) {
  const { setActiveTab } = useApp()
  const s = data.summary
  const toForward = s.dailyAwaitingForward + s.weeklyAwaitingForward

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <Header
        subtitle={`${data.entity?.name ?? 'Entitas Anda'} · ${formatDateLong(new Date())}`}
        right={
          <Countdown
            passed={data.countdown.passed}
            hours={data.countdown.hours}
            minutes={data.countdown.minutes}
            label="Kunci harian"
            passedLabel="Sudah 17.00 WIB"
          />
        }
      />

      {toForward > 0 && (
        <button
          onClick={() => setActiveTab('inbox')}
          className="w-full glass-blue rounded-xl px-3 py-3 flex items-center gap-3 text-left hover:bg-blue-500/15 transition-colors"
        >
          <div className="h-9 w-9 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
            <ArrowUpRight className="h-4 w-4 text-blue-700 dark:text-blue-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-blue-800 dark:text-blue-200">
              {toForward} laporan siap diteruskan
            </div>
            <div className="text-[13px] text-blue-700/80">
              {s.dailyAwaitingForward} harian · {s.weeklyAwaitingForward} mingguan
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-blue-700 dark:text-blue-300 shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Laporan Diterima" value={s.dailyReceived} sub={`dari ${s.projects} proyek`} icon={Inbox} tone="blue" />
        <StatCard label="Belum Masuk" value={s.dailyMissing} sub="dari PIC proyek" icon={Hourglass} tone={s.dailyMissing > 0 ? 'amber' : 'emerald'} />
        <StatCard label="Divisi Disetujui" value={s.weeklyApproved} sub={`dari ${s.divisions} divisi`} icon={CheckCircle2} tone="violet" />
        <StatCard label="Draft Divisi" value={s.weeklyDraft} sub="belum diserahkan" icon={CalendarCheck} tone={s.weeklyDraft > 0 ? 'amber' : 'emerald'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Kepatuhan Entitas</CardTitle>
            <CardDescription className="text-sm">Bulan berjalan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500 dark:text-slate-400">Skor kepatuhan</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{formatPercent(s.complianceScore, 1)}</span>
              </div>
              <Progress value={s.complianceScore} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500 dark:text-slate-400">Ketepatan waktu harian</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{formatPercent(s.onTimeDailyPct, 1)}</span>
              </div>
              <Progress value={s.onTimeDailyPct} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Perlu Perhatian</CardTitle>
            <CardDescription className="text-sm">Butuh tindakan Anda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AttentionRow icon={Siren} tone="rose" label="Eskalasi terbuka" value={s.openEscalations} />
            <AttentionRow icon={Clock} tone="amber" label="Insiden terlambat bulan ini" value={s.lateThisMonth} />
            <AttentionRow icon={Inbox} tone="blue" label="Menunggu diteruskan" value={toForward} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AttentionRow({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Siren
  tone: string
  label: string
  value: number
}) {
  const colors: Record<string, string> = {
    rose: 'text-rose-600 bg-rose-500/15',
    amber: 'text-amber-600 bg-amber-500/15',
    blue: 'text-blue-600 bg-blue-500/15',
  }
  return (
    <div className="flex items-center gap-2.5">
      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${colors[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{label}</span>
      <span className={`text-base font-bold tabular-nums ${value > 0 ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
        {value}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------
// Oversight panel — appended to the aggregate dashboard
// ------------------------------------------------------------------

export type OversightPanel = {
  blockedDaily: number
  blockedWeekly: number
  staleEscalations: number
  awaitingDecision: Array<{
    id: string
    summary: string
    needed: string
    status: string
    ageDays: number
    slaDays: number
    entityName: string
    entityCode: string
  }>
}

export function OversightExtras({ panel }: { panel: OversightPanel }) {
  const { user, setActiveTab } = useApp()
  const decides = user.role === 'MANAJEMEN'

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-rose-500/15 flex items-center justify-center">
              <Siren className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {decides ? 'Menunggu Keputusan Anda' : 'Item Perlu Tindak Lanjut'}
              </CardTitle>
              <CardDescription className="text-sm">
                {panel.blockedDaily} laporan harian &amp; {panel.blockedWeekly} item mingguan berstatus
                terkendala
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-sm text-rose-600 h-7" onClick={() => setActiveTab('escalations')}>
            Papan eskalasi <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {panel.staleEscalations > 0 && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-2.5 py-2 text-[13px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            {panel.staleEscalations} eskalasi melewati SLA 7 hari tanpa keputusan.
          </div>
        )}
        {panel.awaitingDecision.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            title="Tidak ada eskalasi terbuka"
            description="Semua isu sudah diputuskan."
          />
        ) : (
          panel.awaitingDecision.map((e) => (
            <div key={e.id} className="glass rounded-xl p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  {e.entityName} <span className="font-mono text-slate-400 dark:text-slate-500">{e.entityCode}</span>
                </span>
                <Badge
                  variant="outline"
                  className={`text-[11px] h-4 px-1 shrink-0 ${
                    e.ageDays > e.slaDays ? 'text-rose-700 dark:text-rose-300 border-rose-500/40' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {e.ageDays} hari
                </Badge>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{e.summary}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
