'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  ComplianceBadge,
  DailyStatusBadge,
  WeeklyHeaderBadge,
} from '@/components/status-badges'
import { StatCard } from '@/components'
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_COLORS,
  PROJECT_PHASE_LABELS,
  PROJECT_LIFECYCLE_LABELS,
} from '@/lib/constants'
import { formatDate, formatPercent, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Building2, MapPin, ChevronDown, ChevronRight, Layers, Users,
  FolderKanban, Calendar, Shield,
} from 'lucide-react'

type TreeKpi = {
  complianceScore: number
  onTimeDailyPct: number
  weeklyCompletenessPct: number
  lateToday: number
  pendingReports: number
} | null

type TreeNode = {
  id: string
  name: string
  code: string
  type: string
  region?: string | null
  kpi?: TreeKpi
  children?: TreeNode[]
}

type TreeResponse = {
  tree: TreeNode[]
  periodKey: string
}

type EntityDetail = {
  entity: {
    id: string
    name: string
    code: string
    type: string
    path: string | null
    region: string | null
    parentId: string | null
    isActive: boolean
  }
  parentChain: Array<{ id: string; name: string; code: string; type: string; region: string | null }>
  children: Array<{ id: string; name: string; code: string; type: string; region: string | null; isActive: boolean }>
  divisions?: Array<{
    id: string
    name: string
    isActive: boolean
    divisionType: { id: string; code: string; name: string }
  }>
  projects?: Array<{
    id: string
    name: string
    code: string
    phase: string
    lifecycle: string
    picName: string | null
    startDate: string | null
    targetEndDate: string | null
  }>
  adminAppointments?: Array<{
    id: string
    userName: string
    userEmail: string
    kind: string
    skNumber: string
    validFrom: string
    validUntil: string
    status: string
  }>
  currentKpi?: {
    complianceScore: number
    onTimeDailyPct: number
    weeklyCompletenessPct: number
    evidenceCompletenessPct: number
    highPriorityCompletionPct: number
    lateToday: number
    pendingReports: number
    totalProjects: number
    activeProjects: number
  } | null
  recentDailyReports?: Array<{
    id: string
    status: string
    progressPct: number
    reportDate: string
    isLate: boolean
    isLocked: boolean
    project: { id: string; name: string; code: string }
  }>
  recentWeeklyReports?: Array<{
    id: string
    isoYear: number
    isoWeek: number
    statusHeader: string
    isLocked: boolean
    division: { id: string; name: string }
  }>
}

export function EntitiesView() {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Entitas</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Pohon organisasi holding
        </p>
      </div>

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: tree */}
        <Card className="glass lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Layers className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">Pohon Organisasi</CardTitle>
                <CardDescription className="text-xs">Pilih entitas PT untuk melihat detail</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <EntityTree onSelectEntity={setSelectedEntityId} selectedId={selectedEntityId} />
          </CardContent>
        </Card>

        {/* Right: detail */}
        <div className="lg:col-span-2">
          <EntityDetailPanel entityId={selectedEntityId} />
        </div>
      </div>
    </div>
  )
}

function EntityTree({
  onSelectEntity,
  selectedId,
}: {
  onSelectEntity: (id: string) => void
  selectedId: string | null
}) {
  const { data, loading, error } = useFetch<TreeResponse>(`/api/entities`)

  if (loading) return <LoadingSpinner className="py-6" />
  if (error) return <ErrorState message={error} />
  if (!data?.tree?.length) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5 text-slate-400" />}
        title="Tidak ada data entitas"
      />
    )
  }

  return (
    <div className="max-h-[70vh] overflow-y-auto scrollbar-thin pr-1 -mr-1">
      {data.tree.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          onSelectEntity={onSelectEntity}
          selectedId={selectedId}
        />
      ))}
    </div>
  )
}

