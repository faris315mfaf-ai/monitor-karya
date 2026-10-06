'use client'

import { cn } from '@/lib/utils'
import { Icon, type IconName } from '@/components/mk'

const TONE_TEXT: Record<string, string> = {
  blue: 'text-ink-2',
  cyan: 'text-ink-2',
  violet: 'text-ink-2',
  emerald: 'text-sukses',
  amber: 'text-waspada',
  rose: 'text-bahaya',
}

/**
 * Ubin KPI gaya StatTile (variant surface): label, angka besar tabular, satu
 * baris pembanding. Nada hanya mewarnai baris pembanding, bukan kartunya.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'blue',
  trend,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: IconName
  tone?: 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet'
  trend?: { value: string; up: boolean }
  onClick?: () => void
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="mk-stat__label">{label}</div>
        {icon && <Icon name={icon} size={18} className="text-ink-2 shrink-0" />}
      </div>
      <div className="mk-stat__value">{value}</div>
      {sub && <div className={cn('mk-stat__delta font-medium', TONE_TEXT[tone])}>{sub}</div>}
      {trend && (
        <div className={cn('mk-stat__delta', trend.up ? 'text-sukses' : 'text-bahaya')}>
          {trend.up ? '↑' : '↓'} {trend.value}
        </div>
      )}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="mk-stat mk-stat--surface mk-stat--btn w-full">
      {body}
    </button>
  ) : (
    <div className="mk-stat mk-stat--surface">{body}</div>
  )
}
