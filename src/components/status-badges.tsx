'use client'

/**
 * Lencana status lama dipetakan ke StatusBadge desain: warna + ikon + kata
 * (01 · Prinsip: warna tidak pernah sendirian).
 */

import { StatusBadge, type Status } from '@/components/mk'
import {
  DAILY_STATUS_META,
  WEEKLY_STATUS_META,
  WEEKLY_HEADER_META,
  ESCALATION_STATUS_META,
  PRIORITY_META,
  UNLOCK_STATUS_META,
} from '@/lib/constants'
import { formatPercent } from '@/lib/format'

const DAILY: Record<string, Status> = {
  SELESAI: 'done',
  ON_PROGRESS: 'on',
  TERKENDALA: 'risk',
  MENUNGGU_KEPUTUSAN: 'info',
  TIDAK_ADA_PERUBAHAN: 'neutral',
}
const WEEKLY_ITEM: Record<string, Status> = {
  SELESAI: 'done',
  ON_PROGRESS: 'on',
  BELUM_MULAI: 'neutral',
  TERKENDALA: 'risk',
  NA: 'neutral',
}
const WEEKLY_HEADER: Record<string, Status> = {
  DRAFT: 'info',
  MENUNGGU_PERSETUJUAN: 'risk',
  DISETUJUI: 'done',
  TERKUNCI: 'neutral',
}
const ESCALATION: Record<string, Status> = { DIAJUKAN: 'info', DITINJAU: 'risk', DIPUTUSKAN: 'done', DITUTUP: 'neutral' }
const PRIORITY: Record<string, Status> = { TINGGI: 'late', SEDANG: 'risk', RENDAH: 'info' }
const UNLOCK: Record<string, Status> = { DIAJUKAN: 'info', DISETUJUI: 'done', DITOLAK: 'late', DIEKSEKUSI: 'done' }

export const dailyStatus = (s: string | null | undefined): Status => (s && DAILY[s]) || 'neutral'
export const weeklyItemStatus = (s: string | null | undefined): Status => (s && WEEKLY_ITEM[s]) || 'neutral'
export const weeklyHeaderStatus = (s: string | null | undefined): Status => (s && WEEKLY_HEADER[s]) || 'neutral'
export const escalationStatus = (s: string | null | undefined): Status => (s && ESCALATION[s]) || 'neutral'

function Unknown({ value }: { value: string }) {
  return <StatusBadge status="neutral" size="sm">{value}</StatusBadge>
}

export function DailyStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const meta = DAILY_STATUS_META[status]
  if (!meta) return <Unknown value={status} />
  return <StatusBadge status={DAILY[status]} size={size === 'xs' ? 'sm' : 'md'}>{meta.label}</StatusBadge>
}

export function WeeklyItemStatusBadge({ status }: { status: string }) {
  const meta = WEEKLY_STATUS_META[status]
  if (!meta) return <Unknown value={status} />
  return <StatusBadge status={WEEKLY_ITEM[status]} size="sm">{meta.label}</StatusBadge>
}

export function WeeklyHeaderBadge({ status }: { status: string }) {
  const meta = WEEKLY_HEADER_META[status]
  if (!meta) return <Unknown value={status} />
  return <StatusBadge status={WEEKLY_HEADER[status]} size="sm">{meta.label}</StatusBadge>
}

export function EscalationStatusBadge({ status }: { status: string }) {
  const meta = ESCALATION_STATUS_META[status]
  if (!meta) return <Unknown value={status} />
  return <StatusBadge status={ESCALATION[status]} size="sm">{meta.label}</StatusBadge>
}

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority]
  if (!meta) return <Unknown value={priority} />
  return <StatusBadge status={PRIORITY[priority]} size="sm">{meta.label}</StatusBadge>
}

export function UnlockStatusBadge({ status }: { status: string }) {
  const meta = UNLOCK_STATUS_META[status]
  if (!meta) return <Unknown value={status} />
  return <StatusBadge status={UNLOCK[status]} size="sm">{meta.label}</StatusBadge>
}

export function complianceStatus(score: number): Status {
  return score >= 90 ? 'done' : score >= 75 ? 'on' : score >= 60 ? 'risk' : 'late'
}

/** [F4-B] Status selalu warna + ikon + kata: kata kepatuhan mengikuti panel SDM (Patuh · Perlu perhatian · Terlambat). */
export function complianceLabel(score: number): string {
  const st = complianceStatus(score)
  return st === 'late' ? 'Terlambat' : st === 'risk' ? 'Perlu perhatian' : 'Patuh'
}

export function ComplianceBadge({ score }: { score: number }) {
  return (
    <StatusBadge status={complianceStatus(score)} size="sm">
      {complianceLabel(score)} {formatPercent(score, 1)}
    </StatusBadge>
  )
}
