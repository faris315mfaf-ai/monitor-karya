import { can } from '@/lib/rbac'

/**
 * [B3] Izin aksi per eskalasi untuk satu akun — satu sumber untuk layar web
 * (escalations-view.tsx) dan respons `GET /api/escalations` (kolom `perms`,
 * dibaca klien Android). Aturannya cermin dari penegakan di
 * src/app/api/escalations/actions/route.ts:
 *
 *   review — kapabilitas `escalation:followup`, hanya saat DIAJUKAN.
 *   decide — kapabilitas `escalation:decide`, sebelum DIPUTUSKAN/DITUTUP
 *            (keputusan hanya sekali, T12).
 *   close  — saat DIPUTUSKAN, oleh peran decide/followup atau pengajunya.
 *
 * Cakupan entitas tidak dihitung di sini: daftar GET sudah disaring cakupan,
 * dan rute aksi tetap memeriksa ulang (403/409) sebagai hakim terakhir.
 * Modul ini murni (tanpa server-only) agar bisa diimpor komponen klien.
 */
export type EscalationPerms = { mayReview: boolean; mayDecide: boolean; mayClose: boolean }

export type EscalationPermViewer = { id: string; role: string }
export type EscalationPermTarget = { status: string; raisedById: string | null }

export function escalationPerms(viewer: EscalationPermViewer, e: EscalationPermTarget): EscalationPerms {
  const mayReview = can(viewer.role, 'escalation:followup') && e.status === 'DIAJUKAN'
  const mayDecide = can(viewer.role, 'escalation:decide') && e.status !== 'DITUTUP' && e.status !== 'DIPUTUSKAN'
  const mayClose =
    e.status === 'DIPUTUSKAN' &&
    (can(viewer.role, 'escalation:decide') || can(viewer.role, 'escalation:followup') || e.raisedById === viewer.id)
  return { mayReview, mayDecide, mayClose }
}
