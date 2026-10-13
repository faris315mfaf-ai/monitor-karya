package id.co.monitorkarya.feature.ringkasangrup

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.ringkasangrup.data.DtoRingkasanGrupTest
import id.co.monitorkarya.feature.ringkasangrup.data.GrafikManajemenDto
import id.co.monitorkarya.feature.ringkasangrup.data.HalamanInsidenDto
import id.co.monitorkarya.feature.ringkasangrup.data.HalamanLaporanDto
import id.co.monitorkarya.feature.ringkasangrup.data.PetaKepatuhanDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupApi
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.TrenKpiDto
import id.co.monitorkarya.feature.ringkasangrup.logika.MetrikKpi
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
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

@OptIn(ExperimentalCoroutinesApi::class)
class RingkasanGrupViewModelTest {

    /** API palsu: tiap rute bisa disetel sukses/403/galat jaringan. */
    private class ApiPalsu : RingkasanGrupApi {
        var panggilRingkasan = 0
        var grafikDitolak = false
        var petaJaringanGagal = false
        var panggilTrenKpi = 0
        var gerbangRingkasan: CompletableDeferred<Unit>? = null
        var ringkasanGagalSekali = false
        val laporanDiminta = mutableListOf<String>()

        override suspend fun ringkasan(): Response<RingkasanGrupDto> {
            panggilRingkasan++
            val gagal = ringkasanGagalSekali.also { ringkasanGagalSekali = false }
            gerbangRingkasan?.let { g -> gerbangRingkasan = null; g.await() }
            if (gagal) return Response.error(504, """{"error":"Waktu habis"}""".toResponseBody())
            return Response.success(mkJson.decodeFromString(RingkasanGrupDto.serializer(), DtoRingkasanGrupTest.JSON_RINGKASAN))
        }

        override suspend fun laporanProyek(projectId: String, ukuran: Int): Response<HalamanLaporanDto> {
            laporanDiminta += projectId
            return Response.success(mkJson.decodeFromString(HalamanLaporanDto.serializer(), DtoRingkasanGrupTest.JSON_LAPORAN))
        }

        override suspend fun grafikManajemen(): Response<GrafikManajemenDto> =
            if (grafikDitolak) {
                Response.error(403, """{"error":"Modul ini hanya untuk peran pemantau."}""".toResponseBody())
            } else {
                Response.success(mkJson.decodeFromString(GrafikManajemenDto.serializer(), DtoRingkasanGrupTest.JSON_GRAFIK))
            }

        override suspend fun trenKpi(): Response<TrenKpiDto> {
            panggilTrenKpi++
            return Response.error(500, """{"error":"Tren KPI belum termuat. Coba lagi."}""".toResponseBody())
        }

        override suspend fun petaKepatuhan(): Response<PetaKepatuhanDto> {
            if (petaJaringanGagal) throw IOException("putus")
            return Response.success(PetaKepatuhanDto())
        }

        override suspend fun insidenTerlambat(ukuran: Int): Response<HalamanInsidenDto> =
            Response.success(HalamanInsidenDto())
    }

    private val api = ApiPalsu()

    @Before
    fun siapkan() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun bersihkan() = Dispatchers.resetMain()

