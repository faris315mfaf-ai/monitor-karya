'use client'

/**
 * Dashboard pemantau — Manajemen, Direksi Holding, Direktur Entitas, TI, Super Admin,
 * Auditor (docs/design/peran/01-manajemen.md & 02-direktur.md).
 * Jawaban dulu: "x dari y proyek berjalan sesuai rencana.", lalu angka, daftar, detail.
 *
 * Direktur entitas mendapat layar Direktur (saringan divisi, laporan mingguan per
 * kepala divisi, output per divisi); peran grup lain mendapat layar Manajemen.
 * Isi layar ada di src/components/oversight/.
 */

import { useApp } from '@/components/app-provider'
import { useFetch } from '@/hooks/use-fetch'
import { Card, DashboardSkeleton, ErrorNote } from '@/components/mk'
import { DashHeader } from '@/components/views/dash-common'
import { DirectorDashboard } from '@/components/oversight/director-dashboard'
import { ManagementDashboard } from '@/components/oversight/management-dashboard'
import type { RingkasanData } from '@/components/oversight/types'

export type { RingkasanData } from '@/components/oversight/types'

/** Peran yang memakai layar Direktur (membawahi divisi dalam satu PT). */
const DIRECTOR_ROLES = ['DIREKTUR_ENTITAS']

export function OversightDashboard() {
  const { user } = useApp()
  const { data, loading, error, reload } = useFetch<RingkasanData>('/api/ringkasan')

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

  // Layar Direktur butuh data divisi; respons lama tanpa `divisions` jatuh ke layar Manajemen.
  if (DIRECTOR_ROLES.includes(user.role) && (data.divisions?.length ?? 0) > 0) {
    return <DirectorDashboard data={data} />
  }
  return <ManagementDashboard data={data} reload={reload} />
}
