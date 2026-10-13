package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.MingguanButirDao
import id.co.monitorkarya.core.data.db.MingguanButirEntity
import id.co.monitorkarya.core.data.db.MingguanLaporanDao
import id.co.monitorkarya.core.data.db.MingguanLaporanEntity
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.WeeklyAksiRequest
import id.co.monitorkarya.core.network.dto.WeeklyAksiResponse
import id.co.monitorkarya.core.network.dto.WeeklyDivisiDto
import id.co.monitorkarya.core.network.dto.WeeklyEntityDto
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveRequest
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveResponse
import id.co.monitorkarya.core.network.dto.WeeklyMovesRequest
import id.co.monitorkarya.core.network.dto.WeeklyMovesResponse
import id.co.monitorkarya.core.network.dto.WeeklyPekanDto
import id.co.monitorkarya.core.network.dto.WeeklyReportHeadDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/**
 * Audit T12: papan mingguan (GET /api/weekly-input) menaruh isoYear/isoWeek di
 * objek `week`, bukan di akar respons. Versi lama membacanya dari akar sehingga
 * semua laporan hasil tarik papan tersimpan dengan isoTahun=0/isoMinggu=0
 * (urutan dan saringan per pekan di Room rusak).
 */
class MingguanRepoPapanTest {

    private class FakeLaporanDao : MingguanLaporanDao {
        val baris = linkedMapOf<String, MingguanLaporanEntity>()
        override suspend fun simpan(semua: List<MingguanLaporanEntity>) = semua.forEach { baris[it.id] = it }
        override suspend fun simpan(satu: MingguanLaporanEntity) {
            baris[satu.id] = satu
        }
        override fun pilihSemua(): Flow<List<MingguanLaporanEntity>> = flowOf(baris.values.toList())
        override fun pilih(id: String): Flow<MingguanLaporanEntity?> = flowOf(baris[id])
        override fun pilihPerDivisi(divisiId: String): Flow<List<MingguanLaporanEntity>> =
            flowOf(baris.values.filter { it.divisiId == divisiId })
        override suspend fun hapusTersinkronLama(sebelum: Long) {
            baris.values.removeAll { it.tersinkronPada < sebelum }
        }
    }

    private class FakeButirDao : MingguanButirDao {
        val baris = linkedMapOf<String, MingguanButirEntity>()
        override suspend fun simpan(semua: List<MingguanButirEntity>) = semua.forEach { baris[it.id] = it }
        override suspend fun simpan(satu: MingguanButirEntity) {
            baris[satu.id] = satu
        }
        override fun pilihPerLaporan(laporanId: String): Flow<List<MingguanButirEntity>> =
            flowOf(baris.values.filter { it.laporanMingguanId == laporanId })
        override suspend fun hapusYangLama(laporanId: String, pertahankan: List<String>) {
            baris.values.removeAll { it.laporanMingguanId == laporanId && it.id !in pertahankan }
        }
        override suspend fun hapusPerLaporan(laporanId: String) {
            baris.values.removeAll { it.laporanMingguanId == laporanId }
        }
    }

    private class ApiPapan(private val papan: WeeklyInputResponse) : WeeklyInputApi {
        override suspend fun papan(entityId: String?, week: String?): Response<WeeklyInputResponse> =
            Response.success(papan)
        override suspend fun simpanButir(body: WeeklyItemSaveRequest): Response<WeeklyItemSaveResponse> = error("x")
        override suspend fun pindahkanButir(body: WeeklyMovesRequest): Response<WeeklyMovesResponse> = error("x")
        override suspend fun hapusButir(itemId: String): Response<OkResponse> = error("x")
        override suspend fun aksi(body: WeeklyAksiRequest): Response<WeeklyAksiResponse> = error("x")
    }

    @Test
    fun tarikPapanMenyimpanIsoTahunDanMingguDariObjekWeek() = runBlocking {
        val papan = WeeklyInputResponse(
            week = WeeklyPekanDto(
                key = "2026-W42", isoYear = 2026, isoWeek = 42,
                start = "2026-10-11T17:00:00.000Z", end = "2026-10-17T17:00:00.000Z",
                handoverBy = "2026-10-15T10:00:00.000Z", lockAt = "2026-10-16T10:00:00.000Z",
            ),
            entityId = "e1",
            entities = listOf(WeeklyEntityDto("e1", "SRB", "PT Sarana Raya")),
            divisions = listOf(
                WeeklyDivisiDto(
                    id = "d1", name = "Divisi TI", type = "OPERASIONAL",
                    report = WeeklyReportHeadDto(id = "w1", statusHeader = "DRAFT"),
                ),
            ),
        )
        val laporanDao = FakeLaporanDao()
        val repo = MingguanRepo(laporanDao, FakeButirDao())

        assertTrue(repo.tarikPapan(ApiPapan(papan)) is HasilBaca.Sukses)

        val tersimpan = laporanDao.baris.getValue("w1")
        assertEquals(2026, tersimpan.isoTahun)
        assertEquals(42, tersimpan.isoMinggu)
        assertEquals("d1", tersimpan.divisiId)
        assertEquals("PT Sarana Raya", tersimpan.entitasNama)
    }
}