    @Test
    fun peran_pemantau_memuat_semua_bagian_dan_galat_tiap_bagian_terpisah() = runTest {
        api.grafikDitolak = true
        api.petaJaringanGagal = true
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.MANAJEMEN)
        val ui = vm.ui.value
        assertTrue(ui.pemantau)
        assertTrue(ui.ringkasan is Bagian.Siap)
        val ditolak = ui.grafik as Bagian.Ditolak
        assertEquals("Modul ini hanya untuk peran pemantau.", ditolak.pesan)
        // Tren mengikuti management-charts (sumber web): 403 grafik → tren ikut Ditolak.
        assertEquals("Modul ini hanya untuk peran pemantau.", (ui.tren as Bagian.Ditolak).pesan)
        assertEquals(0, api.panggilTrenKpi)
        assertTrue((ui.peta as Bagian.Galat).pesan.contains("luring"))
        assertTrue(ui.insiden is Bagian.Siap)
    }

    @Test
    fun peran_pelaksana_tidak_memuat() = runTest {
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.PIC_PROYEK)
        assertFalse(vm.ui.value.pemantau)
        assertEquals(0, api.panggilRingkasan)
        vm.muatUlang()
        assertEquals(0, api.panggilRingkasan)
    }

    @Test
    fun mulai_dua_kali_dengan_peran_sama_hanya_memuat_sekali() = runTest {
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.AUDITOR)
        vm.mulai(Peran.AUDITOR)
        assertEquals(1, api.panggilRingkasan)
        vm.muatUlang()
        assertEquals(2, api.panggilRingkasan)
    }

    @Test
    fun drilldown_perusahaan_proyek_kembali_tutup() = runTest {
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.DIREKTUR_SDM_GA)
        vm.bukaPerusahaan("ent-1")
        assertEquals(SheetDrill("ent-1"), vm.ui.value.sheet)

        vm.bukaProyek("prj-1")
        assertEquals(SheetDrill("ent-1", "prj-1"), vm.ui.value.sheet)
        assertEquals(listOf("prj-1"), api.laporanDiminta)
        val laporan = vm.ui.value.laporanProyek as Bagian.Siap
        assertEquals(2, laporan.data.size)

        vm.kembali()
        assertEquals(SheetDrill("ent-1"), vm.ui.value.sheet)
        vm.kembali()
        assertNull(vm.ui.value.sheet)

        // Buka proyek tanpa perusahaan terbuka diabaikan.
        vm.bukaProyek("prj-2")
        assertNull(vm.ui.value.sheet)
        assertEquals(1, api.laporanDiminta.size)
    }

    @Test
    fun pilihan_grafik_tersimpan() = runTest {
        val vm = RingkasanGrupViewModel(api)
        vm.pilihMetrik(MetrikKpi.BUKTI)
        vm.pilihTitikTren(2)
        vm.pilihBatangMinggu(5)
        val ui = vm.ui.value
        assertEquals(MetrikKpi.BUKTI, ui.metrik)
        assertEquals(2, ui.titikTren)
        assertEquals(5, ui.batangMinggu)
    }

    @Test
    fun ambil_respons_sukses_tanpa_badan_menjadi_galat() = runTest {
        val h = RingkasanGrupViewModel.ambil<RingkasanGrupDto> { Response.success(null) }
        assertTrue(h is Bagian.Galat)
        val h401 = RingkasanGrupViewModel.ambil<RingkasanGrupDto> {
            Response.error(401, """{"error":"Sesi berakhir"}""".toResponseBody())
        }
        assertEquals("Sesi berakhir", (h401 as Bagian.Galat).pesan)
        val h422 = RingkasanGrupViewModel.ambil<RingkasanGrupDto> {
            Response.error(422, """{"error":"Parameter tidak valid"}""".toResponseBody())
        }
        assertEquals("Parameter tidak valid", (h422 as Bagian.Galat).pesan)
    }

    @Test
    fun tren_kpi_diturunkan_dari_trend_management_charts() = runTest {
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.MANAJEMEN)
        val tren = (vm.ui.value.tren as Bagian.Siap).data.months
        assertEquals(1, tren.size)
        assertEquals("Okt 26", tren.single().label)
        assertEquals(72.5, tren.single().avgCompliance, 0.0)
        assertEquals(80.0, tren.single().avgOnTime, 0.0)
        assertEquals(70.0, tren.single().avgWeeklyCompleteness, 0.0)
        assertEquals(66.0, tren.single().avgEvidenceCompleteness, 0.0)
        assertEquals(1, tren.single().totalEntities)
        assertEquals(0, api.panggilTrenKpi)
    }

    @Test
    fun e2e3_b9_satu_muat_ulang_satu_get_ringkasan_walau_bagian_lain_selesai_lebih_dulu() = runTest {
        // Ringkasan tertahan; grafik/peta/insiden selesai lebih dulu dan memperbarui _ui.
        // Dulu panggilan jaringan berada di dalam _ui.update { } (loop CAS) sehingga
        // diulang setiap kali state berubah di tengah jalan.
        val gerbang = CompletableDeferred<Unit>()
        api.gerbangRingkasan = gerbang
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.SUPERADMIN)
        assertTrue(vm.ui.value.insiden is Bagian.Siap)
        gerbang.complete(Unit)
        assertTrue(vm.ui.value.ringkasan is Bagian.Siap)
        assertEquals(1, api.panggilRingkasan)
    }

    @Test
    fun muat_ulang_membatalkan_muat_lama_sehingga_respons_basi_tidak_menimpa() = runTest {
        // Muat pertama tertahan lalu berakhir galat (timeout); muat ulang kedua sukses lebih dulu.
        val gerbang = CompletableDeferred<Unit>()
        api.gerbangRingkasan = gerbang
        api.ringkasanGagalSekali = true
        val vm = RingkasanGrupViewModel(api)
        vm.mulai(Peran.MANAJEMEN)
        assertEquals(Bagian.Memuat, vm.ui.value.ringkasan)
        vm.muatUlang()
        assertTrue(vm.ui.value.ringkasan is Bagian.Siap)
        gerbang.complete(Unit)
        // Muat pertama sudah dibatalkan: galatnya tidak menimpa hasil Siap.
        assertTrue(vm.ui.value.ringkasan is Bagian.Siap)
    }
}
