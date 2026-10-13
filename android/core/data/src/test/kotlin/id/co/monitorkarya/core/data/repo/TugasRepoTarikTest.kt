package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.TaskDao
import id.co.monitorkarya.core.data.db.TaskEntity
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.TaskDto
import id.co.monitorkarya.core.network.dto.TaskMovedResponse
import id.co.monitorkarya.core.network.dto.TaskMovesRequest
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.dto.TaskSaveResponse
import id.co.monitorkarya.core.network.dto.TasksDayResponse
import id.co.monitorkarya.core.network.dto.TasksWeekResponse
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/**
 * Audit T12: penyegaran tugas satu proyek tidak boleh menghapus tugas proyek
 * lain / hari lain. SyncWorker menarik proyek satu per satu; versi lama
 * membersihkan SEMUA baris lebih tua dari "sekarang - 1 ms" sehingga tugas
 * proyek A (ditarik lebih awal di putaran yang sama) lenyap saat proyek B ditarik.
 */
class TugasRepoTarikTest {

    /** TaskDao di memori dengan semantik SQL yang sama dengan kueri Room. */
    private class FakeTaskDao : TaskDao {
        val baris = linkedMapOf<String, TaskEntity>()

        override suspend fun simpan(semua: List<TaskEntity>) {
            semua.forEach { baris[it.id] = it }
        }

        override suspend fun simpan(satu: TaskEntity) {
            baris[satu.id] = satu
        }

        override fun pilihPerProyek(proyekId: String): Flow<List<TaskEntity>> =
            flowOf(baris.values.filter { it.proyekId == proyekId })

        override suspend fun hapusTersinkronLama(sebelum: Long) {
            baris.values.removeAll { it.tersinkronPada < sebelum }
        }

        override suspend fun hapusTersinkronLamaHari(proyekId: String, tanggalKerja: Long, sebelum: Long) {
            baris.values.removeAll {
                it.proyekId == proyekId && it.tanggalKerja == tanggalKerja &&
                    it.cakupan == "HARIAN" && it.tersinkronPada < sebelum
            }
        }

        override suspend fun hapusSatu(id: String) {
            baris.remove(id)
        }
    }

    /** TasksApi yang menjawab GET harian dari peta (proyek -> daftar tugas hari itu). */
    private class FakeTasksApi(private val perProyek: Map<String, List<TaskDto>>) : TasksApi {
        override suspend fun perHari(projectId: String, tanggal: String?): Response<TasksDayResponse> =
            Response.success(TasksDayResponse(workDate = "", tasks = perProyek[projectId].orEmpty()))

        override suspend fun perMingguan(projectId: String, minggu: String): Response<TasksWeekResponse> =
            error("tidak dipakai")

        override suspend fun buat(body: TaskSaveRequest, kunciIdempotensi: String?): Response<TaskSaveResponse> = error("tidak dipakai")

        override suspend fun ubah(body: TaskSaveRequest, kunciIdempotensi: String?): Response<TaskSaveResponse> = error("tidak dipakai")

        override suspend fun pindah(body: TaskMovesRequest): Response<TaskMovedResponse> = error("tidak dipakai")

        override suspend fun hapus(id: String, konteks: String?, kunciIdempotensi: String?): Response<OkResponse> = error("tidak dipakai")
    }

    private val hari: LocalDate = LocalDate.of(2026, 10, 12)

    /** workDate server = tengah malam WIB sebagai instan UTC (17.00Z hari sebelumnya). */
    private fun dto(id: String, proyek: String, judul: String = "Tugas $id"): TaskDto = TaskDto(
        id = id,
        projectId = proyek,
        entityId = "e1",
        workDate = "2026-10-11T17:00:00.000Z",
        title = judul,
        status = "BELUM_MULAI",
        urgency = "SEDANG",
        scope = "HARIAN",
        createdAt = "2026-10-12T01:00:00.000Z",
        updatedAt = "2026-10-12T01:00:00.000Z",
    )

    @Test
    fun menarikProyekBTidakMenghapusTugasProyekA() = runBlocking {
        val dao = FakeTaskDao()
        val repo = TugasRepo(dao)
        val api = FakeTasksApi(
            mapOf(
                "pA" to listOf(dto("a1", "pA"), dto("a2", "pA")),
                "pB" to listOf(dto("b1", "pB")),
            ),
        )

        assertTrue(repo.tarik(api, "pA", hari) is HasilBaca.Sukses)
        // Jeda nyata antar-proyek (jaringan): proyek B ditarik sesudahnya.
        Thread.sleep(5)
        assertTrue(repo.tarik(api, "pB", hari) is HasilBaca.Sukses)

        assertEquals(setOf("a1", "a2", "b1"), dao.baris.keys)
    }

    @Test
    fun menarikUlangProyekMembuangTugasYangHilangDiServerSajaPadaLajurItu() = runBlocking {
        val dao = FakeTaskDao()
        val repo = TugasRepo(dao)
        val awal = FakeTasksApi(mapOf("pA" to listOf(dto("a1", "pA"), dto("a2", "pA")), "pB" to listOf(dto("b1", "pB"))))
        repo.tarik(awal, "pA", hari)
        repo.tarik(awal, "pB", hari)
        // Tugas hari lain milik pA (harus selamat) disimpan manual.
        val hariLain = dao.baris.getValue("a1").copy(
            id = "a-kemarin",
            tanggalKerja = Wib.keEpochMillis(hari.minusDays(1)),
        )
        dao.simpan(hariLain)
        Thread.sleep(5)

        // Server kini hanya mengembalikan a1 untuk pA: a2 dihapus di server.
        val sesudah = FakeTasksApi(mapOf("pA" to listOf(dto("a1", "pA", judul = "Judul baru"))))
        repo.tarik(sesudah, "pA", hari)

        assertEquals(setOf("a1", "b1", "a-kemarin"), dao.baris.keys)
        assertEquals("Judul baru", dao.baris.getValue("a1").judul)
    }

    @Test
    fun hariTanpaTugasDiServerMengosongkanLajurItuSaja() = runBlocking {
        val dao = FakeTaskDao()
        val repo = TugasRepo(dao)
        val awal = FakeTasksApi(mapOf("pA" to listOf(dto("a1", "pA")), "pB" to listOf(dto("b1", "pB"))))
        repo.tarik(awal, "pA", hari)
        repo.tarik(awal, "pB", hari)
        Thread.sleep(5)

        repo.tarik(FakeTasksApi(emptyMap()), "pA", hari)

        assertEquals(setOf("b1"), dao.baris.keys)
    }
}
