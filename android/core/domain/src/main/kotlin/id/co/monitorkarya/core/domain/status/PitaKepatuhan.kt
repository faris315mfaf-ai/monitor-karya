// Ambang tunggal skor kepatuhan (0–100) untuk SEMUA tampilan Android: peta
// kepatuhan, grafik sub-holding & 10 PT terendah, pohon/ubin tab Entitas, dan
// legenda. Port src/lib/compliance-band.ts (keputusan pemilik 13 Okt 2026,
// android/docs/fase3/KEPUTUSAN-AMBANG-KEPATUHAN.md):
//   skor ≥ 90      → Baik            (tone on,   hijau,  ikon selesai)
//   75 ≤ skor < 90 → Perlu perhatian (tone risk, oranye, ikon peringatan)
//   skor < 75      → Kritis          (tone late, merah,  ikon waktu)
// Pembanding memakai skor mentah tanpa pembulatan: 89,9 tetap "Perlu perhatian".
// Label sengaja BUKAN label status proyek ("Selesai", "Sesuai jadwal",
// "Terlambat") dan bukan "Sesuai/Di bawah target".
package id.co.monitorkarya.core.domain.status

import id.co.monitorkarya.core.domain.model.MkStatusDomain

/** Skor minimum untuk "Baik" — juga garis target batang skor. */
const val KEPATUHAN_BAIK_MIN: Int = 90

/** Skor minimum untuk "Perlu perhatian"; di bawahnya "Kritis". */
const val KEPATUHAN_PERHATIAN_MIN: Int = 75

/** Pita skor kepatuhan; [status] = tone StatusBadge, [label] = kata tampilan. */
enum class PitaKepatuhan(val status: MkStatusDomain, val label: String, val rentang: String) {
    BAIK(MkStatusDomain.ON, "Baik", "≥ $KEPATUHAN_BAIK_MIN"),
    PERHATIAN(MkStatusDomain.RISK, "Perlu perhatian", "$KEPATUHAN_PERHATIAN_MIN–${KEPATUHAN_BAIK_MIN - 1}"),
    KRITIS(MkStatusDomain.LATE, "Kritis", "< $KEPATUHAN_PERHATIAN_MIN"),
    ;

    companion object {
        /** Legenda bersama, urutan tetap dari terbaik ke terburuk. */
        val LEGENDA: List<PitaKepatuhan> = listOf(BAIK, PERHATIAN, KRITIS)
    }
}

/** Skor kepatuhan → pita (complianceBand web). */
fun pitaKepatuhan(skor: Double): PitaKepatuhan = when {
    skor >= KEPATUHAN_BAIK_MIN -> PitaKepatuhan.BAIK
    skor >= KEPATUHAN_PERHATIAN_MIN -> PitaKepatuhan.PERHATIAN
    else -> PitaKepatuhan.KRITIS
}

/** Versi nullable: skor belum ada → null (tampilan memakai abu/netral tanpa lencana skor). */
fun pitaKepatuhanAtauNull(skor: Double?): PitaKepatuhan? = skor?.let(::pitaKepatuhan)
