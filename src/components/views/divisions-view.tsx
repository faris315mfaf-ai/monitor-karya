'use client'

import { useState, useMemo } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  WeeklyHeaderBadge,
  WeeklyItemStatusBadge,
  PriorityBadge,
} from '@/components/status-badges'
import {
  CalendarRange, Lock, CheckCircle2, AlertTriangle, Search, Filter,
  ChevronLeft, ChevronRight, User, FileText, Target, ChevronDown,
} from 'lucide-react'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ASPECT_CATEGORY_LABELS } from '@/lib/constants'

type WeeklyItem = {
  id: string
  workItem: string
  targetOutput: string
  picName: string
  picTitle: string
  targetDate: string | null
  status: string
  progressPct: number
  achievementThisWeek: string
  obstacleFollowUp: string | null
  needsEscalation: boolean
  evidenceCount: number
  aspectCategory: { id: string; name: string; code: string }
  priority: { id: string; code: string; name: string }
}

type WeeklyReport = {
  id: string
  isoYear: number
  isoWeek: number
  periodStart: string
  periodEnd: string
  statusHeader: string
  isLocked: boolean
  lockedAt: string | null
  isLate: boolean
  approvedAt: string | null
  approvedBy: { id: string; name: string; email: string } | null
  division: { id: string; name: string }
  entity: { id: string; name: string; code: string; region: string | null }
  items: WeeklyItem[]
}

type WeeklyListData = {
  items: WeeklyReport[]
  total: number
  page: number
  pageSize: number
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'MENUNGGU_PERSETUJUAN', label: 'Menunggu Persetujuan' },
  { value: 'DISETUJUI', label: 'Disetujui' },
  { value: 'TERKUNCI', label: 'Terkunci' },
]

