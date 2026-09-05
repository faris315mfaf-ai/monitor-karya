'use client'

import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'blue',
  trend,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: LucideIcon
  tone?: 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet'
  trend?: { value: string; up: boolean }
  onClick?: () => void
}) {
  const tones: Record<string, { ring: string; bg: string; text: string; glow: string; iconBg: string }> = {
    blue: { ring: 'ring-blue-500/20', bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300', glow: 'shadow-glow-blue', iconBg: 'from-blue-600 to-blue-500' },
    cyan: { ring: 'ring-cyan-500/20', bg: 'bg-cyan-500/10', text: 'text-cyan-700', glow: 'shadow-glow-cyan', iconBg: 'from-cyan-500 to-teal-400' },
    emerald: { ring: 'ring-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', glow: '', iconBg: 'from-emerald-500 to-green-400' },
    amber: { ring: 'ring-amber-500/20', bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', glow: '', iconBg: 'from-amber-500 to-yellow-400' },
    rose: { ring: 'ring-rose-500/20', bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300', glow: '', iconBg: 'from-rose-500 to-pink-400' },
    violet: { ring: 'ring-violet-500/20', bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300', glow: '', iconBg: 'from-violet-500 to-purple-400' },
  }
  const t = tones[tone]

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        'glass rounded-2xl p-4 sm:p-5 text-left relative overflow-hidden transition-all w-full',
        'ring-1', t.ring,
        onClick && 'hover:scale-[1.02] hover:shadow-lg cursor-pointer',
      )}
    >
      {/* Decorative blob */}
      <div className={cn('absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-30', t.bg)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] sm:text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums leading-tight">{value}</p>
          {sub && <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">{sub}</p>}
          {trend && (
            <div className={cn('inline-flex items-center gap-1 mt-2 text-xs font-semibold px-1.5 py-0.5 rounded', t.bg, t.text)}>
              <span>{trend.up ? '↑' : '↓'}</span>
              {trend.value}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('shrink-0 h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md text-white', t.iconBg)}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />
          </div>
        )}
      </div>
    </button>
  )
}
