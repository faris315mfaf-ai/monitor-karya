'use client'

import { useFetch } from '@/hooks/use-fetch'
import { Card, DashboardSkeleton, ErrorNote } from '@/components/mk'
import {
  AdminDashboard, KadivDashboard, PicDashboard,
  type AdminData, type KadivData, type PicData,
} from '@/components/views/role-dashboards'
import { OversightDashboard } from '@/components/views/oversight-dashboard'
import { DashHeader } from '@/components/views/dash-common'

type MyDashboard = PicData | KadivData | AdminData | { kind: 'OVERSIGHT' }

/**
 * Dashboard sesuai tanggung jawab peran (docs/design/peran/). Yang mengisi data
 * mendapat layar kerja; yang mengawasi mendapat ringkasan dan keputusan.
 */
export function DashboardView() {
  const { data, loading, error, reload } = useFetch<MyDashboard>('/api/my-dashboard')

  if (loading) return <DashboardSkeleton />

  if (error || !data) {
    return (
      <>
        <DashHeader />
        <Card>
          <ErrorNote message={error ? `Data belum termuat. ${error}` : undefined} onRetry={reload} />
        </Card>
      </>
    )
  }

  if (data.kind === 'PIC') return <PicDashboard data={data} />
  if (data.kind === 'KADIV') return <KadivDashboard data={data} />
  if (data.kind === 'ADMIN') return <AdminDashboard data={data} />
  return <OversightDashboard />
}
