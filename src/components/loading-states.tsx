'use client'

import { cn } from '@/lib/utils'
import { EmptyNote, ErrorNote, Skeleton } from '@/components/mk'

/** Kerangka memuat seukuran isi asli, tanpa spinner (13 · Pola layar). */
export function LoadingCard({ className }: { className?: string }) {
  return (
    <div className={cn('mk-stat mk-stat--surface', className)} aria-hidden>
      <Skeleton h={12} w={96} />
      <Skeleton h={28} w={64} r={8} />
      <Skeleton h={10} w={128} />
    </div>
  )
}

export function LoadingRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 py-3" aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} h={12} className="flex-1" />
      ))}
    </div>
  )
}

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('mk-card flex flex-col gap-3', className)} aria-busy="true" aria-label="Memuat">
      <Skeleton h={20} w="40%" />
      <Skeleton h={14} />
      <Skeleton h={14} w="85%" />
      <Skeleton h={14} w="70%" />
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
    <div className="mk-empty">
      {icon && <span className="mk-empty__icon mk-soft--neutral">{icon}</span>}
      <span className="t-body-strong text-ink">{title}</span>
      {description && <span className="t-footnote text-ink-2 max-w-sm">{description}</span>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="mk-card">
      <ErrorNote message={`Data belum termuat. ${message}`} />
    </div>
  )
}

export { EmptyNote }
