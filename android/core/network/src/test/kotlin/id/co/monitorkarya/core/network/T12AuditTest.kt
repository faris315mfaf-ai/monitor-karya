package id.co.monitorkarya.core.network

import id.co.monitorkarya.core.network.api.AuthApi
import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/**
 * Audit Android T12 (12 Okt 2026): kontrak klien vs rute server sesudah
 * perubahan 10 Okt (jam batas/24-7 per entitas) dan jalur sesi cookie.
 * Murni JVM (MockWebServer), tanpa Android.
 */
class T12AuditTest {

    // ---------------------------------------------------------- daily-input 24/7

    /**
     * src/app/api/daily-input/route.ts: `countdown: rptSettings.dailyCutoffHour === null
     * ? null : dailyCountdown(now)`. Entitas 24/7 mengirim countdown null; DTO lama
     * (countdown wajib) gagal mendekode seluruh meja.
     */
    @Test
    fun mejaHarian24JamCountdownNullTerdekode() {
        val dto = mkJson.decodeFromString<DailyInputGetResponse>(
            """
            {
              "reportDate": "2026-10-11T17:00:00.000Z",
              "reportDateKey": "2026-10-12",
              "today": true,
              "todayKey": "2026-10-12",
              "lockAt": "2026-10-12T10:00:00.000Z",
              "locked": false,
              "countdown": null,
              "canRequestUnlock": false,
              "openDays": [],
              "projects": []
            }
            """.trimIndent(),
        )
        assertNull(dto.countdown)
        assertEquals(false, dto.locked)
    }

    // ---------------------------------------------------------- ApiError

    private fun httpGalat(kode: Int, badan: String, tipe: String = "application/json"): ApiError =
        ApiError.dari(HttpException(Response.error<Unit>(kode, badan.toResponseBody(tipe.toMediaType()))))

    @Test
    fun kegagalanSerialisasiTidakMembocorkanPesanTeknis() {
        val galat = ApiError.dari(SerializationException("Expected start of the object '{', but had 'n' instead at path: \$.countdown"))
        assertTrue(galat is ApiError.Lainnya)
        val pesan = galat.pesanTampil()
        assertTrue(pesan, !pesan.contains("Expected start"))
        assertTrue(pesan, pesan.startsWith("Jawaban server tidak dikenali"))
    }

    @Test
    fun galat413TanpaBodiJsonTetapRamah() {
        val galat = httpGalat(413, "<html>Request Entity Too Large</html>", "text/html")
        assertEquals("Berkas atau isian terlalu besar untuk dikirim.", galat.pesanTampil())
    }

    @Test
    fun galat413DenganPesanServerDipakaiApaAdanya() {
        val galat = httpGalat(413, """{"error":"Berkas maksimal 20 MB."}""")
        assertEquals("Berkas maksimal 20 MB.", galat.pesanTampil())
    }

    @Test
    fun galat429MembacaRetryAfterDariBodi() {
        val galat = httpGalat(429, """{"error":"Terlalu banyak percobaan. Coba lagi dalam 15 menit.","retryAfter":900}""")
        assertTrue(galat is ApiError.TerlaluBanyakPesan)
        assertEquals(900L, (galat as ApiError.TerlaluBanyakPesan).retryDetik)
    }

    // ---------------------------------------------------------- cookie sesi

    @Test
    fun cookieKedaluwarsaDikirimSebagaiNilaiKosong() {
        val url = "https://monitorkarya.tech/api/auth/logout".toHttpUrl()
        val hapus = Cookie.parse(url, "__Host-mk_session=sisa-lama; Max-Age=0; Path=/; Secure; HttpOnly")!!
        val hidup = Cookie.parse(url, "__Host-mk_session=token-baru; Max-Age=3600; Path=/; Secure; HttpOnly")!!
        val sesi = Cookie.parse(url, "__Host-mk_session=token-sesi; Path=/; Secure; HttpOnly")!!
        assertEquals("__Host-mk_session=", MkClient.pasanganCookie(hapus))
        assertEquals("__Host-mk_session=token-baru", MkClient.pasanganCookie(hidup))
        assertEquals("__Host-mk_session=token-sesi", MkClient.pasanganCookie(sesi))
    }

    /** Penyimpanan sesi di memori yang meniru aturan EncryptedAuthStore (kosong = hapus). */
    private class AuthStoreMemori : MkAuthStore {
        val nilai = linkedMapOf<String, String>()

        override fun simpan(setCookieHeaders: List<String>) {
            for (baris in setCookieHeaders) {
                val pasangan = baris.substringBefore(';').trim()
                val nama = pasangan.substringBefore('=').trim()
                val isi = pasangan.substringAfter('=', "").trim()
                if (nama.isEmpty()) continue
                if (isi.isEmpty()) nilai.remove(nama) else nilai[nama] = isi
            }
        }

        override fun header(): String? =
            nilai.entries.takeIf { it.isNotEmpty() }?.joinToString("; ") { "${it.key}=${it.value}" }

        override fun hapus() = nilai.clear()
    }

    private lateinit var server: MockWebServer

    @Before
    fun siapkan() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun matikan() {
        server.shutdown()
    }

