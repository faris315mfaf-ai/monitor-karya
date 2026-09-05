'use client'

import { useState } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { DailyStatusBadge } from '@/components/status-badges'
import { PROJECT_PHASE_LABELS, PROJECT_LIFECYCLE_LABELS, DAILY_STATUS_META } from '@/lib/constants'
import { formatDate, formatPercent } from '@/lib/format'
import { FolderKanban, Search, Filter, Plus, Calendar, ChevronLeft, ChevronRight, Building2, MapPin, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type ProjectListData = {
  items: Array<{
    id: string
    code: string
    name: string
    phase: string
    lifecycle: string
    picName: string | null
    startDate: string | null
    targetEndDate: string | null
    approvedByName: string | null
    entity: { id: string; name: string; code: string; region: string | null }
    latestReport: {
      status: string
      progressPct: number
      reportDate: string
      isLate: boolean
    } | null
  }>
  total: number
  page: number
  pageSize: number
}

export function ProjectsView() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [phase, setPhase] = useState<string>('ALL')
  const [entityId, setEntityId] = useState<string>('')

  const params = new URLSearchParams({ page: String(page), pageSize: '12' })
  if (search) params.set('search', search)
  if (phase !== 'ALL') params.set('phase', phase)
  if (entityId) params.set('entityId', entityId)

  const { data, loading, error } = useFetch<ProjectListData>(`/api/projects?${params.toString()}`)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Modul Proyek</h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            Siklus pelaporan harian proyek aktif
          </p>
        </div>
        <Button className="glass-blue text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 border-blue-500/30" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Ajukan Proyek
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Cari nama proyek atau kode..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="glass pl-9 h-9 text-sm border-slate-200/60"
              />
            </div>
            <Select value={phase} onValueChange={(v) => { setPhase(v); setPage(1) }}>
              <SelectTrigger className="glass h-9 text-sm w-full sm:w-40">
                <Filter className="h-3 w-3 mr-1 text-slate-400 dark:text-slate-500" />
                <SelectValue placeholder="Tahap" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                <SelectItem value="ALL">Semua tahap</SelectItem>
                <SelectItem value="INISIASI">Inisiasi</SelectItem>
                <SelectItem value="PERENCANAAN">Perencanaan</SelectItem>
                <SelectItem value="PELAKSANAAN">Pelaksanaan</SelectItem>
                <SelectItem value="PENYELESAIAN">Penyelesaian</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data?.items?.length ? (
        <EmptyState icon={<FolderKanban className="h-5 w-5 text-slate-400 dark:text-slate-500" />} title="Tidak ada proyek" description="Coba ubah filter pencarian" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.items.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Menampilkan {data.items.length} dari {data.total} proyek
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="glass h-8 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-300 px-2">
                {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="glass h-8 text-sm"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: ProjectListData['items'][number] }) {
  const r = project.latestReport
  const meta = r ? DAILY_STATUS_META[r.status] : null

  return (
    <Card className="glass hover:shadow-lg transition-all group">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 group-hover:text-blue-700 transition-colors">
              {project.name}
            </h3>
            <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono mt-1">{project.code}</Badge>
          </div>
          {r && meta && (
            <DailyStatusBadge status={r.status} size="xs" />
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{project.entity.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <MapPin className="h-3 w-3" />
          <span>{project.entity.region || '-'}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[11px] h-4 px-1 border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/5">
            {PROJECT_PHASE_LABELS[project.phase]}
          </Badge>
          <Badge variant="outline" className="text-[11px] h-4 px-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5">
            {PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
          </Badge>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500 dark:text-slate-400">Progress</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{r?.progressPct || 0}%</span>
          </div>
          <Progress value={r?.progressPct || 0} className="h-1.5" />
        </div>

        {/* Latest report info */}
        {r ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100/60">
            <Calendar className="h-3 w-3" />
            <span>Laporan terakhir: {formatDate(r.reportDate)}</span>
            {r.isLate && <Badge className="text-[8px] h-3.5 px-1 bg-rose-500/15 text-rose-700 dark:text-rose-300">Terlambat</Badge>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 pt-2 border-t border-slate-100/60">
            <Calendar className="h-3 w-3" />
            <span>Belum ada laporan</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
