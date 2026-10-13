package id.co.monitorkarya.feature.notifikasi

import id.co.monitorkarya.core.data.repo.KotakMasukRepo
import id.co.monitorkarya.core.network.api.NotificationsApi
import id.co.monitorkarya.core.network.dto.InboxItemDto
import id.co.monitorkarya.core.network.dto.NotificationListResponse
import id.co.monitorkarya.core.network.dto.NotificationsInboxResponse
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import id.co.monitorkarya.core.network.dto.TandaiBacaResponse
import java.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
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
 * Lonceng notifikasi (agen A1): logika murni + ViewModel dengan API palsu.
 * Bentuk data mengikuti src/app/api/notifications/route.ts (inbox=1 → {unread,
 * items[{id, template, title, body, tab, createdAt, readAt}]}; PATCH {ids ≤200}
 * atau {all:true}).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotifikasiTest {

    private class ApiPalsu(var inbox: NotificationsInboxResponse, var patchGagal: Boolean = false) : NotificationsApi {
        val dikirim = mutableListOf<TandaiBacaRequest>()
        var jumlahMuat = 0

        /** Bila diisi, GET menunggu gerbang ini lalu mengembalikan [inbox] saat GET DIMULAI (respons basi). */
        var gerbang: CompletableDeferred<Unit>? = null
        var badanKosong = false

        override suspend fun kotakMasuk(kotak: String): Response<NotificationsInboxResponse> {
            jumlahMuat++
            if (badanKosong) return Response.success(null)
            val potret = inbox
            gerbang?.await()
            return Response.success(potret)
        }

        override suspend fun riwayat(
            halaman: Int?,
            ukuranHalaman: Int?,
            status: String?,
            kanal: String?,
            template: String?,
        ): Response<NotificationListResponse> = error("tidak dipakai")

        override suspend fun tandaiBaca(body: TandaiBacaRequest): Response<TandaiBacaResponse> {
            dikirim += body
            return if (patchGagal) {
                Response.error(500, """{"error":"x"}""".toResponseBody("application/json".toMediaType()))
            } else {
                Response.success(TandaiBacaResponse(ok = true, marked = body.ids.size))
            }
        }
    }

    private fun item(id: String, tab: String? = null, dibaca: Boolean = false) = InboxItemDto(
        id = id,
        template = "PIC_REMINDER",
        title = "Laporan harian belum dikirim",
        body = "Kirim sebelum 17.00",
        tab = tab,
        createdAt = "2026-10-13T05:00:00.000Z",
        readAt = if (dibaca) "2026-10-13T06:00:00.000Z" else null,
    )

    @Before
    fun siapkan() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun bereskan() {
        Dispatchers.resetMain()
    }

    // ------------------------------------------------------------ murni

    @Test
    fun petaTabWebKeTabAndroid() {
        assertEquals("MEJA_KERJA", tujuanTab("work-desk"))
        assertEquals("RINGKASAN", tujuanTab("dashboard"))
        assertEquals("CAPAIAN_MINGGUAN", tujuanTab("weekly-input"))
        assertEquals("PERSETUJUAN", tujuanTab("approvals"))
        assertEquals("LAPORAN_HARIAN", tujuanTab("daily-input"))
        assertNull(tujuanTab(null))
        assertNull(tujuanTab("pesan"))
        // D1: Statistik kini TabId biasa.
        assertEquals("STATISTIK", tujuanTab("statistik"))
        assertNull(tujuanTab("tak-dikenal"))
    }

    @Test
    fun lencanaDanLabel() {
        assertNull(teksLencana(0))
        assertEquals("3", teksLencana(3))
        assertEquals("9+", teksLencana(12))
        assertEquals("Notifikasi", labelLonceng(0))
        assertEquals("Notifikasi, 2 belum dibaca", labelLonceng(2))
    }

    @Test
    fun potonganIdsMaksimal200() {
        val ids = (1..450).map { "n-$it" } + "n-1"
        val potong = potongIds(ids)
        assertEquals(listOf(200, 200, 50), potong.map { it.size })
    }

    @Test
    fun waktuRelatifBahasaIndonesia() {
        val kini = Instant.parse("2026-10-13T10:00:00Z")
        assertEquals("baru saja", waktuRelatif("2026-10-13T09:59:30Z", kini))
        assertEquals("5 menit lalu", waktuRelatif("2026-10-13T09:55:00Z", kini))
        assertEquals("3 jam lalu", waktuRelatif("2026-10-13T07:00:00Z", kini))
        assertEquals("2 hari lalu", waktuRelatif("2026-10-11T09:00:00Z", kini))
        assertEquals("1 Okt 2026", waktuRelatif("2026-10-01T09:00:00Z", kini))
        assertEquals("", waktuRelatif("rusak", kini))
    }

    @Test
    fun judulKosongMemakaiTemplate() {
        val n = item("a").copy(title = "").keNotifikasi()
        assertEquals("PIC_REMINDER", n.judul)
    }

    // ------------------------------------------------------------ ViewModel

    @Test
    fun muatMengisiDaftarDanTujuan() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 1, items = listOf(item("a", tab = "work-desk"), item("b", dibaca = true))))
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        val ui = vm.ui.value
        assertTrue(ui.termuat)
        assertEquals(1, ui.belumDibaca)
        assertEquals("MEJA_KERJA", ui.daftar[0].tujuan)
        assertFalse(ui.daftar[0].dibaca)
        assertTrue(ui.daftar[1].dibaca)
    }

    @Test
    fun tandaiSatuOptimistisDanMengirimIds() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 2, items = listOf(item("a"), item("b"))))
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        vm.tandaiBaca("a")
        assertEquals(1, vm.ui.value.belumDibaca)
        assertTrue(vm.ui.value.daftar.first { it.id == "a" }.dibaca)
        assertEquals(listOf("a"), api.dikirim.single().ids)
        assertFalse(api.dikirim.single().all)
        // Ketuk ulang pesan yang sudah dibaca tidak mengirim lagi.
        vm.tandaiBaca("a")
        assertEquals(1, api.dikirim.size)
    }

    @Test
    fun tandaiSemuaMengirimAll() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 2, items = listOf(item("a"), item("b"))))
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        vm.tandaiSemua()
        assertEquals(0, vm.ui.value.belumDibaca)
        assertTrue(api.dikirim.single().all)
        assertTrue(api.dikirim.single().ids.isEmpty())
    }

    @Test
    fun gagalTandaiMemuatUlangDariServer() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 1, items = listOf(item("a"))), patchGagal = true)
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        vm.tandaiBaca("a")
        // Server menolak → daftar dimuat ulang: lencana kembali 1.
        assertEquals(2, api.jumlahMuat)
        assertEquals(1, vm.ui.value.belumDibaca)
        assertFalse(vm.ui.value.daftar.single().dibaca)
    }

    @Test
    fun tandaiBanyakDipotongPerBatasServer() {
        val items = (1..250).map { item("n-$it") }
        val api = ApiPalsu(NotificationsInboxResponse(unread = 250, items = items))
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        vm.tandaiBanyak(items.map { it.id })
        assertEquals(listOf(200, 50), api.dikirim.map { it.ids.size })
        assertEquals(0, vm.ui.value.belumDibaca)
    }

    // ------------------------------------------------------------ C1 regresi

    @Test
    fun c1_s5_responsBasiTidakMembalikkanTandaBaca() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 2, items = listOf(item("a"), item("b"))))
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        // Sheet dibuka: muat A berjalan dan tertahan (potret server: a belum dibaca).
        val gerbang = CompletableDeferred<Unit>()
        api.gerbang = gerbang
        vm.muat()
        // Pengguna mengetuk a; PATCH selesai lebih dulu.
        vm.tandaiBaca("a")
        assertTrue(vm.ui.value.daftar.first { it.id == "a" }.dibaca)
        // Server kini mencatat a dibaca, tetapi respons A yang basi baru tiba.
        api.inbox = NotificationsInboxResponse(unread = 1, items = listOf(item("a", dibaca = true), item("b")))
        gerbang.complete(Unit)
        assertTrue(vm.ui.value.daftar.first { it.id == "a" }.dibaca)
        assertEquals(1, vm.ui.value.belumDibaca)
        // Muat berikutnya (dimulai setelah PATCH) memakai keadaan server apa adanya.
        api.gerbang = null
        vm.muat()
        assertEquals(1, vm.ui.value.belumDibaca)
        assertFalse(vm.ui.value.daftar.first { it.id == "b" }.dibaca)
    }

    @Test
    fun c1_s5_muatLamaDibatalkanSaatMuatBaru() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 1, items = listOf(item("a"))))
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        val gerbang = CompletableDeferred<Unit>()
        api.gerbang = gerbang
        vm.muat()
        api.gerbang = null
        api.inbox = NotificationsInboxResponse(unread = 0, items = listOf(item("a", dibaca = true)))
        vm.muat()
        assertEquals(0, vm.ui.value.belumDibaca)
        // Respons lama yang tiba belakangan sudah dibatalkan, tidak menimpa.
        gerbang.complete(Unit)
        assertEquals(0, vm.ui.value.belumDibaca)
        assertFalse(vm.ui.value.memuat)
    }

    @Test
    fun c1_r12_badanKosongBukanHttp200() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 0, items = emptyList())).apply { badanKosong = true }
        val vm = NotifikasiViewModel(KotakMasukRepo(api))
        vm.muat()
        assertEquals("Jawaban server kosong. Coba lagi.", vm.ui.value.galat)
        assertFalse(vm.ui.value.memuat)
    }

    // ------------------------------------------------------------ D1 / S2

    @Test
    fun d1_s2_loncengDanRepoBersamaSatuAngka() {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 2, items = listOf(item("a"), item("b"))))
        val repo = KotakMasukRepo(api)
        val lonceng = NotifikasiViewModel(repo)
        lonceng.muat()
        assertEquals(2, repo.belumDibaca.value)
        // Tanda baca dari pengamat lain (Kotak masuk) menurunkan lencana lonceng tanpa muat ulang.
        kotlinx.coroutines.runBlocking { repo.tandai(listOf("b")) }
        assertEquals(1, lonceng.ui.value.belumDibaca)
        assertTrue(lonceng.ui.value.daftar.first { it.id == "b" }.dibaca)
        assertEquals(1, api.jumlahMuat)
        // Dan sebaliknya: lonceng menandai, angka repo (lencana Pesan) ikut.
        lonceng.tandaiBaca("a")
        assertEquals(0, repo.belumDibaca.value)
    }
}
