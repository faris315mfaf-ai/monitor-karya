// Port src/lib/project-status.ts — satu sumber status proyek untuk semua layar;
// layar tidak menghitung ulang dengan rumus sendiri.
package id.co.monitorkarya.core.domain.status

import id.co.monitorkarya.core.domain.model.LaporanHarian
import id.co.monitorkarya.core.domain.model.MkStatusDomain
import id.co.monitorkarya.core.domain.time.Wib
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.ZonedDateTime

object StatusProyek {

    /** Padanan nilai balik deriveProjectStatus: status + alasan + progres. */
    data class Hasil(
        val status: MkStatusDomain,
        val alasan: String?,
        val progres: Int,
    )

    /** STATUS_ORDER di project-status.ts: late < risk < on < neutral < done. */
    val URUTAN: Map<MkStatusDomain, Int> = mapOf(
        MkStatusDomain.LATE to 0,
        MkStatusDomain.RISK to 1,
        MkStatusDomain.ON to 2,
        MkStatusDomain.NEUTRAL to 3,
        MkStatusDomain.DONE to 4,
    )

    /**
     * Versi ringkas sesuai spesifikasi T4-A7: hanya statusnya.
     *
     * Gap port (data belum tersedia di model domain, lihat
     * android/docs/fase0/T4-A7-LAPORAN.md):
     *  - lifecycle "DITUTUP" tidak ada di ProyekRingkas -> lewat parameter
     *    [siklusHidup]; null berarti tidak diperiksa.
     *  - needsEscalation tidak ada di LaporanHarian -> lewat parameter
     *    [perluEskalasi]; false berarti hanya status laporan yang menentukan.
     *  - tenggat berupa LocalDate (asumsi dihitung sejak tengah malam WIB),
     *    sedangkan TS membandingkan instan Date.
     */
    fun hitung(
        tenggat: LocalDate?,
        terakhir: LaporanHarian?,
        sekarang: ZonedDateTime = ZonedDateTime.now(Wib.ZONA),
        siklusHidup: String? = null,
        perluEskalasi: Boolean = false,
    ): MkStatusDomain = hitungLengkap(tenggat, terakhir, sekarang, siklusHidup, perluEskalasi).status

    /** Port lengkap deriveProjectStatus (status, alasan, progres). */
    fun hitungLengkap(
        tenggat: LocalDate?,
        terakhir: LaporanHarian?,
        sekarang: ZonedDateTime = ZonedDateTime.now(Wib.ZONA),
        siklusHidup: String? = null,
        perluEskalasi: Boolean = false,
    ): Hasil {
        val progres = (terakhir?.progresPct ?: 0).coerceIn(0, 100)
        if (siklusHidup == "DITUTUP" || terakhir?.status == "SELESAI" || progres >= 100) {
            return Hasil(MkStatusDomain.DONE, null, if (terakhir != null) progres else 100)
        }
        val hariIni = sekarang.toLocalDate()
        if (tenggat != null && tenggat.isBefore(hariIni)) {
            val hari = maxOf(1L, ChronoUnit.DAYS.between(tenggat, hariIni))
            return Hasil(MkStatusDomain.LATE, "Lewat tenggat $hari hari", progres)
        }
        if (terakhir == null) {
            return Hasil(MkStatusDomain.NEUTRAL, "Belum ada laporan harian", progres)
        }
        if (terakhir.status == "TERKENDALA" || terakhir.status == "MENUNGGU_KEPUTUSAN" || perluEskalasi) {
            val alasan = terakhir.kendala?.trim()?.takeIf { it.isNotEmpty() }
                ?: if (terakhir.status == "MENUNGGU_KEPUTUSAN") "Menunggu keputusan"
                else "Ada kendala di laporan terakhir"
            return Hasil(MkStatusDomain.RISK, kalimatPertama(alasan), progres)
        }
        return Hasil(MkStatusDomain.ON, null, progres)
    }

    /** firstSentence di project-status.ts: rapikan spasi, potong di akhir kalimat, maks 88+"…". */
    private fun kalimatPertama(s: String): String {
        val t = s.replace(Regex("\\s+"), " ").trim()
        val potong = Regex("(?<=[.!?])\\s").split(t, limit = 2).first()
        return if (potong.length > 90) potong.substring(0, 88).trimEnd() + "…" else potong
    }
}
