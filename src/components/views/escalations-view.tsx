'use client'

import { useState, useMemo } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EscalationStatusBadge } from '@/components/status-badges'
import {
  ESCALATION_STATUS_META,
  ESCALATION_NEEDED_LABELS,
} from '@/lib/constants'
import {
  Siren, Clock, AlertTriangle, User, Gavel, CheckCircle2, Filter,
} from 'lucide-react'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type Escalation = {
  id: string
  sourceType: string
  sourceId: string
  summary: string
  needed: string
  status: string
  raisedAt: string
  slaDays: number
  ageDays: number
  isOverdue: boolean
  decidedAt: string | null
  decisionText: string | null
  entityId: string
  entity: { id: string; name: string; code: string; region: string | null }
  raisedById: string | null
  raisedBy: { id: string; name: string; email: string } | null
  decidedById: string | null
  decidedBy: { id: string; name: string; email: string } | null
}

type EscalationListData = {
  items: Escalation[]
  total: number
  page: number
  pageSize: number
}

const STATUS_COLUMNS = ['DIAJUKAN', 'DITINJAU', 'DIPUTUSKAN', 'DITUTUP'] as const

const COLUMN_ACCENT: Record<string, { bar: string; headerBg: string; ring: string; dot: string }> = {
  DIAJUKAN: {
    bar: 'bg-blue-500',
    headerBg: 'bg-blue-500/10',
    ring: 'ring-blue-500/30',
    dot: 'bg-blue-500',
  },
  DITINJAU: {
    bar: 'bg-amber-500',
    headerBg: 'bg-amber-500/10',
    ring: 'ring-amber-500/30',
    dot: 'bg-amber-500',
  },
  DIPUTUSKAN: {
    bar: 'bg-emerald-500',
    headerBg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  DITUTUP: {
    bar: 'bg-slate-400',
    headerBg: 'bg-slate-500/10',
    ring: 'ring-slate-500/30',
    dot: 'bg-slate-400',
  },
}

const NEEDED_OPTIONS = [
  { value: 'ALL', label: 'Semua kebutuhan' },
  { value: 'KEPUTUSAN', label: 'Keputusan' },
  { value: 'ANGGARAN', label: 'Anggaran' },
  { value: 'DUKUNGAN_LINTAS_FUNGSI', label: 'Dukungan Lintas Fungsi' },
]

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'DIAJUKAN', label: 'Diajukan' },
  { value: 'DITINJAU', label: 'Ditinjau' },
  { value: 'DIPUTUSKAN', label: 'Diputuskan' },
  { value: 'DITUTUP', label: 'Ditutup' },
]

