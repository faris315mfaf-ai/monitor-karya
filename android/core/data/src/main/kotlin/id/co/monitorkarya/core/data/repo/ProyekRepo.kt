// Repositori proyek: tarik /api/projects (cakupan akun diputuskan server),
// simpan Room sebagai satu-satunya sumber tampilan (Rancangan §4 butir 1).
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.ProjectDao
import id.co.monitorkarya.core.data.db.ProjectEntity
import id.co.monitorkarya.core.domain.model.LaporanHarian
import id.co.monitorkarya.core.domain.status.StatusProyek
import id.co.monitorkarya.core.network.api.ProjectsApi
import id.co.monitorkarya.core.network.dto.ProjectDto
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

@Singleton
class ProyekRepo @Inject constructor(private val dao: ProjectDao) {

    /**
     * Tarik daftar proyek dari jaringan lalu simpan ke Room (map DTO ke entitas,
     * status dihitung StatusProyek = port project-status.ts). Berhalaman sampai
     * habis; baris yang tidak ikut tersegar dihapus supaya cermin setia.
     */
    suspend fun tarikDariJaringan(api: ProjectsApi): HasilBaca<Unit> {
        val tersinkronPada = System.currentTimeMillis()
        val semua = mutableListOf<ProjectDto>()
        var halaman = 1
        while (halaman <= MAKS_HALAMAN) {
            when (
                val hasil = bacaApi {
                    api.daftar(siklus = SIKLUS_AKTIF, halaman = halaman, ukuranHalaman = UKURAN_HALAMAN)
                }
            ) {
                is HasilBaca.Gagal -> return hasil
                is HasilBaca.Sukses -> {
                    val isi = hasil.data.items
                    semua += isi
                    if (isi.isEmpty() || semua.size >= hasil.data.total) break
                    halaman++
                }
            }
        }
        dao.simpan(semua.mapNotNull { it.keEntity(tersinkronPada) })
        dao.hapusTersinkronLama(tersinkronPada)
        return HasilBaca.Sukses(Unit)
    }

    /** Daftar proyek dalam cakupan akun (isi tabel hasil tarik) untuk layar PIC. */
    fun proyekPIC(): Flow<List<ProjectEntity>> = dao.pilihSemua()

    /** Satu proyek menurut id; null bila belum ada di cache. */
    fun proyek(id: String): Flow<ProjectEntity?> = dao.pilih(id)

    /** Id semua proyek tersimpan — dipakai SyncWorker untuk tarik laporan/tugas. */
    suspend fun idProyekTersimpan(): List<String> = dao.pilihSemua().first().map { it.id }

    private fun ProjectDto.keEntity(tersinkronPada: Long): ProjectEntity? {
        val tenggat = isoKeLocalDate(targetEndDate)
        val terakhir = latestReport?.let { laporan ->
            LaporanHarian(
                id = laporan.reportDate.orEmpty(),
                proyekId = id,
                tanggal = isoKeLocalDate(laporan.reportDate) ?: return null,
                status = laporan.status.orEmpty(),
                progresPct = laporan.progressPct,
                capaian = "",
                kendala = laporan.obstacle,
                terlambat = laporan.isLate,
            )
        }
        // Simpan kunci status lowercase ("on"|"risk"|…) sama seperti web.
        val status = StatusProyek
            .hitung(tenggat, terakhir, siklusHidup = lifecycle, perluEskalasi = latestReport?.needsEscalation ?: false)
            .name
            .lowercase()
        return ProjectEntity(
            id = id,
            code = code,
            name = name,
            phase = phase,
            lifecycle = lifecycle,
            entityName = entity?.name.orEmpty(),
            picName = picName,
            status = status,
            progress = terakhir?.progresPct ?: 0,
            targetEndDate = isoKeEpochMillis(targetEndDate),
            lastReportAt = isoKeEpochMillis(latestReport?.reportDate),
            divisionName = division?.name,
            tersinkronPada = tersinkronPada,
        )
    }

    private companion object {
        const val SIKLUS_AKTIF = "AKTIF"
        const val UKURAN_HALAMAN = 200 // satu halaman selebar mungkin; PIC sedikit proyek
        const val MAKS_HALAMAN = 20 // pengaman: 20 × 200 = 4000 proyek
    }
}
