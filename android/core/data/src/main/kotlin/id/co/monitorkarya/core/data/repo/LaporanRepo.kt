// Repositori laporan harian: baca dari Room, tarik /api/daily-reports per
// proyek, dan kirim lewat PUT /api/daily-input (DailyInputApi) secara jujur
// daring — kirim luring tidak diizinkan (kontrak T5-B2, Rancangan §4).
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.DailyReportDao
import id.co.monitorkarya.core.data.db.DailyReportEntity
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.api.DailyInputApi
import id.co.monitorkarya.core.network.api.DailyReportsApi
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.DailyReportRowDto
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

@Singleton
class LaporanRepo @Inject constructor(private val dao: DailyReportDao) {

    /** Riwayat laporan satu proyek dari Room (satu-satunya sumber tampilan). */
    fun laporan(proyekId: String): Flow<List<DailyReportEntity>> = dao.pilihPerProyek(proyekId)

    /**
     * Tarik laporan terbaru satu proyek dari /api/daily-reports lalu simpan ke
     * Room (upsert; riwayat lama tidak dihapus karena tarik berhalaman 14
     * terbaru saja). pageSize bawaan 14 ≈ dua pekan kerja.
     */
    suspend fun tarik(api: DailyReportsApi, proyekId: String, pageSize: Int = PAGE_SIZE_BAWAAN): HasilBaca<Unit> {
        val tersinkronPada = System.currentTimeMillis()
        val hasil = bacaApi { api.daftar(projectId = proyekId, halaman = 1, ukuranHalaman = pageSize) }
        return when (hasil) {
            is HasilBaca.Gagal -> hasil
            is HasilBaca.Sukses -> {
                dao.simpan(hasil.data.items.mapNotNull { it.keEntity(tersinkronPada) })
                HasilBaca.Sukses(Unit)
            }
        }
    }

    /**
     * Kirim (simpan draf atau kirim final) lewat DailyInputApi langsung.
     * Jujur daring: jawaban server final; saat luring balik [HasilKirim.Luring]
     * dan TIDAK ada yang ditulis lokal sebagai "terkirim". Baris Room dibiarkan
     * apa adanya — penyegaran terjadi lewat [tarik] (SyncWorker atau tarik ulang).
     */
    suspend fun kirim(api: DailyInputApi, permintaan: DailyInputRequest): HasilKirim =
        tulisApi({ api.simpan(permintaan) }) { /* tidak ada yang ditimpa lokal */ }

    private fun DailyReportRowDto.keEntity(tersinkronPada: Long): DailyReportEntity? {
        // Kolom tanggal kanonik: epoch millis tengah malam WIB (Wib.keEpochMillis).
        val tanggal = isoKeLocalDate(reportDate) ?: return null
        return DailyReportEntity(
            id = id,
            proyekId = projectId,
            tanggal = Wib.keEpochMillis(tanggal),
            status = status.orEmpty(),
            progressPct = progressPct,
            capaian = achievementToday.orEmpty(),
            kendala = obstacle,
            dikirimPada = isoKeEpochMillis(submittedAt),
            diteruskanPada = isoKeEpochMillis(forwardedAt),
            terlambat = isLate,
            jumlahBukti = evidenceCount,
            tersinkronPada = tersinkronPada,
        )
    }

    private companion object {
        const val PAGE_SIZE_BAWAAN = 14
    }
}
