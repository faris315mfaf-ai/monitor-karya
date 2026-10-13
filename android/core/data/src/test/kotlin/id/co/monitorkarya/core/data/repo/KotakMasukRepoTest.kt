package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.network.api.NotificationsApi
import id.co.monitorkarya.core.network.dto.InboxItemDto
import id.co.monitorkarya.core.network.dto.NotificationListResponse
import id.co.monitorkarya.core.network.dto.NotificationsInboxResponse
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import id.co.monitorkarya.core.network.dto.TandaiBacaResponse
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/**
 * D1 (S2): satu repo kotak masuk untuk ikon Pesan dan lonceng. Bentuk data
 * src/app/api/notifications/route.ts (inbox=1 → {unread, items}; PATCH {ids ≤200}|{all:true}).
 */
class KotakMasukRepoTest {

    private class ApiPalsu(var inbox: NotificationsInboxResponse) : NotificationsApi {
        val dikirim = mutableListOf<TandaiBacaRequest>()
        var jumlahMuat = 0
        var patchGagal = false
        var gerbang: CompletableDeferred<Unit>? = null
        var gerbangPatch: CompletableDeferred<Unit>? = null

        override suspend fun kotakMasuk(kotak: String): Response<NotificationsInboxResponse> {
            jumlahMuat++
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
            gerbangPatch?.await()
            return if (patchGagal) {
                Response.error(500, """{"error":"x"}""".toResponseBody("application/json".toMediaType()))
            } else {
                Response.success(TandaiBacaResponse(ok = true, marked = body.ids.size))
            }
        }
    }

    private fun item(id: String, dibaca: Boolean = false) = InboxItemDto(
        id = id,
        template = "PENGINGAT_HARIAN_PIC",
        title = "t",
        body = "b",
        createdAt = "2026-10-13T05:00:00.000Z",
        readAt = if (dibaca) "2026-10-13T06:00:00.000Z" else null,
    )

    @Test
    fun muat_menerbitkan_daftar_dan_angka_bersama() = runBlocking {
        val repo = KotakMasukRepo(ApiPalsu(NotificationsInboxResponse(unread = 1, items = listOf(item("a"), item("b", true)))))
        val h = repo.muat()
        assertTrue(h is HasilBaca.Sukses)
        assertEquals(1, repo.belumDibaca.value)
        assertEquals(1, repo.keadaan.value.belumDibaca)
        assertTrue(repo.keadaan.value.termuat)
    }

    @Test
    fun tandai_optimistis_dipotong_200_dan_gagal_memuat_ulang() = runBlocking {
        val items = (1..250).map { item("n-$it") }
        val api = ApiPalsu(NotificationsInboxResponse(unread = 250, items = items))
        val repo = KotakMasukRepo(api)
        repo.muat()
        repo.tandai(items.map { it.id })
        assertEquals(listOf(200, 50), api.dikirim.map { it.ids.size })
        assertEquals(0, repo.belumDibaca.value)

        val repo2 = KotakMasukRepo(ApiPalsu(NotificationsInboxResponse(unread = 1, items = listOf(item("a")))).apply { patchGagal = true })
        repo2.muat()
        val h = repo2.tandai(listOf("a"))
        assertTrue(h is HasilBaca.Gagal)
        assertEquals(1, repo2.belumDibaca.value)
        assertFalse(repo2.keadaan.value.items.single().readAt != null)
    }