export function DivisionsView() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusHeader, setStatusHeader] = useState<string>('ALL')

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '10' })
    if (statusHeader !== 'ALL') p.set('statusHeader', statusHeader)
    if (search.trim()) p.set('search', search.trim())
    return p.toString()
  }, [page, statusHeader, search])

  const { data, loading, error } = useFetch<WeeklyListData>(`/api/weekly-reports?${params}`)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Modul Divisi</h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
          Siklus pelaporan mingguan divisi
        </p>
      </div>

      {/* Filter bar */}
      <Card className="glass">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Cari divisi, entitas, atau wilayah..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="glass pl-9 h-9 text-sm border-slate-200/60"
              />
            </div>
            <Select value={statusHeader} onValueChange={(v) => { setStatusHeader(v); setPage(1) }}>
              <SelectTrigger className="glass h-9 text-sm w-full sm:w-52">
                <Filter className="h-3 w-3 mr-1 text-slate-400 dark:text-slate-500" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
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
        <EmptyState
          icon={<FileText className="h-5 w-5 text-slate-400 dark:text-slate-500" />}
          title="Tidak ada laporan mingguan"
          description="Coba ubah filter pencarian"
        />
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((r) => (
              <WeeklyReportCard key={r.id} report={r} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Menampilkan {data.items.length} dari {formatNumber(data.total)} laporan
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
              <span className="text-sm text-slate-600 dark:text-slate-300 px-2 tabular-nums">
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

function WeeklyReportCard({ report }: { report: WeeklyReport }) {
  const [expanded, setExpanded] = useState(false)

  // Item status breakdown counts
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const it of report.items) {
      counts[it.status] = (counts[it.status] || 0) + 1
    }
    return counts
  }, [report.items])

  const breakdownLabels: Array<{ status: string; label: string }> = [
    { status: 'SELESAI', label: 'Selesai' },
    { status: 'ON_PROGRESS', label: 'Berjalan' },
    { status: 'BELUM_MULAI', label: 'Belum Mulai' },
    { status: 'TERKENDALA', label: 'Terkendala' },
    { status: 'NA', label: 'N/A' },
  ]
  const breakdownStr = breakdownLabels
    .filter((b) => breakdown[b.status])
    .map((b) => `${breakdown[b.status]} ${b.label}`)
    .join(' · ')

  return (
    <Card className="glass hover:shadow-lg transition-all">
      <CardContent className="p-4 space-y-3">
        {/* Top: title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">{report.division.name}</h3>
              <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono">
                W{report.isoWeek}/{report.isoYear}
              </Badge>
              <WeeklyHeaderBadge status={report.statusHeader} />
              {report.isLocked && (
                <Badge className="text-[11px] h-4 px-1 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 gap-0.5">
                  <Lock className="h-2.5 w-2.5" /> Terkunci
                </Badge>
              )}
              {report.isLate && (
                <Badge className="text-[11px] h-4 px-1 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" /> Terlambat
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[13px] text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="truncate">{report.entity.name}</span>
              <span className="text-slate-300">·</span>
              <span className="truncate">{report.entity.region || report.entity.code}</span>
            </div>
          </div>
        </div>

        {/* Period dates */}
        <div className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
          <CalendarRange className="h-3.5 w-3.5 text-blue-500" />
          <span>
            {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
          </span>
        </div>

        {/* Approved by */}
        {report.approvedBy && report.approvedAt && (
          <div className="flex items-center gap-1.5 text-[13px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 rounded-md px-2 py-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>
              Disetujui oleh <span className="font-semibold">{report.approvedBy.name}</span>
              <span className="text-slate-500 dark:text-slate-400"> · {formatDate(report.approvedAt)}</span>
            </span>
          </div>
        )}

        {/* Items count + breakdown */}
        <div className="flex items-center justify-between gap-2 text-[13px] bg-blue-500/5 rounded-md px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 min-w-0">
            <Target className="h-3 w-3 text-blue-600 shrink-0" />
            <span className="font-semibold">{report.items.length} item deliverable</span>
            {breakdownStr && (
              <span className="text-slate-500 dark:text-slate-400 truncate hidden sm:inline">· {breakdownStr}</span>
            )}
          </div>
          {report.items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="glass h-6 text-xs px-2 hover:bg-blue-500/10"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Sembunyikan' : 'Detail'}
              <ChevronDown className={cn('h-3 w-3 ml-0.5 transition-transform', expanded && 'rotate-180')} />
            </Button>
          )}
        </div>

        {/* Expanded items list */}
        {expanded && report.items.length > 0 && (
          <div className="max-h-64 overflow-y-auto scrollbar-thin pr-1 -mr-1 space-y-2 animate-fade-in">
            {report.items.map((it) => (
              <WeeklyItemRow key={it.id} item={it} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WeeklyItemRow({ item }: { item: WeeklyItem }) {
  const aspectLabel = ASPECT_CATEGORY_LABELS[item.aspectCategory.code] || item.aspectCategory.name
  return (
    <div className="glass rounded-xl p-3 border-l-2 border-l-blue-500/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">{item.workItem}</p>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <Badge variant="outline" className="text-[11px] h-3.5 px-1 border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/5">
              {aspectLabel}
            </Badge>
            <PriorityBadge priority={item.priority.code} />
          </div>
        </div>
        <WeeklyItemStatusBadge status={item.status} />
      </div>

      {/* Progress */}
      <div className="mt-2 flex items-center gap-2">
        <Progress value={item.progressPct} className="h-1.5 flex-1" />
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{item.progressPct}%</span>
      </div>

      {/* PIC */}
      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        <User className="h-3 w-3" />
        <span className="truncate">{item.picName}{item.picTitle ? `, ${item.picTitle}` : ''}</span>
      </div>

      {/* Achievement */}
      {item.achievementThisWeek && (
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">Capaian: </span>
          {item.achievementThisWeek}
        </p>
      )}

      {/* Obstacle */}
      {item.obstacleFollowUp && (
        <div className="mt-1.5 text-xs bg-amber-500/5 border border-amber-500/20 rounded-md px-2 py-1 text-amber-800">
          <span className="font-medium">Kendala/Tindak Lanjut: </span>
          <span className="line-clamp-2">{item.obstacleFollowUp}</span>
        </div>
      )}
    </div>
  )
}
