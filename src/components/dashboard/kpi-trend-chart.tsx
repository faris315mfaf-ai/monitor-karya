'use client'

/**
 * Tren KPI bulanan grup: kepatuhan dibandingkan tepat waktu (AreaChart desain),
 * angka lain tertulis di daftar bawahnya. Semua warna dari token — tidak ada
 * recharts/hex lagi. Belum dipasang di layar mana pun.
 */

import { useFetch } from '@/hooks/use-fetch'
import { AreaChart, EmptyNote, ErrorNote, Skeleton } from '@/components/mk'
import { formatPercent } from '@/lib/format'

type TrendData = {
  months: Array<{
    periodKey: string
    label: string
    avgCompliance: number
    avgOnTime: number
    avgWeeklyCompleteness: number
    avgEvidenceCompleteness: number
    avgHighPriorityCompletion: number
    totalEntities: number
  }>
}

export function KpiTrendChart({ scopeEntityId }: { scopeEntityId?: string | null }) {
  const url = `/api/kpi-trends${scopeEntityId ? `?scopeEntityId=${encodeURIComponent(scopeEntityId)}` : ''}`
  const { data, loading, error, reload } = useFetch<TrendData>(url)

  if (loading && !data) return <Skeleton h={220} r={16} />
  if (error || !data) return <ErrorNote message="Tren KPI belum termuat." onRetry={reload} />
  if (data.months.length === 0) return <EmptyNote icon="laporan">Belum ada data tren bulanan.</EmptyNote>

  const last = data.months[data.months.length - 1]
  const rows: [string, number][] = [
    ['Mingguan lengkap', last.avgWeeklyCompleteness],
    ['Bukti lengkap', last.avgEvidenceCompleteness],
    ['Prioritas tinggi selesai', last.avgHighPriorityCompletion],
  ]

  return (
    <div className="flex flex-col gap-4">
      <AreaChart
        data={data.months.map((m) => ({ label: m.label, value: Math.round(m.avgCompliance * 10) / 10 }))}
        compare={data.months.map((m) => Math.round(m.avgOnTime * 10) / 10)}
        seriesLabel="Kepatuhan"
        compareLabel="Tepat waktu"
        unit="%"
        tone="data-1"
        formatValue={(v) => formatPercent(v, 1)}
      />
      <dl className="grid gap-2 sm:grid-cols-3">
        {rows.map(([label, v]) => (
          <div key={label} className="mk-inset">
            <dt className="t-footnote text-ink-2">{label}</dt>
            <dd className="t-headline tabular-nums">{formatPercent(v, 1)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
