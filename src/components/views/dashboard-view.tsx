'use client'

import { useFetch } from '@/hooks/use-fetch'
import {
  AdminDashboard, KadivDashboard, OversightExtras, PicDashboard,
  type AdminData, type KadivData, type OversightPanel, type PicData,
} from '@/components/views/role-dashboards'
import { EntityActivityBoard } from '@/components/views/entity-activity-board'
import { useApp } from '@/components/app-provider'
import { StatCard, ComplianceBadge, EscalationStatusBadge } from '@/components'
import { LoadingCard, LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Building2, CheckCircle2, AlertTriangle, Siren, Lock, TrendingUp, TrendingDown, Clock, Trophy, ChevronRight,
  BadgeCheck,
} from 'lucide-react'
import { formatNumber, formatPercent, formatRelative, formatDateLong } from '@/lib/format'
import { ESCALATION_NEEDED_LABELS, ROLE_LABELS } from '@/lib/constants'
import { ROLE_DUTIES } from '@/lib/rbac'

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

function AggregateDashboard() {
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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Dashboard {ROLE_LABELS[user.role] ?? 'Pemantauan'}
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            {user?.scopeEntityId ? 'Cakupan: subtree entitas Anda' : 'Cakupan: seluruh holding'} · {formatDateLong(new Date())}
          </p>
        </div>
        <Badge className="glass-blue text-blue-700 dark:text-blue-300 text-sm font-medium px-3 py-1 border-blue-500/30 w-fit">
          <TrendingUp className="h-3 w-3 mr-1" />
          Skor kepatuhan rata-rata: {formatPercent(s.avgCompliance, 1)}
        </Badge>
      </div>

      {/* What this role is answerable for */}
      {ROLE_DUTIES[user.role] && (
        <div className="glass rounded-xl px-3 py-2.5 flex items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
          <BadgeCheck className="h-4 w-4 text-blue-600 shrink-0 mt-px" />
          <span>{ROLE_DUTIES[user.role]}</span>
        </div>
      )}

      {/* Bagian teratas (8 Sep 2026): apa yang dikerjakan tiap perusahaan.
          Tren KPI, peta kepatuhan, indikator KPI, dan paket grafik manajemen
          disembunyikan atas permintaan; komponennya tetap ada di repo. */}
      <EntityActivityBoard />

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
                  <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Perlu Perhatian</CardTitle>
                  <CardDescription className="text-sm">Entitas dengan kepatuhan &lt; 75%</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/5">
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
                            <span className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">{e.entityName}</span>
                            <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono">{e.entityCode}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Tepat waktu {formatPercent(e.onTimeDailyPct, 0)}
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Mingguan {formatPercent(e.weeklyCompletenessPct, 0)}
                            </span>
                            {e.lateToday > 0 && (
                              <Badge className="text-[11px] h-4 px-1 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20">
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
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Top Performer</CardTitle>
                <CardDescription className="text-sm">Entitas terbaik bulan ini</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topPerformers.map((p, i) => (
                <div key={p.entityId} className="flex items-center gap-3 glass rounded-xl p-2.5">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-orange-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.entityName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{p.region}</div>
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
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Papan Eskalasi</CardTitle>
                <CardDescription className="text-sm">Menunggu keputusan Manajemen</CardDescription>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('escalations')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
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
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{esc.entityName}</span>
                          <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono">{esc.entityCode}</Badge>
                          <EscalationStatusBadge status={esc.status} />
                          {esc.isOverdue && (
                            <Badge className="text-[11px] h-4 px-1 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20">
                              <TrendingDown className="h-2.5 w-2.5 mr-0.5" /> Lewat SLA
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2">{esc.summary}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>Butuh: <strong className="text-slate-700 dark:text-slate-200">{ESCALATION_NEEDED_LABELS[esc.needed]}</strong></span>
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
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Entitas Terlambat ≥3× Bulan Ini</CardTitle>
                <CardDescription className="text-sm">Evaluasi penunjukan Admin PT diperlukan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.lateEntitiesThisMonth.map((li) => (
                <div key={li.id} className="glass rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{li.entityName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{li.region}</div>
                    </div>
                    <Badge className="text-[11px] h-5 px-1.5 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20">
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

type MyDashboard =
  | PicData
  | KadivData
  | AdminData
  | { kind: 'OVERSIGHT'; panel: OversightPanel }

/**
 * Picks the dashboard that matches what the signed-in role is answerable for.
 * The people who input data get an operational view of their own work; the
 * people who oversee get the aggregate plus the decisions waiting on them.
 */
export function DashboardView() {
  const { data, loading, error } = useFetch<MyDashboard>('/api/my-dashboard')

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingCard key={i} />
          ))}
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !data) {
    return <EmptyState title="Gagal memuat dashboard" description={error ?? undefined} />
  }

  if (data.kind === 'PIC') return <PicDashboard data={data} />
  if (data.kind === 'KADIV') return <KadivDashboard data={data} />
  if (data.kind === 'ADMIN') return <AdminDashboard data={data} />

  return (
    <div className="space-y-4 sm:space-y-5">
      <AggregateDashboard />
      <OversightExtras panel={data.panel} />
    </div>
  )
}
