'use client'

import { cn } from '@/lib/utils'
import {
  DAILY_STATUS_META,
  WEEKLY_STATUS_META,
  WEEKLY_HEADER_META,
  ESCALATION_STATUS_META,
  PRIORITY_META,
  UNLOCK_STATUS_META,
} from '@/lib/constants'

export function DailyStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const meta = DAILY_STATUS_META[status]
  if (!meta) return <span className="text-sm text-slate-500 dark:text-slate-400">{status}</span>
  const sz = size === 'xs' ? 'text-[11px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-0.5 gap-1.5'
  return (
    <span className={cn('inline-flex items-center rounded-full font-semibold', meta.bg, meta.text, sz)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function WeeklyItemStatusBadge({ status }: { status: string }) {
  const meta = WEEKLY_STATUS_META[status]
  if (!meta) return <span className="text-sm text-slate-500 dark:text-slate-400">{status}</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-2 py-0.5', meta.bg, meta.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function WeeklyHeaderBadge({ status }: { status: string }) {
  const meta = WEEKLY_HEADER_META[status]
  if (!meta) return <span className="text-sm text-slate-500 dark:text-slate-400">{status}</span>
  return (
    <span className={cn('inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5', meta.bg, meta.text)}>
      {meta.label}
    </span>
  )
}

export function EscalationStatusBadge({ status }: { status: string }) {
  const meta = ESCALATION_STATUS_META[status]
  if (!meta) return <span className="text-sm text-slate-500 dark:text-slate-400">{status}</span>
  return (
    <span className={cn('inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5', meta.bg, meta.text)}>
      {meta.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority]
  if (!meta) return <span className="text-sm text-slate-500 dark:text-slate-400">{priority}</span>
  return (
    <span className={cn('inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5', meta.bg, meta.text)}>
      {meta.label}
    </span>
  )
}

export function UnlockStatusBadge({ status }: { status: string }) {
  const meta = UNLOCK_STATUS_META[status]
  if (!meta) return <span className="text-sm text-slate-500 dark:text-slate-400">{status}</span>
  return (
    <span className={cn('inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5', meta.bg, meta.text)}>
      {meta.label}
    </span>
  )
}

export function ComplianceBadge({ score }: { score: number }) {
  const color =
    score >= 90 ? { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' }
    : score >= 75 ? { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300' }
    : score >= 60 ? { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' }
    : { bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' }
  return (
    <span className={cn('inline-flex items-center rounded-full text-xs font-bold px-2 py-0.5 tabular-nums', color.bg, color.text)}>
      {score.toFixed(1)}%
    </span>
  )
}
