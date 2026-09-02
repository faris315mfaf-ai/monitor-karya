'use client'

import { useFetch } from '@/hooks/use-fetch'
import { useApp } from '@/components/app-provider'
import { StatCard, ComplianceBadge, EscalationStatusBadge } from '@/components'
import { LoadingCard, LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Building2, FolderKanban, CheckCircle2, AlertTriangle, Siren, Lock, TrendingUp, TrendingDown, Clock, Trophy, ChevronRight,
} from 'lucide-react'
import { formatNumber, formatPercent, formatRelative, formatDateLong } from '@/lib/format'
import { ESCALATION_NEEDED_LABELS } from '@/lib/constants'
import { ComplianceTreemap } from '@/components/dashboard/compliance-treemap'
import { KpiTrendChart } from '@/components/dashboard/kpi-trend-chart'

type DashboardData = {
  summary: {
    totalEntities: number
    totalProjects: number
    activeProjects: number
    reportsToday: number
    lateToday: number
    weeklyPending: number
    pendingEscalations: number
    pendingUnlocks: number
    avgCompliance: number
    avgOnTime: number
    avgWeeklyCompleteness: number
    avgEvidenceCompleteness: number
    avgHighPriorityCompletion: number
  }
  attentionEntities: Array<{
    entityId: string
    entityName: string
    entityCode: string
    region: string
    complianceScore: number
    onTimeDailyPct: number
    weeklyCompletenessPct: number
    lateToday: number
    pendingReports: number
  }>
  topPerformers: Array<{
    entityId: string
    entityName: string
    entityCode: string
    region: string
    complianceScore: number
  }>
  pendingEscalations: Array<{
    id: string
    summary: string
    status: string
    needed: string
    raisedAt: string
    ageDays: number
    slaDays: number
    isOverdue: boolean
    entityName: string
    entityCode: string
    region: string
  }>
  lateEntitiesThisMonth: Array<{
    id: string
    entityId: string
    entityName: string
    entityCode: string
    region: string
    cycle: string
    occurrenceInMonth: number
    actionTaken: string | null
  }>
}

