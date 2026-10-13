package id.co.monitorkarya.feature.ringkasangrup

import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.feature.ringkasangrup.data.AksiPengawasApi
import id.co.monitorkarya.feature.ringkasangrup.data.GrafikManajemenDto
import id.co.monitorkarya.feature.ringkasangrup.data.HalamanInsidenDto
import id.co.monitorkarya.feature.ringkasangrup.data.HalamanLaporanDto
import id.co.monitorkarya.feature.ringkasangrup.data.HasilIngatkanDivisiDto
import id.co.monitorkarya.feature.ringkasangrup.data.HasilIngatkanDto
import id.co.monitorkarya.feature.ringkasangrup.data.IngatkanDivisiRequest
import id.co.monitorkarya.feature.ringkasangrup.data.PetaKepatuhanDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupApi
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.TandaDibacaRequest
import id.co.monitorkarya.feature.ringkasangrup.data.TandaDibacaResponse
import id.co.monitorkarya.feature.ringkasangrup.data.TrenKpiDto
import id.co.monitorkarya.feature.ringkasangrup.logika.KeadaanMingguan
import id.co.monitorkarya.feature.ringkasangrup.logika.LogikaDirekturTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.OkHttpClient
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class RingkasanDirekturViewModelTest {

    private class RingkasanPalsu : RingkasanGrupApi {
        val laporanDiminta = mutableListOf<String>()
        override suspend fun ringkasan(): Response<RingkasanGrupDto> = Response.success(LogikaDirekturTest.ringkasan())
        override suspend fun laporanProyek(projectId: String, ukuran: Int): Response<HalamanLaporanDto> {
            laporanDiminta += projectId
            return Response.success(HalamanLaporanDto())
        }
        override suspend fun grafikManajemen(): Response<GrafikManajemenDto> = error("tidak dipakai")
        override suspend fun trenKpi(): Response<TrenKpiDto> = error("tidak dipakai")
        override suspend fun petaKepatuhan(): Response<PetaKepatuhanDto> = error("tidak dipakai")
        override suspend fun insidenTerlambat(ukuran: Int): Response<HalamanInsidenDto> = error("tidak dipakai")
    }

    private class AksiPalsu : AksiPengawasApi {
        val dibaca = mutableListOf<String>()
        val batal = mutableListOf<String>()
        val ingat = mutableListOf<IngatkanDivisiRequest>()
        var outcome = "TERKIRIM"
        var tolak = false
        var gerbangDibaca: CompletableDeferred<Unit>? = null

        override suspend fun tandaiDibaca(body: TandaDibacaRequest): Response<TandaDibacaResponse> {
            dibaca += body.weeklyReportId
            gerbangDibaca?.await()
            if (tolak) return Response.error(404, """{"error":"Laporan tidak ditemukan"}""".toResponseBody())
            return Response.success(TandaDibacaResponse(ok = true, readAt = "2026-10-13T03:00:00.000Z"))
        }

        override suspend fun batalDibaca(body: TandaDibacaRequest): Response<TandaDibacaResponse> {
            batal += body.weeklyReportId
            return Response.success(TandaDibacaResponse(ok = true))
        }

        override suspend fun ingatkanDivisi(body: IngatkanDivisiRequest): Response<HasilIngatkanDto> {
            ingat += body
            return Response.success(HasilIngatkanDto(sent = 1, results = listOf(HasilIngatkanDivisiDto(body.divisionId, outcome))))
        }
    }

    @Before
    fun siapkan() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun bersihkan() = Dispatchers.resetMain()

    @Test
    fun tandai_dibaca_lalu_urungkan_mengubah_keadaan_laporan() = runTest {
        val aksi = AksiPalsu()
        val vm = RingkasanDirekturViewModel(RingkasanPalsu(), aksi)
        vm.mulai()
        val dv = (vm.ui.value.ringkasan as Bagian.Siap).data.divisions.first()
        assertEquals(KeadaanMingguan.TERKIRIM, vm.ui.value.keadaan(dv))

        vm.bukaLaporanDivisi("div-1")
        vm.tandaiDibaca("div-1")
        assertEquals(listOf("wr-1"), aksi.dibaca)
        // E2E-2 BUG-04: sheet ditutup agar snackbar Urungkan tidak tertutup jendela sheet.
        assertNull(vm.ui.value.sheetDivisi)
        assertEquals(KeadaanMingguan.DIBACA, vm.ui.value.keadaan(dv))
        val pesan = vm.ui.value.pesan!!
        assertEquals("Laporan Divisi Teknologi ditandai sudah dibaca.", pesan.teks)
        assertEquals("div-1", pesan.urungkanDivisi)
        assertTrue(vm.ui.value.sibuk.isEmpty())

        vm.urungkanDibaca("div-1")
        assertEquals(listOf("wr-1"), aksi.batal)
        assertEquals(KeadaanMingguan.TERKIRIM, vm.ui.value.keadaan(dv))
    }

    @Test
    fun tanda_dibaca_ditolak_server_menjadi_pesan_tanpa_mengubah_keadaan() = runTest {
        val aksi = AksiPalsu().apply { tolak = true }
        val vm = RingkasanDirekturViewModel(RingkasanPalsu(), aksi)
        vm.mulai()
        vm.tandaiDibaca("div-1")
        val dv = (vm.ui.value.ringkasan as Bagian.Siap).data.divisions.first()
        assertEquals(KeadaanMingguan.TERKIRIM, vm.ui.value.keadaan(dv))
        assertEquals("Laporan tidak ditemukan", vm.ui.value.pesan!!.teks)
        assertNull(vm.ui.value.pesan!!.urungkanDivisi)
    }

    @Test
    fun ingatkan_mengirim_entitas_divisi_dan_minggu_laporan() = runTest {
        val aksi = AksiPalsu()
        val vm = RingkasanDirekturViewModel(RingkasanPalsu(), aksi)
        vm.mulai()
        vm.ingatkan("div-2")
        assertEquals(IngatkanDivisiRequest("ent-1", "div-2", "2026-W41"), aksi.ingat.single())
        assertTrue("div-2" in vm.ui.value.diingatkan)
        assertEquals("Pengingat terkirim ke kepala divisi yang belum melapor.", vm.ui.value.pesan!!.teks)

        // Divisi tanpa kepala: tidak dicatat terkirim.
        val aksi2 = AksiPalsu().apply { outcome = "TANPA_KEPALA" }
        val vm2 = RingkasanDirekturViewModel(RingkasanPalsu(), aksi2)
        vm2.mulai()
        vm2.ingatkan("div-2")
        assertFalse("div-2" in vm2.ui.value.diingatkan)
    }

    @Test
    fun saringan_dan_sheet_proyek_memuat_laporan_malas() = runTest {
        val ringkasan = RingkasanPalsu()
        val vm = RingkasanDirekturViewModel(ringkasan, AksiPalsu())
        vm.mulai()
        vm.pilihDivisi("div-1")
        assertEquals("div-1", vm.ui.value.divisiId)
        vm.bukaProyek("p-1")
        assertEquals(listOf("p-1"), ringkasan.laporanDiminta)
        assertTrue(vm.ui.value.laporanProyek is Bagian.Siap)
        vm.tutupProyek()
        assertNull(vm.ui.value.sheetProyek)
        vm.bukaLaporanDivisi("div-2")
        assertEquals("div-2", vm.ui.value.sheetDivisi)
    }

    @Test
    fun urungkan_tanda_baca_mengirim_DELETE_berbadan_json() {
        val server = MockWebServer()
        server.start()
        try {
            val api = buatApi(OkHttpClient(), server.url("/").toString(), AksiPengawasApi::class.java)
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            server.enqueue(MockResponse().setBody("""{"week":{"key":"2026-W41"},"sent":1,"unreported":1,"results":[{"divisionId":"div-2","outcome":"SUDAH_HARI_INI"}]}"""))
            runBlocking {
                assertTrue(api.batalDibaca(TandaDibacaRequest("wr-1")).isSuccessful)
                val hasil = api.ingatkanDivisi(IngatkanDivisiRequest("ent-1", "div-2", null)).body()!!
                assertEquals("SUDAH_HARI_INI", hasil.results.single().outcome)
            }
            val del = server.takeRequest()
            assertEquals("DELETE", del.method)
            assertEquals("/api/ringkasan/laporan-dibaca", del.path)
            assertEquals("""{"weeklyReportId":"wr-1"}""", del.body.readUtf8())
            val post = server.takeRequest()
            assertEquals("/api/notifications/remind", post.path)
            // week null tidak dikirim (server memakai minggu berjalan).
            assertEquals("""{"entityId":"ent-1","divisionId":"div-2"}""", post.body.readUtf8())
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun sibuk_per_divisi_aksi_lain_tidak_membuka_tombol_dan_ketuk_ganda_diabaikan() = runTest {
        val aksi = AksiPalsu()
        val gerbang = CompletableDeferred<Unit>()
        aksi.gerbangDibaca = gerbang
        val vm = RingkasanDirekturViewModel(RingkasanPalsu(), aksi)
        vm.mulai()
        vm.tandaiDibaca("div-1")
        // Ketuk ganda selagi berjalan: tidak mengirim permintaan kedua.
        vm.tandaiDibaca("div-1")
        assertEquals(1, aksi.dibaca.size)
        assertEquals(setOf("div-1"), vm.ui.value.sibuk)
        // Aksi divisi lain selesai lebih dulu: div-1 tetap sibuk.
        vm.ingatkan("div-2")
        assertEquals(setOf("div-1"), vm.ui.value.sibuk)
        gerbang.complete(Unit)
        assertTrue(vm.ui.value.sibuk.isEmpty())
    }
}
