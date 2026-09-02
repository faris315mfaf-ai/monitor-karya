'use client'

import { useFetch } from '@/hooks/use-fetch'
import { useApp } from '@/components/app-provider'
import { LoadingCard, LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components'
import { DailyStatusBadge, UnlockStatusBadge } from '@/components/status-badges'
import {
  Clock, FolderKanban, CalendarRange, Lock, AlertTriangle, CheckCircle2,
  FileEdit, Hourglass, FolderCheck, TimerReset, ChevronRight,
} from 'lucide-react'
import { PROJECT_PHASE_LABELS, DAILY_STATUS_META } from '@/lib/constants'
import { formatTime, formatDateLong, formatPercent } from '@/lib/format'

type WorkDeskData = {
  entity: { id: string; name: string; code: string; region: string }
  projectsToday: Array<{
    id: string
    name: string
    code: string
    phase: string
    lifecycle: string
    isUpdated: boolean
    todayReport: {
      status: string
      progressPct: number
      isLate: boolean
      needsEscalation: boolean
    } | null
  }>
  weeklyDrafts: Array<{
    id: string
    isoYear: number
    isoWeek: number
    periodStart: string
    periodEnd: string
    statusHeader: string
    isLate: boolean
    division: { id: string; name: string }
  }>
  pendingUnlocks: Array<{
    id: string
    targetType: string
    targetId: string
    reason: string
    status: string
    createdAt: string
  }>
  countdown: { hours: number; minutes: number; total: number; passed: boolean }
  lateThisMonth: number
}

export function WorkDeskView() {
  const { user, setActiveTab } = useApp()
  const userId = user?.id
  const url = userId ? `/api/work-desk?userId=${userId}` : null
  const { data, loading, error } = useFetch<WorkDeskData>(url)

  if (!userId) {
    return <EmptyState title="Pilih peran Admin PT" description="Meja kerja hanya tersedia untuk peran Admin PT" />
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)}
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !data) {
    return <EmptyState title="Gagal memuat meja kerja" description={error || 'Data tidak tersedia'} />
  }

  const updatedCount = data.projectsToday.filter((p) => p.isUpdated).length
  const notUpdatedCount = data.projectsToday.length - updatedCount
  const pendingCount = data.projectsToday.filter((p) => p.todayReport?.needsEscalation).length

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Meja Kerja Hari Ini</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {data.entity.name} · {formatDateLong(new Date())}
          </p>
        </div>
        <CountdownPill countdown={data.countdown} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Proyek Diperbarui" value={updatedCount} sub={`dari ${data.projectsToday.length} proyek`} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Belum Diperbarui" value={notUpdatedCount} sub="butuh tindakan" icon={Hourglass} tone={notUpdatedCount > 0 ? 'amber' : 'blue'} />
        <StatCard label="Perlu Eskalasi" value={pendingCount} sub="proyek terkendala" icon={AlertTriangle} tone={pendingCount > 0 ? 'rose' : 'blue'} />
        <StatCard label="Terlambat Bulan Ini" value={data.lateThisMonth} sub="insiden keterlambatan" icon={Clock} tone={data.lateThisMonth > 0 ? 'rose' : 'emerald'} />
      </div>

      {/* Projects today */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <FolderKanban className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Daftar Proyek Hari Ini</CardTitle>
                <CardDescription className="text-xs">Perbarui laporan harian sebelum jam kunci 17:00 WIB</CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-blue-600 hover:text-blue-700 h-7"
              onClick={() => setActiveTab('projects')}
            >
              Buka modul <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.projectsToday.length === 0 ? (
            <EmptyState icon={<FolderKanban className="h-5 w-5 text-slate-400" />} title="Tidak ada proyek aktif" description="Belum ada proyek AKTIF yang ditugaskan" />
          ) : (
            <div className="space-y-2">
              {data.projectsToday.map((p) => (
                <ProjectTodayRow key={p.id} project={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly drafts + pending unlocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <CalendarRange className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Laporan Mingguan Draft</CardTitle>
                <CardDescription className="text-xs">Perlu dikirim untuk persetujuan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.weeklyDrafts.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} title="Tidak ada draft" description="Semua laporan mingguan sudah dikirim/disetujui" />
            ) : (
              <div className="space-y-2">
                {data.weeklyDrafts.map((w) => (
                  <div key={w.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{w.division.name}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">W{w.isoWeek}/{w.isoYear}</Badge>
                        {w.isLate && (
                          <Badge className="text-[9px] h-4 px-1 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20">Terlambat</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {formatDateLong(w.periodStart)} — {formatDateLong(w.periodEnd)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass h-7 text-[10px] border-blue-500/30 text-blue-700 hover:bg-blue-500/10"
                      onClick={() => setActiveTab('divisions')}
                    >
                      <FileEdit className="h-3 w-3 mr-1" /> Lanjutkan
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Lock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Permohonan Buka Kunci</CardTitle>
                <CardDescription className="text-xs">Status permohonan Anda</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.pendingUnlocks.length === 0 ? (
              <EmptyState icon={<FolderCheck className="h-5 w-5 text-emerald-600" />} title="Tidak ada permohonan aktif" description="Belum ada permohonan buka kunci yang menunggu" />
            ) : (
              <div className="space-y-2">
                {data.pendingUnlocks.map((u) => (
                  <div key={u.id} className="glass rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500">{u.targetType === 'DAILY_REPORT' ? 'Laporan Harian' : 'Laporan Mingguan'}</span>
                      </div>
                      <UnlockStatusBadge status={u.status} />
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2">{u.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ProjectTodayRow({
  project,
}: {
  project: WorkDeskData['projectsToday'][number]
}) {
  const meta = project.todayReport ? DAILY_STATUS_META[project.todayReport.status] : null
  const isUpdated = project.isUpdated
  return (
    <div className={`glass rounded-xl p-3 border-l-2 ${isUpdated ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{project.name}</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{project.code}</Badge>
            <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/30 text-blue-700 bg-blue-500/5">
              {PROJECT_PHASE_LABELS[project.phase]}
            </Badge>
          </div>
          {project.todayReport ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <DailyStatusBadge status={project.todayReport.status} />
                {project.todayReport.isLate && (
                  <Badge className="text-[9px] h-4 px-1 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20">
                    <Clock className="h-2.5 w-2.5 mr-0.5" /> Terlambat
                  </Badge>
                )}
                {project.todayReport.needsEscalation && (
                  <Badge className="text-[9px] h-4 px-1 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Eskalasi
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Progress value={project.todayReport.progressPct} className="h-1.5 flex-1" />
                <span className="text-[10px] font-semibold text-slate-600 tabular-nums">{project.todayReport.progressPct}%</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
              <Hourglass className="h-3.5 w-3.5" />
              <span className="font-medium">Belum diperbarui hari ini</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className={`flex items-center gap-1 text-[10px] font-semibold ${isUpdated ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${isUpdated ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse-soft'}`} />
            {isUpdated ? 'Diperbarui' : 'Belum'}
          </div>
        </div>
      </div>
    </div>
  )
}

function CountdownPill({ countdown }: { countdown: WorkDeskData['countdown'] }) {
  const passed = countdown.passed
  const total = countdown.hours * 60 + countdown.minutes
  return (
    <div className={`glass rounded-full px-3 py-1.5 flex items-center gap-2 ${passed ? 'bg-rose-500/15' : total < 60 ? 'bg-amber-500/15' : 'bg-blue-500/10'}`}>
      <TimerReset className={`h-4 w-4 ${passed ? 'text-rose-600' : total < 60 ? 'text-amber-600' : 'text-blue-600'}`} />
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">
          {passed ? 'Kunci tercapai' : 'Sisa waktu'}
        </span>
        <span className={`text-xs font-bold tabular-nums ${passed ? 'text-rose-700' : total < 60 ? 'text-amber-700' : 'text-blue-700'}`}>
          {passed ? '17:00 WIB' : `${String(countdown.hours).padStart(2, '0')}j ${String(countdown.minutes).padStart(2, '0')}m`}
        </span>
      </div>
    </div>
  )
}
