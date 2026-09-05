'use client'

import { cn } from '@/lib/utils'

export function LoadingCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass rounded-2xl p-5 animate-pulse', className)}>
      <div className="h-3 w-24 bg-slate-200/70 rounded mb-3" />
      <div className="h-7 w-16 bg-slate-200/70 rounded mb-2" />
      <div className="h-2.5 w-32 bg-slate-100/70 rounded" />
    </div>
  )
}

export function LoadingRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 py-3 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-slate-200/70 rounded flex-1"
          style={{ maxWidth: `${100 / cols}%` }}
        />
      ))}
    </div>
  )
}

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{description}</p>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl p-6 text-center border border-rose-500/30">
      <p className="text-base font-semibold text-rose-700 dark:text-rose-300">Gagal memuat data</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{message}</p>
    </div>
  )
}
