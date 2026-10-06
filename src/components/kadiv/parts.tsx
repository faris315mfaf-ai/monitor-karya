'use client'

import { StatusBadge, type ChartTone } from '@/components/mk'
import { formatTime } from '@/lib/format'
import { ATTENDANCE_LABELS, type TeamMember } from './types'

export const TASK_STATUS_LABEL: Record<string, string> = {
  BELUM_MULAI: 'Belum mulai',
  BERJALAN: 'Berjalan',
  SELESAI: 'Selesai',
  TERKENDALA: 'Terkendala',
  MENUNGGU_KEPUTUSAN: 'Menunggu keputusan',
}

/** Warna batang beban kerja (03-kepala-divisi.md §7): >100 merah, >80 oranye, selain itu data-1. */
export function loadTone(pct: number): ChartTone {
  return pct > 100 ? 'late' : pct > 80 ? 'risk' : 'data-1'
}

/** Lencana laporan harian anggota: Terkirim 16.40 / Belum masuk / Diingatkan / Cuti. */
export function ReportBadge({ member, locked, size }: { member: TeamMember; locked: boolean; size?: 'sm' | 'md' }) {
  const r = member.report
  if (r.state === 'ABSEN') {
    return (
      <StatusBadge status="neutral" size={size}>
        {ATTENDANCE_LABELS[member.attendance]}
      </StatusBadge>
    )
  }
  if (r.state === 'TIDAK_WAJIB') {
    return (
      <StatusBadge status="neutral" size={size}>
        Tidak wajib lapor
      </StatusBadge>
    )
  }
  if (r.state === 'TERKIRIM') {
    return (
      <StatusBadge status="done" size={size}>
        Terkirim {formatTime(r.submittedAt)}
      </StatusBadge>
    )
  }
  if (r.remindedAt) {
    return (
      <StatusBadge status={locked ? 'late' : 'risk'} size={size}>
        Diingatkan {formatTime(r.remindedAt)}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge status={locked ? 'late' : 'risk'} size={size}>
      {r.required > 1 && r.sent > 0 ? `${r.sent} dari ${r.required} masuk` : 'Belum masuk'}
    </StatusBadge>
  )
}
