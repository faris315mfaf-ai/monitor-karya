/**
 * "Laporan masuk" — satu definisi untuk Ringkasan Admin (/api/my-dashboard),
 * Meja kerja (/api/work-desk) dan Penerimaan (/api/inbox).
 *
 *   Masuk              = proyek AKTIF yang laporan hari ininya sudah dikirim (submittedAt terisi).
 *   Menunggu diteruskan = laporan masuk yang belum diteruskan ke holding (forwardedAt kosong).
 *   Belum lapor        = proyek AKTIF tanpa laporan terkirim hari ini.
 *
 * Penyebutnya selalu jumlah proyek AKTIF; laporan milik proyek yang sudah
 * ditutup/diarsipkan hari ini tidak ikut dihitung, sehingga "x dari n" tidak
 * pernah melebihi n dan "belum lapor" tidak pernah negatif.
 */

export type IntakeReport = {
  projectId: string
  submittedAt: Date | null
  forwardedAt?: Date | null
}

export type DailyIntake = {
  projects: number
  received: number
  awaitingForward: number
  missing: number
  /** id proyek aktif yang sudah mengirim laporan hari ini */
  receivedIds: Set<string>
}

export function countDailyIntake(activeProjectIds: readonly string[], todayReports: readonly IntakeReport[]): DailyIntake {
  const active = new Set(activeProjectIds)
  const receivedIds = new Set<string>()
  let awaitingForward = 0
  for (const r of todayReports) {
    if (!active.has(r.projectId) || !r.submittedAt || receivedIds.has(r.projectId)) continue
    receivedIds.add(r.projectId)
    if (!r.forwardedAt) awaitingForward += 1
  }
  return {
    projects: active.size,
    received: receivedIds.size,
    awaitingForward,
    missing: active.size - receivedIds.size,
    receivedIds,
  }
}
