/**
 * Ambang tunggal skor kepatuhan (0–100) untuk SEMUA tampilan web: peta
 * kepatuhan, grafik manajemen, pohon entitas, ubin KPI, dan legenda.
 *
 * Keputusan pemilik 13 Okt 2026 (temuan B15 E2E-3):
 *   skor ≥ 90      → tone 'on'   (hijau)  "Baik"
 *   75 ≤ skor < 90 → tone 'risk' (oranye) "Perlu perhatian"
 *   skor < 75      → tone 'late' (merah)  "Kritis"
 *
 * Label sengaja BUKAN label status proyek ("Selesai", "Sesuai jadwal",
 * "Terlambat") karena skor kepatuhan adalah mutu, bukan jadwal. Pembanding
 * memakai skor mentah (tanpa pembulatan): 89,9 tetap "Perlu perhatian".
 * Spesifikasi untuk Android: android/docs/fase3/KEPUTUSAN-AMBANG-KEPATUHAN.md.
 */

export type ComplianceTone = 'on' | 'risk' | 'late'

export type ComplianceBand = { tone: ComplianceTone; label: string }

/** Skor minimum untuk "Baik". */
export const COMPLIANCE_GOOD_MIN = 90
/** Skor minimum untuk "Perlu perhatian"; di bawahnya "Kritis". */
export const COMPLIANCE_ATTENTION_MIN = 75

export const COMPLIANCE_LABEL: Record<ComplianceTone, string> = {
  on: 'Baik',
  risk: 'Perlu perhatian',
  late: 'Kritis',
}

/** Skor kepatuhan → warna (tone StatusBadge/ChartTone) + kata Indonesia. */
export function complianceBand(score: number): ComplianceBand {
  const tone: ComplianceTone =
    score >= COMPLIANCE_GOOD_MIN ? 'on' : score >= COMPLIANCE_ATTENTION_MIN ? 'risk' : 'late'
  return { tone, label: COMPLIANCE_LABEL[tone] }
}

/** Legenda bersama: urutan dari terbaik ke terburuk, rentang tertulis. */
export const COMPLIANCE_LEGEND: { tone: ComplianceTone; label: string; range: string }[] = [
  { tone: 'on', label: COMPLIANCE_LABEL.on, range: `≥ ${COMPLIANCE_GOOD_MIN}` },
  { tone: 'risk', label: COMPLIANCE_LABEL.risk, range: `${COMPLIANCE_ATTENTION_MIN}–${COMPLIANCE_GOOD_MIN - 1}` },
  { tone: 'late', label: COMPLIANCE_LABEL.late, range: `< ${COMPLIANCE_ATTENTION_MIN}` },
]