export function EscalationsView() {
  const [status, setStatus] = useState<string>('ALL')
  const [needed, setNeeded] = useState<string>('ALL')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: '1', pageSize: '100' })
    if (status !== 'ALL') p.set('status', status)
    if (needed !== 'ALL') p.set('needed', needed)
    if (overdueOnly) p.set('overdue', 'true')
    return p.toString()
  }, [status, needed, overdueOnly])

  const { data, loading, error } = useFetch<EscalationListData>(`/api/escalations?${params}`)

  // Group items by status into 4 columns
  const grouped = useMemo(() => {
    const map: Record<string, Escalation[]> = {
      DIAJUKAN: [],
      DITINJAU: [],
      DIPUTUSKAN: [],
      DITUTUP: [],
    }
    for (const it of data?.items || []) {
      if (map[it.status]) map[it.status].push(it)
      else map.DITUTUP.push(it) // unknown statuses fall under DITUTUP
    }
    return map
  }, [data])

  // Determine which columns to show. If status filter is set, only show that column.
  const visibleColumns = status !== 'ALL' ? [status] : Array.from(STATUS_COLUMNS)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Papan Eskalasi</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Pelacakan keputusan lintas entitas
        </p>
      </div>

      {/* Filter bar */}
      <Card className="glass">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="glass h-9 text-xs w-full sm:w-44">
                <Filter className="h-3 w-3 mr-1 text-slate-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={needed} onValueChange={setNeeded}>
              <SelectTrigger className="glass h-9 text-xs w-full sm:w-52">
                <Siren className="h-3 w-3 mr-1 text-slate-400" />
                <SelectValue placeholder="Kebutuhan" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {NEEDED_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={overdueOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOverdueOnly((v) => !v)}
              className={cn(
                'h-9 text-xs gap-1.5',
                overdueOnly
                  ? 'bg-rose-500/90 text-white hover:bg-rose-600 border-rose-500'
                  : 'glass border-slate-200/60 text-slate-600 hover:bg-rose-500/10',
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {overdueOnly ? 'Lewat SLA aktif' : 'Hanya lewat SLA'}
            </Button>
            <div className="text-xs text-slate-500 sm:ml-auto">
              {data?.total ?? 0} eskalasi
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Board */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data?.items?.length ? (
        <EmptyState
          icon={<Siren className="h-5 w-5 text-slate-400" />}
          title="Tidak ada eskalasi"
          description="Coba ubah filter pencarian"
        />
      ) : (
        <div className={cn(
          'flex gap-3 overflow-x-auto scrollbar-thin pb-2',
          'lg:grid lg:grid-cols-4 lg:overflow-visible',
        )}>
          {visibleColumns.map((colStatus) => (
            <KanbanColumn
              key={colStatus}
              status={colStatus}
              items={grouped[colStatus] || []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KanbanColumn({ status, items }: { status: string; items: Escalation[] }) {
  const meta = ESCALATION_STATUS_META[status]
  const accent = COLUMN_ACCENT[status] || COLUMN_ACCENT.DITUTUP
  return (
    <div
      className={cn(
        'glass rounded-2xl p-3 flex flex-col min-w-[280px] lg:min-w-0 w-[280px] lg:w-auto',
        'ring-1', accent.ring,
      )}
    >
      {/* Column header */}
      <div className={cn('rounded-xl px-2.5 py-2 mb-2.5 flex items-center justify-between', accent.headerBg)}>
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', accent.dot)} />
          <span className="text-xs font-semibold text-slate-700">{meta?.label || status}</span>
        </div>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono tabular-nums">
          {items.length}
        </Badge>
      </div>

      {/* Items */}
      <div className="max-h-[60vh] overflow-y-auto scrollbar-thin pr-1 -mr-1 space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-6 text-[11px] text-slate-400">Tidak ada item</div>
        ) : (
          items.map((it) => (
            <EscalationCard key={it.id} escalation={it} />
          ))
        )}
      </div>
    </div>
  )
}

function EscalationCard({ escalation }: { escalation: Escalation }) {
  const neededLabel = ESCALATION_NEEDED_LABELS[escalation.needed] || escalation.needed
  return (
    <div className="glass-strong rounded-xl p-3 space-y-2 hover:shadow-md transition-all">
      {/* Header: entity info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800 truncate">{escalation.entity.name}</p>
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 flex-wrap">
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono">
              {escalation.entity.code}
            </Badge>
            <span className="truncate">{escalation.entity.region || '-'}</span>
          </div>
        </div>
        <EscalationStatusBadge status={escalation.status} />
      </div>

      {/* Summary */}
      <p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed">
        {escalation.summary}
      </p>

      {/* Needed */}
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        <span className="font-medium">Butuh:</span>
        <span className="text-blue-700 font-semibold">{neededLabel}</span>
      </div>

      {/* Age + overdue */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-1.5 py-0.5 tabular-nums',
            escalation.isOverdue
              ? 'bg-rose-500/15 text-rose-700'
              : 'bg-slate-500/10 text-slate-600',
          )}
        >
          {escalation.isOverdue ? (
            <AlertTriangle className="h-2.5 w-2.5" />
          ) : (
            <Clock className="h-2.5 w-2.5" />
          )}
          {escalation.ageDays} hari
          {escalation.slaDays > 0 && (
            <span className="opacity-70">/ SLA {escalation.slaDays}</span>
          )}
        </span>
      </div>

      {/* Raised by */}
      {escalation.raisedBy && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">
            <span className="text-slate-700 font-medium">{escalation.raisedBy.name}</span>
            <span className="text-slate-400"> · {formatRelative(escalation.raisedAt)}</span>
          </span>
        </div>
      )}

      {/* Decided by */}
      {escalation.decidedBy && (
        <div className="glass rounded-md p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-700">
            <Gavel className="h-3 w-3 shrink-0" />
            <span className="font-medium">Diputuskan oleh {escalation.decidedBy.name}</span>
          </div>
          {escalation.decisionText && (
            <p className="text-[10px] text-slate-600 line-clamp-2 pl-4">
              {escalation.decisionText}
            </p>
          )}
          {escalation.status === 'DITUTUP' && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-700 pl-4">
              <CheckCircle2 className="h-3 w-3" />
              <span>Ditutup</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
