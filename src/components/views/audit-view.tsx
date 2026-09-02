'use client'

import { useState, useMemo } from 'react'
import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateTime, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Shield, History, User, Search, Filter, ChevronLeft, ChevronRight,
  Code, Globe,
} from 'lucide-react'

type AuditLog = {
  id: string
  action: string
  targetType: string
  targetId: string
  beforeData: unknown
  afterData: unknown
  ip: string | null
  userAgent: string | null
  at: string
  actorId: string | null
  actor: { id: string; name: string; email: string; role: string } | null
}

type AuditLogListData = {
  items: AuditLog[]
  total: number
  page: number
  pageSize: number
}

const ACTION_OPTIONS = [
  { value: 'ALL', label: 'Semua aksi' },
  { value: 'CREATE_REPORT', label: 'Buat Laporan' },
  { value: 'UPDATE_REPORT', label: 'Ubah Laporan' },
  { value: 'APPROVE_WEEKLY', label: 'Setujui Mingguan' },
  { value: 'LOCK_REPORT', label: 'Kunci Laporan' },
  { value: 'UNLOCK_EXECUTE', label: 'Buka Kunci' },
  { value: 'CREATE_ESCALATION', label: 'Buat Eskalasi' },
  { value: 'DECIDE_ESCALATION', label: 'Putuskan Eskalasi' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
]

const TARGET_TYPE_OPTIONS = [
  { value: 'ALL', label: 'Semua target' },
  { value: 'DAILY_REPORT', label: 'Laporan Harian' },
  { value: 'WEEKLY_REPORT', label: 'Laporan Mingguan' },
  { value: 'ESCALATION', label: 'Eskalasi' },
]

const ACTION_COLORS: Record<string, string> = {
  CREATE_REPORT: 'bg-blue-500/15 text-blue-700',
  UPDATE_REPORT: 'bg-amber-500/15 text-amber-700',
  APPROVE_WEEKLY: 'bg-emerald-500/15 text-emerald-700',
  LOCK_REPORT: 'bg-rose-500/15 text-rose-700',
  UNLOCK_EXECUTE: 'bg-violet-500/15 text-violet-700',
  CREATE_ESCALATION: 'bg-cyan-500/15 text-cyan-700',
  DECIDE_ESCALATION: 'bg-emerald-500/15 text-emerald-700',
  LOGIN: 'bg-sky-500/15 text-sky-700',
  LOGOUT: 'bg-slate-500/15 text-slate-600',
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_REPORT: 'Buat Laporan',
  UPDATE_REPORT: 'Ubah Laporan',
  APPROVE_WEEKLY: 'Setujui Mingguan',
  LOCK_REPORT: 'Kunci Laporan',
  UNLOCK_EXECUTE: 'Buka Kunci',
  CREATE_ESCALATION: 'Buat Eskalasi',
  DECIDE_ESCALATION: 'Putuskan Eskalasi',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
}

const TARGET_LABELS: Record<string, string> = {
  DAILY_REPORT: 'Laporan Harian',
  WEEKLY_REPORT: 'Laporan Mingguan',
  ESCALATION: 'Eskalasi',
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    // Already a string; might already be JSON-stringified
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '…'
}

export function AuditView() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<string>('ALL')
  const [targetType, setTargetType] = useState<string>('ALL')

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (action !== 'ALL') p.set('action', action)
    if (targetType !== 'ALL') p.set('targetType', targetType)
    return p.toString()
  }, [page, action, targetType])

  const { data, loading, error } = useFetch<AuditLogListData>(`/api/audit-logs?${params}`)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Audit Trail</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Riwayat perubahan data (append-only)
          </p>
        </div>
        <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Append-only</span>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="glass">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
              <SelectTrigger className="glass h-9 text-xs w-full sm:w-52">
                <Filter className="h-3 w-3 mr-1 text-slate-400" />
                <SelectValue placeholder="Aksi" />
              </SelectTrigger>
              <SelectContent className="glass-strong max-h-72">
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetType} onValueChange={(v) => { setTargetType(v); setPage(1) }}>
              <SelectTrigger className="glass h-9 text-xs w-full sm:w-44">
                <Search className="h-3 w-3 mr-1 text-slate-400" />
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {TARGET_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-slate-500 sm:ml-auto">
              {data?.total ?? 0} log
            </div>
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
          icon={<Shield className="h-5 w-5 text-slate-400" />}
          title="Tidak ada log audit"
          description="Coba ubah filter pencarian"
        />
      ) : (
        <>
          {/* Table on md+, cards on mobile */}
          <div className="hidden md:block">
            <Card className="glass overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/60 text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="text-left font-semibold px-3 py-2.5">Waktu</th>
                      <th className="text-left font-semibold px-3 py-2.5">Aktor</th>
                      <th className="text-left font-semibold px-3 py-2.5">Aksi</th>
                      <th className="text-left font-semibold px-3 py-2.5">Target</th>
                      <th className="text-left font-semibold px-3 py-2.5">Perubahan</th>
                      <th className="text-left font-semibold px-3 py-2.5">Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((log) => (
                      <AuditRow key={log.id} log={log} variant="table" />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {data.items.map((log) => (
              <AuditRow key={log.id} log={log} variant="card" />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-slate-500">
              Menampilkan {data.items.length} dari {formatNumber(data.total)} log
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="glass h-8 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-slate-600 px-2 tabular-nums">
                {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="glass h-8 text-xs"
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

function AuditRow({ log, variant }: { log: AuditLog; variant: 'table' | 'card' }) {
  const actionLabel = ACTION_LABELS[log.action] || log.action
  const actionColor = ACTION_COLORS[log.action] || 'bg-slate-500/15 text-slate-600'
  const targetLabel = TARGET_LABELS[log.targetType] || log.targetType
  const roleLabel = log.actor?.role ? ROLE_LABELS[log.actor.role] : null
  const beforeStr = safeStringify(log.beforeData)
  const afterStr = safeStringify(log.afterData)
  const hasDiff = beforeStr || afterStr

  if (variant === 'table') {
    return (
      <tr className="border-b border-slate-100/60 hover:bg-blue-500/5 transition-colors align-top">
        <td className="px-3 py-2.5 text-[10px] text-slate-600 whitespace-nowrap tabular-nums">
          {formatDateTime(log.at)}
        </td>
        <td className="px-3 py-2.5">
          {log.actor ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1">
                <User className="h-2.5 w-2.5 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-700 truncate">{log.actor.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-400 truncate max-w-[140px]">{log.actor.email}</span>
                {roleLabel && (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-blue-500/30 text-blue-700 bg-blue-500/5">
                    {roleLabel}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Sistem</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={cn('inline-flex items-center rounded-full text-[9px] font-semibold px-2 py-0.5', actionColor)}>
            {actionLabel}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium text-slate-700">{targetLabel}</p>
            <p className="text-[9px] text-slate-400 font-mono truncate max-w-[140px]">{truncate(log.targetId, 16)}</p>
          </div>
        </td>
        <td className="px-3 py-2.5">
          {hasDiff ? (
            <DiffView beforeStr={beforeStr} afterStr={afterStr} />
          ) : (
            <span className="text-[10px] text-slate-400 italic">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="space-y-0.5 text-[9px] text-slate-400">
            {log.ip && (
              <div className="flex items-center gap-1">
                <Globe className="h-2.5 w-2.5" />
                <span className="font-mono truncate max-w-[100px]">{log.ip}</span>
              </div>
            )}
            {log.userAgent && (
              <div className="flex items-center gap-1">
                <Code className="h-2.5 w-2.5" />
                <span className="truncate max-w-[120px]" title={log.userAgent}>{truncate(log.userAgent, 24)}</span>
              </div>
            )}
          </div>
        </td>
      </tr>
    )
  }

  // Card variant for mobile
  return (
    <Card className="glass">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn('inline-flex items-center rounded-full text-[9px] font-semibold px-2 py-0.5', actionColor)}>
                {actionLabel}
              </span>
              <span className="text-[10px] text-slate-500 tabular-nums">{formatDateTime(log.at)}</span>
            </div>
          </div>
        </div>

        {log.actor ? (
          <div className="glass rounded-lg p-2 space-y-0.5">
            <div className="flex items-center gap-1">
              <User className="h-2.5 w-2.5 text-slate-400" />
              <span className="text-[11px] font-medium text-slate-700 truncate">{log.actor.name}</span>
              {roleLabel && (
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-blue-500/30 text-blue-700 bg-blue-500/5 ml-auto">
                  {roleLabel}
                </Badge>
              )}
            </div>
            <p className="text-[9px] text-slate-400 truncate">{log.actor.email}</p>
          </div>
        ) : (
          <p className="text-[10px] text-slate-400 italic">Sistem</p>
        )}

        <div className="flex items-center justify-between gap-2 text-[10px]">
          <div className="min-w-0 flex-1">
            <span className="text-slate-500">Target: </span>
            <span className="text-slate-700 font-medium">{targetLabel}</span>
            <p className="text-[9px] text-slate-400 font-mono truncate">{truncate(log.targetId, 24)}</p>
          </div>
        </div>

        {hasDiff && (
          <DiffView beforeStr={beforeStr} afterStr={afterStr} />
        )}

        {(log.ip || log.userAgent) && (
          <div className="space-y-0.5 text-[9px] text-slate-400">
            {log.ip && (
              <div className="flex items-center gap-1">
                <Globe className="h-2.5 w-2.5" />
                <span className="font-mono">{log.ip}</span>
              </div>
            )}
            {log.userAgent && (
              <div className="flex items-center gap-1">
                <Code className="h-2.5 w-2.5" />
                <span className="truncate" title={log.userAgent}>{truncate(log.userAgent, 40)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DiffView({ beforeStr, afterStr }: { beforeStr: string; afterStr: string }) {
  const beforeTrunc = truncate(beforeStr, 200)
  const afterTrunc = truncate(afterStr, 200)
  return (
    <div className="grid grid-cols-2 gap-1.5 max-w-md">
      {beforeTrunc && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-md p-1.5">
          <p className="text-[8px] font-semibold text-rose-700 uppercase tracking-wide mb-0.5">Sebelum</p>
          <pre className="text-[10px] text-rose-800/80 whitespace-pre-wrap break-all font-mono leading-tight">
            {beforeTrunc}
          </pre>
        </div>
      )}
      {afterTrunc && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-md p-1.5">
          <p className="text-[8px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Sesudah</p>
          <pre className="text-[10px] text-emerald-800/80 whitespace-pre-wrap break-all font-mono leading-tight">
            {afterTrunc}
          </pre>
        </div>
      )}
    </div>
  )
}
