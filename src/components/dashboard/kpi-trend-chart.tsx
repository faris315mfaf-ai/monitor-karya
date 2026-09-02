'use client'

import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
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
  const url = `/api/kpi-trends${scopeEntityId ? `?scopeEntityId=${scopeEntityId}` : ''}`
  const { data, loading, error } = useFetch<TrendData>(url)

  if (loading) return <LoadingSpinner className="py-6" />
  if (error || !data) return <EmptyState title="Gagal memuat tren" description={error} />

  const chartData = data.months.map((m) => ({
    label: m.label,
    Kepatuhan: Number(m.avgCompliance.toFixed(1)),
    'Tepat Waktu': Number(m.avgOnTime.toFixed(1)),
    Mingguan: Number(m.avgWeeklyCompleteness.toFixed(1)),
    Bukti: Number(m.avgEvidenceCompleteness.toFixed(1)),
    'Prioritas Tinggi': Number(m.avgHighPriorityCompletion.toFixed(1)),
  }))

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorKepatuhan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
          />
          <YAxis
            domain={[60, 100]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(37,99,235,0.2)',
              borderRadius: 12,
              fontSize: 11,
              boxShadow: '0 8px 32px -8px rgba(37,99,235,0.15)',
            }}
            formatter={(v: any) => `${formatPercent(Number(v), 1)}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          <Line type="monotone" dataKey="Kepatuhan" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb' }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="Tepat Waktu" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="Mingguan" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="Bukti" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="Prioritas Tinggi" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
