package id.co.monitorkarya.feature.pesan

import id.co.monitorkarya.core.data.repo.KotakMasukRepo
import id.co.monitorkarya.core.network.api.NotificationsApi
import id.co.monitorkarya.core.network.dto.NotificationListResponse
import id.co.monitorkarya.core.network.dto.NotificationsInboxResponse
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import id.co.monitorkarya.core.network.dto.TandaiBacaResponse
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.pesan.data.DtoPesanTest
import id.co.monitorkarya.feature.pesan.logika.Saring
import java.io.IOException
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class PesanViewModelTest {

    /** Server palsu yang menyimpan status baca seperti route asli (NotificationsApi bersama, D1). */
    private class ApiPalsu : NotificationsApi {
        var data: NotificationsInboxResponse =
            mkJson.decodeFromString(NotificationsInboxResponse.serializer(), DtoPesanTest.JSON_KOTAK)
        var gagalMuat = false
        var tandaiDitolak = false
        val permintaanTandai = mutableListOf<TandaiBacaRequest>()

        var jumlahMuat = 0

        override suspend fun kotakMasuk(kotak: String): Response<NotificationsInboxResponse> {
            jumlahMuat++
            if (gagalMuat) throw IOException("putus")
            return Response.success(data)
        }

        override suspend fun riwayat(
            halaman: Int?,
            ukuranHalaman: Int?,
            status: String?,
            kanal: String?,
            template: String?,
        ): Response<NotificationListResponse> = error("tidak dipakai")

        override suspend fun tandaiBaca(body: TandaiBacaRequest): Response<TandaiBacaResponse> {
            permintaanTandai += body
            if (tandaiDitolak) {
                return Response.error(422, """{"error":"Tidak ada notifikasi yang ditandai"}""".toResponseBody())
            }
            var n = 0
            data = data.copy(
                items = data.items.map {
                    if (it.readAt == null && (body.all || body.ids.contains(it.id))) {
                        n++
                        it.copy(readAt = "2026-10-13T03:00:00.000Z")
                    } else {
                        it
                    }
                },
            )
            data = data.copy(unread = data.items.count { it.readAt == null })
            return Response.success(TandaiBacaResponse(ok = true, marked = n))
        }
    }

    private val api = ApiPalsu()
    private val repo = KotakMasukRepo(api)

    @Before
    fun siapkan() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun bersihkan() = Dispatchers.resetMain()

    @Test
    fun muat_awal_mengisi_data_dan_lencana() = runTest {
        val vm = PesanViewModel(repo)
        val ui = vm.ui.value
        assertFalse(ui.memuat)
        assertEquals(2, ui.belumDibaca)
        assertEquals(2, repo.belumDibaca.value)
        vm.saring(Saring.BELUM)
        assertEquals(listOf("n1", "n2"), vm.ui.value.tampil.map { it.id })
    }

    @Test
    fun buka_pesan_belum_dibaca_menandai_lalu_lencana_turun() = runTest {
        val vm = PesanViewModel(repo)
        val n1 = vm.ui.value.data!!.items.first()
        vm.buka(n1)
        assertEquals(listOf(TandaiBacaRequest(ids = listOf("n1"))), api.permintaanTandai)
        val ui = vm.ui.value
        assertEquals("n1", ui.terbuka?.id)
        assertTrue(ui.terbuka!!.dibaca)
        assertEquals(1, ui.belumDibaca)
        assertEquals(1, repo.belumDibaca.value)
        vm.tutup()
        assertNull(vm.ui.value.terbuka)
    }

    @Test
    fun buka_pesan_sudah_dibaca_tidak_patch() = runTest {
        val vm = PesanViewModel(repo)
        vm.buka(vm.ui.value.data!!.items[2])
        assertTrue(api.permintaanTandai.isEmpty())
        assertEquals("n3", vm.ui.value.terbukaId)
    }

    @Test
    fun tandai_gagal_tetap_membuka_detail_dan_snackbar() = runTest {
        api.tandaiDitolak = true
        val vm = PesanViewModel(repo)
        vm.buka(vm.ui.value.data!!.items.first())
        val ui = vm.ui.value
        assertEquals("n1", ui.terbukaId)
        assertEquals("Tidak ada notifikasi yang ditandai", ui.notifikasi?.pesan)
        assertEquals(2, ui.belumDibaca)
        vm.notifikasiTampil()
        assertNull(vm.ui.value.notifikasi)
    }

    @Test
    fun tandai_semua_mengirim_all_true() = runTest {
        val vm = PesanViewModel(repo)
        vm.tandaiSemua()
        assertEquals(TandaiBacaRequest(all = true), api.permintaanTandai.single())
        assertEquals(0, vm.ui.value.belumDibaca)
        assertFalse(vm.ui.value.menandaiSemua)
        assertEquals(0, repo.belumDibaca.value)
    }

    @Test
    fun galat_muat_pertama_lalu_muat_ulang_gagal_mempertahankan_data() = runTest {
        api.gagalMuat = true
        val vm = PesanViewModel(repo)
        assertNotNull(vm.ui.value.galat)
        assertNull(vm.ui.value.data)

        api.gagalMuat = false
        vm.muat()
        assertNull(vm.ui.value.galat)
        assertNotNull(vm.ui.value.data)

        api.gagalMuat = true
        vm.muat()
        assertNotNull(vm.ui.value.data)
        assertNotNull(vm.ui.value.notifikasi)
        assertFalse(vm.ui.value.menyegarkan)
    }

    @Test
    fun ikon_membaca_jumlah_dari_repo_bersama() = runTest {
        val ikon = PesanIkonViewModel(repo)
        assertEquals(0, ikon.belumDibaca.value)
        ikon.segarkan()
        assertEquals(2, ikon.belumDibaca.value)
        val vm = PesanViewModel(repo)
        vm.tandaiSemua()
        assertEquals(0, ikon.belumDibaca.value)
    }

    // ------------------------------------------------------------ C1 regresi

    @Test
    fun c1_s3_dibukaUlangMenyegarkanDaftar() = runTest {
        val vm = PesanViewModel(repo)
        assertEquals(1, api.jumlahMuat)
        // Pembukaan pertama: init sudah memuat, tidak menarik dua kali.
        vm.dibuka()
        assertEquals(1, api.jumlahMuat)
        // Dibuka lagi nanti: daftar disegarkan.
        vm.dibuka()
        assertEquals(2, api.jumlahMuat)
    }

    @Test
    fun c1_r8_sesiBaruTidakMewarisiLencanaLama() = runTest {
        PesanViewModel(repo)
        assertEquals(2, repo.belumDibaca.value)
        // Entri beranda baru (masuk ulang) membuat PesanIkonViewModel baru.
        PesanIkonViewModel(repo)
        assertEquals(0, repo.belumDibaca.value)
    }
}
