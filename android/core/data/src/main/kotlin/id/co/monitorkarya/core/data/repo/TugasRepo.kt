// Repositori tugas harian: CRUD jujur daring lewat TasksApi (server memegang
// invarian beku 17.00), hasilnya dicerminkan ke Room untuk baca luring.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.TaskDao
import id.co.monitorkarya.core.data.db.TaskEntity
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.dto.TaskDto
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

@Singleton
class TugasRepo @Inject constructor(private val dao: TaskDao) {

    /** Tugas satu proyek dari Room, terbaru dulu (urutan DAO F0). */
    fun tugas(proyekId: String): Flow<List<TaskEntity>> = dao.pilihPerProyek(proyekId)

    /**
     * Tarik tugas satu proyek untuk satu hari kerja WIB dari /api/tasks
     * (endpoint mengembalikan himpunan lengkap hari itu), simpan ke Room, lalu
     * hapus baris hari itu yang tidak lagi ada di server (cermin setia per hari).
     */
    suspend fun tarik(api: TasksApi, proyekId: String, tanggal: LocalDate): HasilBaca<Unit> {
        val tersinkronPada = System.currentTimeMillis()
        // LocalDate.toString() = kunci ISO "YYYY-MM-DD" yang dibaca param date server.
        val hasil = bacaApi { api.perHari(projectId = proyekId, tanggal = tanggal.toString()) }
        return when (hasil) {
            is HasilBaca.Gagal -> hasil
            is HasilBaca.Sukses -> {
                val entitas = hasil.data.tasks.mapNotNull { it.keEntity(tersinkronPada) }
                dao.simpan(entitas)
                // Penyegaran penuh SATU lajur (proyek + hari): bersihkan baris lajur
                // ini yang tak tersentuh. Pembersihan global (ambang waktu saja)
                // menghapus tugas proyek lain yang ditarik lebih awal di putaran
                // SyncWorker yang sama.
                dao.hapusTersinkronLamaHari(proyekId, Wib.keEpochMillis(tanggal), tersinkronPada)
                HasilBaca.Sukses(Unit)
            }
        }
    }

    /**
     * Buat tugas (POST /api/tasks; badan TaskSaveRequest membawa projectId); jawaban server langsung dicerminkan ke Room.
     * [kunciIdempotensi] (gelombang E): kunci pesan outbox — ulangan dibalas tugas yang sama, bukan tugas ganda.
     */
    suspend fun buat(api: TasksApi, permintaan: TaskSaveRequest, kunciIdempotensi: String? = null): HasilKirim =
        tulisApi({ api.buat(permintaan, kunciIdempotensi) }, { simpanTask(it?.task) })

    /** Ubah tugas (PUT /api/tasks; badan TaskSaveRequest membawa id, subtask dikirim utuh dari formulir). */
    suspend fun ubah(api: TasksApi, permintaan: TaskSaveRequest, kunciIdempotensi: String? = null): HasilKirim =
        tulisApi({ api.ubah(permintaan, kunciIdempotensi) }, { simpanTask(it?.task) })

    /**
     * Hapus tugas (DELETE /api/tasks?id=); baris Room ikut dihapus saat sukses.
     * [mungkinSudahTerhapus] = percobaan sebelumnya ambigu → 404 dianggap selesai (lihat hapusApi).
     */
    suspend fun hapus(
        api: TasksApi,
        id: String,
        kunciIdempotensi: String? = null,
        mungkinSudahTerhapus: Boolean = false,
    ): HasilKirim =
        hapusApi(mungkinSudahTerhapus, { api.hapus(id = id, konteks = KONTEKS_HARIAN, kunciIdempotensi = kunciIdempotensi) }) {
            dao.hapusSatu(id)
        }

    private suspend fun simpanTask(dto: TaskDto?) {
        dto?.keEntity(System.currentTimeMillis())?.let { dao.simpan(it) }
    }

    private fun TaskDto.keEntity(tersinkronPada: Long): TaskEntity? {
        val tanggal = isoKeLocalDate(workDate) ?: return null
        return TaskEntity(
            id = id,
            proyekId = projectId,
            tanggalKerja = Wib.keEpochMillis(tanggal),
            judul = title,
            status = status,
            progressPct = progressPct,
            cakupan = scope,
            urutan = sortOrder,
            tersinkronPada = tersinkronPada,
        )
    }

    private companion object {
        const val KONTEKS_HARIAN = "HARIAN"
    }
}