    @Test
    fun siklusSesiMasukKirimCookieLaluKeluarMenghapus() = runBlocking {
        val store = AuthStoreMemori()
        val api = buatApi(MkClient.okHttp(store, debug = false), server.url("/").toString(), AuthApi::class.java)

        // 1) Masuk: server menerbitkan cookie sesi.
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .addHeader("Set-Cookie", "mk_session=token-1; Path=/; HttpOnly; Max-Age=2592000")
                .setBody("""{"user":{"id":"u1","name":"Rani","email":"r@x.id","role":"PIC_PROYEK"},"mustChangePassword":false}"""),
        )
        api.login(id.co.monitorkarya.core.network.dto.LoginRequest("rani", "rahasia123"))
        assertEquals("mk_session=token-1", store.header())
        server.takeRequest()

        // 2) Permintaan berikutnya membawa cookie + penanda klien native, tanpa Origin.
        server.enqueue(
            MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json")
                .setBody("""{"user":{"id":"u1","name":"Rani","email":"r@x.id","role":"PIC_PROYEK"}}"""),
        )
        api.saya()
        val saya = server.takeRequest()
        assertEquals("mk_session=token-1", saya.getHeader("Cookie"))
        assertEquals("android/0.1.0", saya.getHeader("X-MK-Client"))
        assertNull(saya.getHeader("Origin"))

        // 3) Keluar: server membersihkan cookie (Max-Age=0). Nilai server bisa
        //    kosong ATAU tetap berisi — keduanya harus menghapus sesi lokal.
        server.enqueue(
            MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json")
                .addHeader("Set-Cookie", "mk_session=basi; Path=/; HttpOnly; Max-Age=0")
                .setBody("""{"ok":true}"""),
        )
        api.keluar()
        server.takeRequest()
        assertNull("sesi lokal harus terhapus", store.header())
    }

    // ---------------------------------------------------------- peristiwa sesi

    private fun jawabJson(kode: Int, badan: String) {
        server.enqueue(
            MockResponse().setResponseCode(kode).setHeader("Content-Type", "application/json").setBody(badan),
        )
    }

    private fun apiDenganPeristiwa(store: AuthStoreMemori, dicatat: MutableList<PeristiwaSesi>): AuthApi =
        buatApi(
            MkClient.okHttp(store, debug = false, saatPeristiwaSesi = { dicatat += it }),
            server.url("/").toString(),
            AuthApi::class.java,
        )

    @Test
    fun sesi401PadaPermintaanBercookieMenghapusSesiDanMelapor() = runBlocking {
        val store = AuthStoreMemori().apply { simpan(listOf("mk_session=token-lama")) }
        val dicatat = mutableListOf<PeristiwaSesi>()
        val api = apiDenganPeristiwa(store, dicatat)

        jawabJson(401, """{"user":null}""")
        val res = api.saya()

        assertEquals(401, res.code())
        assertEquals(listOf(PeristiwaSesi.BERAKHIR), dicatat)
        assertNull(store.header())
    }

    @Test
    fun login401BukanSesiBerakhirWalauAdaCookieLama() = runBlocking {
        val store = AuthStoreMemori().apply { simpan(listOf("mk_session=token-lama")) }
        val dicatat = mutableListOf<PeristiwaSesi>()
        val api = apiDenganPeristiwa(store, dicatat)

        jawabJson(401, """{"error":"Username atau kata sandi salah"}""")
        api.login(id.co.monitorkarya.core.network.dto.LoginRequest("rani", "salah"))

        assertTrue(dicatat.isEmpty())
        assertEquals("mk_session=token-lama", store.header())
    }

    @Test
    fun permintaanTanpaCookieTidakMelaporSesiBerakhir() = runBlocking {
        val store = AuthStoreMemori()
        val dicatat = mutableListOf<PeristiwaSesi>()
        val api = apiDenganPeristiwa(store, dicatat)

        jawabJson(401, """{"user":null}""")
        api.saya()

        assertTrue(dicatat.isEmpty())
    }

    @Test
    fun wajibGantiSandiDiTengahPemakaianDilaporTanpaMenghapusSesi() = runBlocking {
        val store = AuthStoreMemori().apply { simpan(listOf("mk_session=token-1")) }
        val dicatat = mutableListOf<PeristiwaSesi>()
        val api = apiDenganPeristiwa(store, dicatat)

        jawabJson(403, """{"error":"Ganti kata sandi dulu","code":"MUST_CHANGE_PASSWORD"}""")
        val res = api.saya()

        assertEquals(403, res.code())
        assertEquals(listOf(PeristiwaSesi.WAJIB_GANTI_SANDI), dicatat)
        assertEquals("mk_session=token-1", store.header())
        // Badan tetap terbaca utuh oleh pemanggil (peekBody tidak menghabiskannya).
        val galat = ApiError.dari(HttpException(res))
        assertTrue(galat is ApiError.WajibGantiSandi)
    }

    @Test
    fun forbidden403BiasaBukanPeristiwaSesi() = runBlocking {
        val store = AuthStoreMemori().apply { simpan(listOf("mk_session=token-1")) }
        val dicatat = mutableListOf<PeristiwaSesi>()
        val api = apiDenganPeristiwa(store, dicatat)

        jawabJson(403, """{"error":"Peran Anda tidak melakukan input harian"}""")
        api.saya()

        assertTrue(dicatat.isEmpty())
    }
}