export function DashboardView() {
  const { user, setActiveTab, setSelectedEntityId } = useApp()
  const scopeId = user?.scopeEntityId
  const url = `/api/dashboard${scopeId ? `?scopeEntityId=${scopeId}` : ''}`
  const { data, loading, error } = useFetch<DashboardData>(url)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)}
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !data) {
    return <EmptyState title="Gagal memuat dashboard" description={error || 'Data tidak tersedia'} />
  }

  const s = data.summary

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            Dashboard Pemantauan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {user?.scopeEntityId ? 'Cakupan: subtree entitas Anda' : 'Cakupan: seluruh holding'} · {formatDateLong(new Date())}
          </p>
        </div>
        <Badge className="glass-blue text-blue-700 text-xs font-medium px-3 py-1 border-blue-500/30 w-fit">
          <TrendingUp className="h-3 w-3 mr-1" />
          Skor kepatuhan rata-rata: {formatPercent(s.avgCompliance, 1)}
        </Badge>
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Entitas Wajib Lapor"
          value={formatNumber(s.totalEntities)}
          sub={`${formatNumber(s.activeProjects)} proyek aktif`}
          icon={Building2}
          tone="blue"
          trend={{ value: 'Stabil', up: true }}
        />
        <StatCard
          label="Laporan Hari Ini"
          value={formatNumber(s.reportsToday)}
          sub={`${formatNumber(s.lateToday)} terlambat`}
          icon={CheckCircle2}
          tone={s.lateToday > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Eskalasi Menunggu"
          value={formatNumber(s.pendingEscalations)}
          sub="Menunggu keputusan"
          icon={Siren}
          tone="rose"
          onClick={() => setActiveTab('escalations')}
        />
        <StatCard
          label="Permohonan Buka Kunci"
          value={formatNumber(s.pendingUnlocks)}
          sub="Menunggu persetujuan"
          icon={Lock}
          tone="violet"
        />
      </div>

      {/* KPI trend + compliance treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glass lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Tren KPI 6 Bulan</CardTitle>
                <CardDescription className="text-xs">Indikator kepatuhan agregat</CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-700 bg-blue-500/5">
                Bulanan
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <KpiTrendChart scopeEntityId={user?.scopeEntityId} />
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-800">Peta Kepatuhan</CardTitle>
            <CardDescription className="text-xs">Hierarki holding → PT</CardDescription>
          </CardHeader>
          <CardContent>
            <ComplianceTreemap scopeEntityId={user?.scopeEntityId} onSelectEntity={(id) => {
              setSelectedEntityId(id)
              setActiveTab('entities')
            }} />
          </CardContent>
        </Card>
      </div>

      {/* KPI Indicators grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiIndicator label="Ketepatan Waktu Harian" value={s.avgOnTime} target={95} icon={Clock} tone="blue" />
        <KpiIndicator label="Kelengkapan Mingguan" value={s.avgWeeklyCompleteness} target={100} icon={CheckCircle2} tone="emerald" />
        <KpiIndicator label="Kelengkapan Bukti" value={s.avgEvidenceCompleteness} target={100} icon={CheckCircle2} tone="cyan" />
        <KpiIndicator label="Penyelesaian Prioritas Tinggi" value={s.avgHighPriorityCompletion} target={85} icon={Trophy} tone="amber" />
      </div>

      {/* Attention + Escalations + Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attention list */}
        <Card className="glass lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-800">Perlu Perhatian</CardTitle>
                  <CardDescription className="text-xs">Entitas dengan kepatuhan &lt; 75%</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 bg-amber-500/5">
                {formatNumber(data.attentionEntities.length)} entitas
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.attentionEntities.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} title="Tidak ada entitas yang bermasalah" description="Semua entitas memenuhi standar kepatuhan" />
            ) : (
              <ScrollArea className="max-h-80">
                <div className="space-y-2 pr-2">
                  {data.attentionEntities.map((e) => (
                    <button
                      key={e.entityId}
                      onClick={() => {
                        setSelectedEntityId(e.entityId)
                        setActiveTab('entities')
                      }}
                      className="w-full glass rounded-xl p-3 hover:bg-blue-500/5 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 truncate">{e.entityName}</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{e.entityCode}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Tepat waktu {formatPercent(e.onTimeDailyPct, 0)}
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Mingguan {formatPercent(e.weeklyCompletenessPct, 0)}
                            </span>
                            {e.lateToday > 0 && (
                              <Badge className="text-[9px] h-4 px-1 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20">
                                {e.lateToday} terlambat
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ComplianceBadge score={e.complianceScore} />
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Top performers */}
        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Top Performer</CardTitle>
                <CardDescription className="text-xs">Entitas terbaik bulan ini</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topPerformers.map((p, i) => (
                <div key={p.entityId} className="flex items-center gap-3 glass rounded-xl p-2.5">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-orange-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{p.entityName}</div>
                    <div className="text-[10px] text-slate-500">{p.region}</div>
                  </div>
                  <ComplianceBadge score={p.complianceScore} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending escalations board */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-rose-500/15 flex items-center justify-center">
                <Siren className="h-4 w-4 text-rose-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Papan Eskalasi</CardTitle>
                <CardDescription className="text-xs">Menunggu keputusan Manajemen</CardDescription>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('escalations')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              Lihat semua <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {data.pendingEscalations.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} title="Tidak ada eskalasi tertunda" description="Semua eskalasi telah diputuskan" />
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2 pr-2">
                {data.pendingEscalations.slice(0, 6).map((esc) => (
                  <div key={esc.id} className={`glass rounded-xl p-3 border-l-2 ${esc.isOverdue ? 'border-l-rose-500' : 'border-l-blue-500'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-800">{esc.entityName}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{esc.entityCode}</Badge>
                          <EscalationStatusBadge status={esc.status} />
                          {esc.isOverdue && (
                            <Badge className="text-[9px] h-4 px-1 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20">
                              <TrendingDown className="h-2.5 w-2.5 mr-0.5" /> Lewat SLA
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{esc.summary}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                          <span>Butuh: <strong className="text-slate-700">{ESCALATION_NEEDED_LABELS[esc.needed]}</strong></span>
                          <span>·</span>
                          <span>Umur {esc.ageDays} hari</span>
                          <span>·</span>
                          <span>Diajukan {formatRelative(esc.raisedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Late entities this month */}
      {data.lateEntitiesThisMonth.length > 0 && (
        <Card className="glass border-l-4 border-l-rose-500">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-rose-500/15 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Entitas Terlambat ≥3× Bulan Ini</CardTitle>
                <CardDescription className="text-xs">Evaluasi penunjukan Admin PT diperlukan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.lateEntitiesThisMonth.map((li) => (
                <div key={li.id} className="glass rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{li.entityName}</div>
                      <div className="text-[10px] text-slate-500">{li.region}</div>
                    </div>
                    <Badge className="text-[9px] h-5 px-1.5 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20">
                      {li.occurrenceInMonth}× {li.cycle === 'HARIAN' ? 'Harian' : 'Mingguan'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiIndicator({
  label,
  value,
  target,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  target: number
  icon: any
  tone: 'blue' | 'emerald' | 'cyan' | 'amber'
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-500/10',
    emerald: 'text-emerald-600 bg-emerald-500/10',
    cyan: 'text-cyan-600 bg-cyan-500/10',
    amber: 'text-amber-600 bg-amber-500/10',
  }
  const barColor: Record<string, string> = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-500',
  }
  const pct = Math.min(100, value)
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium text-slate-600 truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-slate-800 tabular-nums">{formatPercent(value, 1)}</span>
        <span className="text-[10px] text-slate-400">/ target {target}%</span>
      </div>
      <Progress value={pct} className={`h-1.5 mt-2 ${barColor[tone]}`} />
    </div>
  )
}