    @Test
    fun respons_basi_tidak_menimpa_tanda_baca_maupun_muat_lebih_baru() = runBlocking {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 2, items = listOf(item("a"), item("b"))))
        val repo = KotakMasukRepo(api)
        repo.muat()
        // Muat A tertahan (potret: a belum dibaca).
        val gerbang = CompletableDeferred<Unit>()
        api.gerbang = gerbang
        val muatA = async(Dispatchers.Unconfined, start = CoroutineStart.UNDISPATCHED) { repo.muat() }
        api.gerbang = null
        repo.tandai(listOf("a"))
        // Server kini mencatat a dibaca; muat B (lebih baru) terbit lebih dulu.
        api.inbox = NotificationsInboxResponse(unread = 1, items = listOf(item("a", true), item("b")))
        repo.muat()
        assertEquals(1, repo.belumDibaca.value)
        gerbang.complete(Unit)
        muatA.await()
        // Respons A basi dibuang: a tetap dibaca, angka tetap 1.
        assertEquals(1, repo.belumDibaca.value)
        assertTrue(repo.keadaan.value.items.first { it.id == "a" }.readAt != null)
    }

    @Test
    fun reset_mengosongkan_angka_sesi_lama() = runBlocking {
        val repo = KotakMasukRepo(ApiPalsu(NotificationsInboxResponse(unread = 3, items = listOf(item("a")))))
        repo.muat()
        assertEquals(3, repo.belumDibaca.value)
        repo.reset()
        assertEquals(0, repo.belumDibaca.value)
        assertFalse(repo.keadaan.value.termuat)
    }

    @Test
    fun muat_berjalan_saat_reset_tidak_terbit_ke_sesi_baru() = runBlocking {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 5, items = listOf(item("milik-a"))))
        val repo = KotakMasukRepo(api)
        // Muat akun A tertahan di jaringan.
        val gerbang = CompletableDeferred<Unit>()
        api.gerbang = gerbang
        val muatA = async(Dispatchers.Unconfined, start = CoroutineStart.UNDISPATCHED) { repo.muat() }
        // A keluar, B masuk.
        repo.reset()
        gerbang.complete(Unit)
        val h = muatA.await()
        // Respons A dibuang: sesi B tetap kosong.
        assertTrue(h is HasilBaca.Sukses)
        assertEquals(0, repo.belumDibaca.value)
        assertTrue(repo.keadaan.value.items.isEmpty())
        assertFalse(repo.keadaan.value.termuat)

        // Muat sesi B berikutnya tetap terbit normal.
        api.gerbang = null
        api.inbox = NotificationsInboxResponse(unread = 1, items = listOf(item("milik-b")))
        repo.muat()
        assertEquals(1, repo.belumDibaca.value)
        assertEquals("milik-b", repo.keadaan.value.items.single().id)
    }

    @Test
    fun respons_generasi_lama_dibuang_walau_api_tidak_menghormati_pembatalan() = runBlocking {
        // API yang mengembalikan potret A meski dibatalkan (mis. respons sudah di buffer).
        val potretA = NotificationsInboxResponse(unread = 4, items = listOf(item("milik-a")))
        val gerbang = CompletableDeferred<Unit>()
        val api = object : NotificationsApi by ApiPalsu(potretA) {
            override suspend fun kotakMasuk(kotak: String): Response<NotificationsInboxResponse> {
                kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { gerbang.await() }
                return Response.success(potretA)
            }
        }
        val repo = KotakMasukRepo(api)
        val muatA = async(Dispatchers.Unconfined, start = CoroutineStart.UNDISPATCHED) { repo.muat() }
        repo.reset()
        gerbang.complete(Unit)
        muatA.await()
        assertEquals(0, repo.belumDibaca.value)
        assertFalse(repo.keadaan.value.termuat)
    }

    @Test
    fun tandai_semua_akun_lama_tidak_menempel_ke_sesi_baru() = runBlocking {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 2, items = listOf(item("a1"), item("a2"))))
        val repo = KotakMasukRepo(api)
        repo.muat()
        // PATCH "tandai semua" akun A tertahan, lalu A keluar.
        val gerbangPatch = CompletableDeferred<Unit>()
        api.gerbangPatch = gerbangPatch
        val tandaA = async(Dispatchers.Unconfined, start = CoroutineStart.UNDISPATCHED) { repo.tandai(null) }
        repo.reset()
        // Muat sesi B dimulai SEBELUM PATCH A selesai.
        api.gerbangPatch = null
        api.inbox = NotificationsInboxResponse(unread = 2, items = listOf(item("b1"), item("b2")))
        val gerbangB = CompletableDeferred<Unit>()
        api.gerbang = gerbangB
        val muatB = async(Dispatchers.Unconfined, start = CoroutineStart.UNDISPATCHED) { repo.muat() }
        gerbangPatch.complete(Unit)
        tandaA.await()
        gerbangB.complete(Unit)
        muatB.await()
        // Pesan B tidak boleh tertandai dibaca oleh tanda "semua" milik A.
        assertEquals(2, repo.belumDibaca.value)
        assertTrue(repo.keadaan.value.items.all { it.readAt == null })
    }

    @Test
    fun muat_berkala_dua_poller_hanya_satu_permintaan_per_selang() = runBlocking {
        val api = ApiPalsu(NotificationsInboxResponse(unread = 1, items = listOf(item("a"))))
        val repo = KotakMasukRepo(api)
        var kini = 1_000L
        repo.jam = { kini }
        repo.muatBerkala() // poller Pesan
        kini += 5_000
        repo.muatBerkala() // poller lonceng 5 detik kemudian: dilewati
        assertEquals(1, api.jumlahMuat)
        kini += 60_000
        repo.muatBerkala()
        assertEquals(2, api.jumlahMuat)
        // Muat paksa (Sheet dibuka) tidak pernah dilewati.
        repo.muat()
        assertEquals(3, api.jumlahMuat)
        // Setelah reset (sesi baru) muat berkala langsung menarik.
        repo.reset()
        repo.muatBerkala()
        assertEquals(4, api.jumlahMuat)
    }
}
