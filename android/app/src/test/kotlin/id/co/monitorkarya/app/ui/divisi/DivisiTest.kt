package id.co.monitorkarya.app.ui.divisi

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.api.WeeklyReportsApi
import id.co.monitorkarya.core.network.dto.WeeklyReportsListResponse
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

/**
 * Tab Divisi (B1) terhadap bentuk GET /api/weekly-reports sebenarnya
 * (src/app/api/weekly-reports/route.ts: findMany include division{id,name},
 * entity{id,name,code,region}, approvedBy{id,name,email}, items include
 * aspectCategory/priority; summary {waiting, late}).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DivisiTest {

    companion object {
        val JSON_ARSIP = """
        {"items":[{"id":"wr-1","divisionId":"div-1","entityId":"ent-1","isoYear":2026,"isoWeek":41,
          "periodStart":"2026-10-04T17:00:00.000Z","periodEnd":"2026-10-11T16:59:59.999Z",
          "statusHeader":"MENUNGGU_PERSETUJUAN","submittedById":"u-1","submittedAt":"2026-10-08T08:00:00.000Z",
          "forwardedById":null,"forwardedAt":null,"approvedById":null,"approvedAt":null,"approvalHash":null,
          "isLocked":false,"lockedAt":null,"isLate":true,"createdAt":"2026-10-05T01:00:00.000Z","updatedAt":"2026-10-08T08:00:00.000Z",
          "division":{"id":"div-1","name":"Teknologi"},
          "entity":{"id":"ent-1","name":"PT Medcreatix","code":"MDC","region":null},
          "approvedBy":null,
          "items":[
            {"id":"it-1","weeklyReportId":"wr-1","aspectCategoryId":"asp-1","workItem":"Migrasi server",
             "targetOutput":"Server baru aktif","picName":"Rani","picTitle":"Engineer","targetDate":"2026-10-10T00:00:00.000Z",
             "status":"SELESAI","progressPct":100,"achievementThisWeek":"Selesai dipindah","obstacleFollowUp":null,
             "priorityId":"pr-1","needsEscalation":false,"evidenceCount":2,"tags":[],"carriedOverFromId":null,
             "workDate":"2026-10-06T17:00:00.000Z","position":0,"followUp":null,
             "createdAt":"2026-10-05T01:00:00.000Z","updatedAt":"2026-10-07T01:00:00.000Z",
             "aspectCategory":{"id":"asp-1","code":"SYS","name":"Sistem"},
             "priority":{"id":"pr-1","code":"TINGGI","name":"Tinggi","weight":3}},
            {"id":"it-2","weeklyReportId":"wr-1","aspectCategoryId":"asp-2","workItem":"Audit lisensi",
             "targetOutput":"","picName":"Budi","picTitle":"","targetDate":null,
             "status":"TERKENDALA","progressPct":40,"achievementThisWeek":"","obstacleFollowUp":"Menunggu vendor",
             "priorityId":"pr-2","needsEscalation":true,"evidenceCount":0,"tags":["vendor"],"carriedOverFromId":null,
             "workDate":null,"position":1,"followUp":null,
             "createdAt":"2026-10-05T01:00:00.000Z","updatedAt":"2026-10-07T01:00:00.000Z",
             "aspectCategory":{"id":"asp-2","code":"XYZ","name":"Lainnya"},
             "priority":{"id":"pr-2","code":"SEDANG","name":"Sedang","weight":2}}
          ]}],
         "total":23,"page":1,"pageSize":10,"summary":{"waiting":1,"late":4}}
        """.trimIndent()
    }

    @Test
    fun arsip_terdekode_dari_bentuk_route() {
        val d = mkJson.decodeFromString(WeeklyReportsListResponse.serializer(), JSON_ARSIP)
        assertEquals(23, d.total)
        assertEquals(4, d.summary.late)
        val r = d.items.single()
        assertEquals("Teknologi", r.division.name)
        assertNull(r.entity.region)
        assertTrue(r.isLate)
        assertEquals(2, r.items.size)
        assertEquals("SYS", r.items[0].aspectCategory.code)
        assertEquals("Menunggu vendor", r.items[1].obstacleFollowUp)
    }

    @Test
    fun kalimat_dan_rincian_arsip() {
        assertEquals("Belum ada laporan mingguan divisi.", jawabanArsip(0, tersaring = false))
        assertEquals("Tidak ada laporan mingguan dengan saringan ini.", jawabanArsip(0, tersaring = true))
        assertEquals("1.234 laporan mingguan divisi tercatat.", jawabanArsip(1234, tersaring = false))
        assertEquals("3 laporan mingguan divisi cocok dengan saringan.", jawabanArsip(3, tersaring = true))
        assertEquals("1 menunggu persetujuan, 4 terlambat.", pendukungArsip(1, 4, adaLaporan = true))
        assertEquals("Ketuk laporan untuk membaca butir, capaian, dan kendalanya.", pendukungArsip(0, 0, adaLaporan = true))
        assertNull(pendukungArsip(0, 0, adaLaporan = false))
        assertEquals(3, jumlahHalaman(23, 10))
        assertEquals(1, jumlahHalaman(0, 10))

        val items = mkJson.decodeFromString(WeeklyReportsListResponse.serializer(), JSON_ARSIP).items.single().items
        assertEquals("1 selesai · 1 terkendala", rincianButir(items))
        assertEquals("Sistem", labelAspek("SYS", "Sistem"))
        assertEquals("Lainnya", labelAspek("XYZ", "Lainnya"))
        assertEquals(MkStatus.LATE to "Tinggi", lencanaPrioritas("TINGGI", "Tinggi"))
        assertEquals("5 Okt", tanggalPendek("2026-10-04T17:00:00.000Z"))
        assertEquals("11 Oktober 2026", tanggalSedang("2026-10-11T16:59:59.999Z"))
    }

    @Test
    fun mode_layar_mengikuti_kapabilitas_weekly_input() {
        assertTrue(bolehIsiMingguan(Peran.ADMIN_PT))
        assertTrue(bolehIsiMingguan(Peran.TI))
        assertTrue(bolehIsiMingguan(Peran.SUPERADMIN))
        for (p in listOf(Peran.DIREKTUR_ENTITAS, Peran.DIREKTUR_SDM_GA, Peran.MANAJEMEN, Peran.AUDITOR, Peran.PIC_PROYEK)) {
            assertFalse(p.name, bolehIsiMingguan(p))
        }
    }

    // ------------------------------------------------------------------
    // ViewModel
    // ------------------------------------------------------------------

    private class ApiPalsu : WeeklyReportsApi {
        data class Panggilan(val page: Int?, val pageSize: Int?, val statusHeader: String?, val search: String?)

        val panggilan = mutableListOf<Panggilan>()
        var gagal = false
        var galat500 = false

        override suspend fun daftar(
            page: Int?,
            pageSize: Int?,
            entityId: String?,
            statusHeader: String?,
            search: String?,
            isoYear: Int?,
            isoWeek: Int?,
        ): Response<WeeklyReportsListResponse> {
            panggilan += Panggilan(page, pageSize, statusHeader, search)
            if (gagal) throw IOException("putus")
            if (galat500) return Response.error(500, """{"error":"Laporan mingguan belum termuat"}""".toResponseBody())
            return Response.success(mkJson.decodeFromString(WeeklyReportsListResponse.serializer(), JSON_ARSIP))
        }
    }

    private val penjadwal = StandardTestDispatcher()

    @Before
    fun siapkan() = Dispatchers.setMain(penjadwal)

    @After
    fun bersihkan() = Dispatchers.resetMain()

    @Test
    fun vm_memuat_halaman_10_lalu_saringan_cari_dan_halaman() = runTest(penjadwal) {
        val api = ApiPalsu()
        val vm = DivisiViewModel(api)
        advanceUntilIdle()
        assertEquals(ApiPalsu.Panggilan(1, 10, null, null), api.panggilan.last())
        assertTrue(vm.ui.value.data is ArsipData.Siap)

        vm.pilihStatus("DISETUJUI")
        advanceUntilIdle()
        assertEquals(ApiPalsu.Panggilan(1, 10, "DISETUJUI", null), api.panggilan.last())

        // Ketik beruntun: hanya kata terakhir yang dikirim (jeda 350 ms), dipangkas.
        vm.ubahCari("Tek")
        vm.ubahCari("Teknologi ")
        advanceUntilIdle()
        assertEquals(ApiPalsu.Panggilan(1, 10, "DISETUJUI", "Teknologi"), api.panggilan.last())
        assertEquals(3, api.panggilan.size)
        assertTrue(vm.ui.value.tersaring)

        vm.halamanBerikutnya()
        advanceUntilIdle()
        assertEquals(2, api.panggilan.last().page)
        vm.halamanSebelumnya()
        advanceUntilIdle()
        assertEquals(1, api.panggilan.last().page)

        vm.hapusSaringan()
        advanceUntilIdle()
        assertEquals(ApiPalsu.Panggilan(1, 10, null, null), api.panggilan.last())
        assertFalse(vm.ui.value.tersaring)

        vm.buka("wr-1")
        assertEquals("wr-1", vm.ui.value.detailId)
        vm.tutup()
        assertNull(vm.ui.value.detailId)
    }

    @Test
    fun vm_galat_server_dan_jaringan_jadi_pesan() = runTest(penjadwal) {
        val api = ApiPalsu().apply { galat500 = true }
        val vm = DivisiViewModel(api)
        advanceUntilIdle()
        assertEquals("Laporan mingguan belum termuat", (vm.ui.value.data as ArsipData.Galat).pesan)

        api.galat500 = false
        api.gagal = true
        vm.ulang()
        advanceUntilIdle()
        assertTrue((vm.ui.value.data as ArsipData.Galat).pesan.contains("luring"))
    }
}