function TreeNodeRow({
  node,
  depth,
  onSelectEntity,
  selectedId,
}: {
  node: TreeNode
  depth: number
  onSelectEntity: (id: string) => void
  selectedId: string | null
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = (node.children?.length ?? 0) > 0
  const isPT = node.type === 'PT'
  const isSelected = selectedId === node.id
  const label = ENTITY_TYPE_LABELS[node.type] || node.type
  const score = isPT ? node.kpi?.complianceScore : null

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v)
          if (isPT) onSelectEntity(node.id)
        }}
        className={cn(
          'w-full flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all text-left',
          isSelected ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'hover:bg-blue-500/5',
          depth === 0 && 'font-semibold',
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        <span className="text-[10px] text-slate-400 uppercase tracking-wide w-16 shrink-0">{label}</span>
        <span className="text-xs font-medium text-slate-700 truncate flex-1">{node.name}</span>
        {typeof score === 'number' && <ComplianceBadge score={score} />}
      </button>
      {hasChildren && expanded && (
        <div className="border-l border-slate-200/60 ml-3">
          {node.children!.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelectEntity={onSelectEntity}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EntityDetailPanel({ entityId }: { entityId: string | null }) {
  // Reset to top whenever entity changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const el = document.getElementById('entity-detail-scroll')
      if (el) el.scrollTop = 0
    }
  }, [entityId])

  if (!entityId) {
    return (
      <Card className="glass h-full min-h-[300px] flex items-center justify-center">
        <CardContent className="p-6 w-full">
          <EmptyState
            icon={<Building2 className="h-5 w-5 text-slate-400" />}
            title="Pilih entitas PT dari pohon"
            description="Detail KPI, divisi, proyek, dan laporan terbaru akan muncul di sini."
          />
        </CardContent>
      </Card>
    )
  }

  return <EntityDetailContent entityId={entityId} />
}

function EntityDetailContent({ entityId }: { entityId: string }) {
  const { data, loading, error } = useFetch<EntityDetail>(`/api/entities/${entityId}`)

  if (loading) return <LoadingSpinner className="py-12" />
  if (error) return <ErrorState message={error} />
  if (!data) return <ErrorState message="Data tidak tersedia" />

  const { entity, parentChain, children, divisions, projects, currentKpi, recentDailyReports, recentWeeklyReports, adminAppointments } = data
  const isPT = entity.type === 'PT'

  // Breadcrumb chain: parentChain → entity itself
  const breadcrumb = [...parentChain, { id: entity.id, name: entity.name, code: entity.code, type: entity.type, region: entity.region }]
  const typeGradient = ENTITY_TYPE_COLORS[entity.type] || 'from-blue-500 to-sky-400'
  const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type

  return (
    <div id="entity-detail-scroll" className="space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin pr-1 -mr-1">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap text-[10px]">
        {breadcrumb.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                i === breadcrumb.length - 1
                  ? 'bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30'
                  : 'bg-slate-500/10 text-slate-600',
              )}
            >
              <span className="text-[9px] uppercase opacity-70">{ENTITY_TYPE_LABELS[b.type] || b.type}</span>
              <span className="truncate max-w-[120px]">{b.name}</span>
            </span>
            {i < breadcrumb.length - 1 && <ChevronRight className="h-3 w-3 text-slate-400" />}
          </span>
        ))}
      </div>

      {/* Entity header card */}
      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn('h-9 w-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md shrink-0', typeGradient)}>
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 truncate">{entity.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{entity.code}</Badge>
                    <Badge
                      className={cn('text-[9px] h-4 px-1 bg-gradient-to-r text-white border-0', typeGradient)}
                    >
                      {typeLabel}
                    </Badge>
                    {!entity.isActive && (
                      <Badge className="text-[9px] h-4 px-1 bg-slate-500/15 text-slate-600">Nonaktif</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {entity.region && (
            <div className="flex items-center gap-1.5 mt-3 text-[11px] text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-blue-500" />
              <span>{entity.region}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Children entities (for non-PT) */}
      {children && children.length > 0 && (
        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <Layers className="h-3.5 w-3.5 text-cyan-600" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">Anak Entitas</CardTitle>
                <CardDescription className="text-[11px]">{children.length} entitas turunan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {children.map((c) => (
                <div key={c.id} className="glass rounded-xl p-2.5 flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full bg-gradient-to-br', ENTITY_TYPE_COLORS[c.type] || 'from-slate-400 to-slate-300')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 truncate">{c.name}</p>
                    <p className="text-[9px] text-slate-400 font-mono">{c.code}</p>
                  </div>
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1">{ENTITY_TYPE_LABELS[c.type] || c.type}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles for PT */}
      {isPT && currentKpi && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Compliance Score"
              value={
                <span className="flex items-center gap-2">
                  {formatPercent(currentKpi.complianceScore, 0)}
                  <ComplianceBadge score={currentKpi.complianceScore} />
                </span>
              }
              sub="Skor kepatuhan bulan ini"
              icon={Shield}
              tone="blue"
            />
            <StatCard
              label="Ontime Harian"
              value={formatPercent(currentKpi.onTimeDailyPct, 0)}
              sub="Laporan harian tepat waktu"
              icon={Calendar}
              tone="emerald"
            />
            <StatCard
              label="Kelengkapan Mingguan"
              value={formatPercent(currentKpi.weeklyCompletenessPct, 0)}
              sub="Laporan mingguan divisi"
              icon={Layers}
              tone="violet"
            />
            <StatCard
              label="Laporan Tertunda"
              value={formatNumber(currentKpi.pendingReports)}
              sub={`Terlambat: ${formatNumber(currentKpi.lateToday)} hari ini`}
              icon={Users}
              tone={currentKpi.pendingReports > 0 ? 'amber' : 'blue'}
            />
          </div>

          {/* Mini trend: recent daily reports */}
          {recentDailyReports && recentDailyReports.length > 0 && (
            <Card className="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  <CardTitle className="text-sm font-semibold text-slate-800">Tren 7 Laporan Terakhir</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-1.5 h-16">
                  {recentDailyReports.slice(0, 7).reverse().map((r) => {
                    const h = Math.max(8, Math.min(100, r.progressPct))
                    return (
                      <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className={cn(
                            'w-full rounded-t-md',
                            r.isLate ? 'bg-rose-400/70' : 'bg-blue-500/70',
                          )}
                          style={{ height: `${h}%` }}
                          title={`${formatDate(r.reportDate)}: ${r.progressPct}%`}
                        />
                        <span className="text-[8px] text-slate-400 tabular-nums">
                          {new Date(r.reportDate).getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Divisions + Projects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-800">Divisi</CardTitle>
                    <CardDescription className="text-[11px]">{divisions?.length || 0} divisi</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(!divisions || divisions.length === 0) ? (
                  <p className="text-[11px] text-slate-400 text-center py-3">Belum ada divisi</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1 -mr-1">
                    {divisions.map((d) => (
                      <div key={d.id} className="glass rounded-lg p-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-700 truncate">{d.name}</p>
                          <p className="text-[9px] text-slate-400">{d.divisionType.name}</p>
                        </div>
                        {!d.isActive && <Badge className="text-[8px] h-3.5 px-1 bg-slate-500/15 text-slate-500">Nonaktif</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <FolderKanban className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-800">Proyek</CardTitle>
                    <CardDescription className="text-[11px]">{projects?.length || 0} proyek</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(!projects || projects.length === 0) ? (
                  <p className="text-[11px] text-slate-400 text-center py-3">Belum ada proyek</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1 -mr-1">
                    {projects.map((p) => (
                      <div key={p.id} className="glass rounded-lg p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-slate-700 truncate flex-1">{p.name}</p>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono">{p.code}</Badge>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-blue-500/30 text-blue-700 bg-blue-500/5">
                            {PROJECT_PHASE_LABELS[p.phase] || p.phase}
                          </Badge>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-500/30 text-emerald-700 bg-emerald-500/5">
                            {PROJECT_LIFECYCLE_LABELS[p.lifecycle] || p.lifecycle}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent daily reports table */}
          {recentDailyReports && recentDailyReports.length > 0 && (
            <Card className="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  <CardTitle className="text-sm font-semibold text-slate-800">Laporan Harian Terbaru</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {recentDailyReports.slice(0, 5).map((r) => (
                    <div key={r.id} className="glass rounded-lg p-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{r.project.name}</p>
                        <p className="text-[9px] text-slate-400">{formatDate(r.reportDate)}</p>
                      </div>
                      <DailyStatusBadge status={r.status} size="xs" />
                      <div className="flex items-center gap-1 w-24">
                        <Progress value={r.progressPct} className="h-1" />
                        <span className="text-[9px] font-semibold text-slate-600 tabular-nums">{r.progressPct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent weekly reports */}
          {recentWeeklyReports && recentWeeklyReports.length > 0 && (
            <Card className="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-violet-600" />
                  <CardTitle className="text-sm font-semibold text-slate-800">Laporan Mingguan Terbaru</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {recentWeeklyReports.slice(0, 4).map((w) => (
                    <div key={w.id} className="glass rounded-lg p-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-700 truncate">{w.division.name}</p>
                        <p className="text-[9px] text-slate-400 font-mono">W{w.isoWeek}/{w.isoYear}</p>
                      </div>
                      <WeeklyHeaderBadge status={w.statusHeader} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Admin appointments */}
      {isPT && adminAppointments && adminAppointments.length > 0 && (
        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              <CardTitle className="text-sm font-semibold text-slate-800">Penunjukan Admin</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {adminAppointments.slice(0, 5).map((a) => (
                <div key={a.id} className="glass rounded-lg p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 truncate">{a.userName}</p>
                    <p className="text-[9px] text-slate-400 truncate">
                      {a.kind} · SK {a.skNumber || '-'} · {formatDate(a.validFrom)} → {formatDate(a.validUntil)}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      'text-[8px] h-3.5 px-1',
                      a.status === 'AKTIF' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-slate-500/15 text-slate-600',
                    )}
                  >
                    {a.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-PT info */}
      {!isPT && (!children || children.length === 0) && (
        <Card className="glass">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 text-center">
              Entitas non-PT tidak memiliki KPI, divisi, atau proyek langsung. Pilih entitas PT turunan untuk melihat detail lengkap.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
