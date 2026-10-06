'use client'

/**
 * Meja kerja — pekerjaan HARI INI akun yang sedang masuk, menurut perannya:
 * PIC proyek (laporan & agenda task), Kepala divisi (penyerahan capaian
 * mingguan), Admin PT (kepatuhan laporan, pengingat, yang menunggu tanda
 * tangan). Data dari /api/work-desk; Kepala divisi juga membaca papan minggu
 * berjalan dari /api/weekly-input.
 */

import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import { Card, DashboardSkeleton, EmptyNote, ErrorNote } from '@/components/mk'
import type { Data as WeeklyData } from '@/components/division-weekly-desk'
import { DashHeader } from '@/components/views/dash-common'
import { PicDeskView, type PicDesk } from '@/components/work-desk/pic-desk'
import { KadivDeskView, type KadivDesk } from '@/components/work-desk/kadiv-desk'
import { AdminDeskView, type AdminDesk } from '@/components/work-desk/admin-desk'
import { ROLE_LABELS } from '@/lib/constants'

type Desk = PicDesk | KadivDesk | AdminDesk

export function WorkDeskView() {
  const { user } = useApp()
  const applies = user.role === 'PIC_PROYEK' || user.role === 'KEPALA_DIVISI' || Boolean(user.scopeEntityId)
  const desk = useResource<Desk>(applies ? '/api/work-desk' : null)
  const weekly = useResource<WeeklyData>(applies && user.role === 'KEPALA_DIVISI' ? '/api/weekly-input' : null)

  if (!applies) {
    return (
      <>
        <DashHeader context="Meja kerja" />
        <Card>
          <EmptyNote icon="gedung">
            Akun {ROLE_LABELS[user.role] ?? user.role} tidak terikat pada satu PT, sehingga tidak punya meja kerja harian. Pantau perusahaan dari Ringkasan.
          </EmptyNote>
        </Card>
      </>
    )
  }

  const reload = () => {
    desk.reload()
    weekly.reload()
  }
  const error = desk.error ?? weekly.error
  if (error && (!desk.data || (desk.data.kind === 'KADIV' && !weekly.data))) {
    return (
      <>
        <DashHeader context="Meja kerja" />
        <Card>
          <ErrorNote message={error} onRetry={reload} />
        </Card>
      </>
    )
  }

  const d = desk.data
  const needsWeekly = d?.kind === 'KADIV'
  if (!d || (needsWeekly && !weekly.data)) return <DashboardSkeleton />

  return (
    <div className={desk.loading || weekly.loading ? 'mk-desk is-refreshing' : 'mk-desk'}>
      {d.kind === 'PIC' && <PicDeskView data={d} reload={reload} />}
      {d.kind === 'KADIV' && weekly.data && <KadivDeskView desk={d} weekly={weekly.data} reload={reload} />}
      {d.kind === 'ADMIN' && <AdminDeskView data={d} reload={reload} />}
    </div>
  )
}
