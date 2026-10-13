package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.api.EntriLaporanApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.PayloadUnggahBukti
import id.co.monitorkarya.core.network.mkJson
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Gelombang E — `Idempotency-Key` outbox ujung ke ujung lewat Retrofit +
 * OkHttp SUNGGUHAN (antarmuka API, konverter mkJson, header di kawat). Server
 * diperankan interceptor OkHttp berskrip (core:data tidak punya MockWebServer
 * di classpath tes; perilaku kawatnya setara — permintaan nyata direkam, jawaban
 * atau IOException dari skrip). Tes kawat per rute dengan MockWebServer ada di
 * core:network `IdempotensiApiTest`.
 *
 * Yang dikunci: kunci dibuat sekali & SAMA di setiap percobaan (luring, 503,
 * proses berganti putaran), baris lama tanpa kunci diisi sebelum kiriman
 * pertama, jawaban ulangan = sukses biasa (id lokal → id server), hapus 404
 * setelah percobaan ambigu = selesai, rute mingguan tanpa header.
 */
class OutboxIdempotensiTest {

    private val kunciLaporan = KunciOutbox.laporanHarian("p-1", "2026-10-13")
    private val folder: File = Files.createTempDirectory("bukti-antre-e").toFile()
    private val berkas = BerkasAntre(folder)
    private val dao = FakeOutboxDao()
    private val server = ServerPalsu()
    private var sekarang = 1_000_000_000L

    private val ok = OkHttpClient.Builder().addInterceptor(server).build()
    private val url = "http://server-palsu.test/"
    private val pengirim = PengirimLaporanPic(
        dao = dao,
        entriApi = buatApi(ok, url, EntriLaporanApi::class.java),
        tasksApi = buatApi(ok, url, TasksApi::class.java),
        evidenceApi = buatApi(ok, url, EvidenceApi::class.java),
        berkas = berkas,
        peta = FakePetaIdDao(),
    )
    private val kunciDibuat = mutableListOf<String>()
    private val prosesor = OutboxProsesor(
        dao = dao,
        jam = { sekarang },
        kunciBaru = { "kunci-baru-${kunciDibuat.size + 1}-0000".also { kunciDibuat += it } },
    ) { p -> pengirim.kirim(p) ?: HasilKirim.GagalPermanen("jenis asing") }

    @After
    fun bersih() {
        folder.deleteRecursively()
    }

    // ------------------------------------------------------------------ pembantu

    private val k1 = "11111111-1111-4111-8111-111111111111"
    private val k2 = "22222222-2222-4222-8222-222222222222"

    private fun entri(id: String? = null) = EntriSimpanRequest(
        context = "HARIAN",
        title = "Pasang panel",
        description = null,
        picName = "Rani",
        status = "BERJALAN",
        progressPct = 40,
        obstacle = null,
        decisionNeeded = null,
        achievementToday = "Segmen 3 selesai",
        followUp = null,
        needsEscalation = false,
        projectId = if (id == null) "p-1" else null,
        id = id,
        workDate = if (id == null) "2026-10-13" else null,
    )

    private suspend fun antre(jenis: String, payload: String, kunciIdem: String?): Long = dao.tambah(
        OutboxEntity(
            jenis = jenis,
            payloadJson = payload,
            dibuatPada = sekarang,
            kunci = kunciLaporan,
            label = jenis,
            kunciIdempotensi = kunciIdem,
        ),
    )

    private val entriServer = """{"ok":true,"task":{"id":"t-srv","projectId":"p-1","workDate":"2026-10-12T17:00:00.000Z","title":"Pasang panel","status":"BERJALAN"}}"""

    // ------------------------------------------------------------------ tes

    @Test
    fun tambahEntriPutusSetelahCommitLaluUlanganMemakaiKunciSamaDanIdServerMengganti() = runBlocking<Unit> {
        val idTambah = antre(JenisOutbox.TAMBAH_ENTRI, mkJson.encodeToString(EntriSimpanRequest.serializer(), entri()), k1)
        antre(JenisOutbox.UBAH_ENTRI, mkJson.encodeToString(EntriSimpanRequest.serializer(), entri(IdLokal.dari(idTambah))), k2)

        // Putaran 1: server commit lalu koneksi putus sebelum jawaban sampai.
        server.skrip += Langkah.Putus
        val r1 = prosesor.prosesAntrean()
        assertEquals(1, r1.luring)
        assertEquals(1, server.rekaman.size) // UBAH tertahan di belakang TAMBAH

        // Putaran 2: kunci SAMA → server membalas respons pertama (ulangan).
        server.skrip += Langkah.Jawab(200, entriServer, ulangan = true)
        server.skrip += Langkah.Jawab(200, entriServer)
        val r2 = prosesor.prosesAntrean()
        assertEquals(2, r2.terkirim)

        val (post1, post2, put) = server.rekaman
        assertEquals("POST" to "/api/tasks", post1.metode to post1.jalur)
        assertEquals(k1, post1.kunci)
        assertEquals("kunci identik di setiap percobaan", post1.kunci, post2.kunci)
        // Penerus memakai kuncinya sendiri dan id server dari badan ulangan.
        assertEquals("PUT", put.metode)
        assertEquals(k2, put.kunci)
        assertNotEquals(k1, put.kunci)
        assertTrue(put.badan, "\"id\":\"t-srv\"" in put.badan)
        assertTrue(dao.baris.isEmpty())
        assertTrue("tidak ada kunci dibuat ulang", kunciDibuat.isEmpty())
    }

    @Test
    fun ulanganDipetakanSuksesBiasa() = runBlocking<Unit> {
        val id = antre(JenisOutbox.TAMBAH_ENTRI, mkJson.encodeToString(EntriSimpanRequest.serializer(), entri()), k1)
        server.skrip += Langkah.Jawab(200, entriServer, ulangan = true)
        val hasil = pengirim.kirim(dao.ambil(id)!!)
        assertEquals(HasilKirim.Sukses(ulangan = true), hasil)
    }

    @Test
    fun unggahBukti503LaluSuksesKunciStabilAntarPercobaan() = runBlocking<Unit> {
        val nama = berkas.simpan(byteArrayOf(1, 2, 3), "foto.jpg")
        antre(
            JenisOutbox.UNGGAH_BUKTI,
            mkJson.encodeToString(PayloadUnggahBukti.serializer(), PayloadUnggahBukti("t-1", nama, "foto.jpg", "image/jpeg", 3)),
            k1,
        )
        server.skrip += Langkah.Jawab(503, """{"error":"Server sibuk"}""")
        assertEquals(1, prosesor.prosesAntrean().gagalSementara)

        sekarang += OutboxProsesor.JEDA_MAKS_MS // lewat backoff
        server.skrip += Langkah.Jawab(
            200,
            """{"ok":true,"evidence":{"id":"e-1","fileName":"foto.jpg","mime":"image/jpeg","size":3,"storageKey":"k","url":null,"createdAt":"2026-10-13T00:00:00Z"},"evidenceCount":1}""",
            ulangan = true,
        )
        assertEquals(1, prosesor.prosesAntrean().terkirim)

        assertEquals(listOf("/api/evidence/upload", "/api/evidence/upload"), server.rekaman.map { it.jalur })
        assertEquals(listOf(k1, k1), server.rekaman.map { it.kunci })
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun barisLamaTanpaKunciDiisiSebelumKirimPertamaLaluTetapSama() = runBlocking<Unit> {
        val id = antre(JenisOutbox.TAMBAH_ENTRI, mkJson.encodeToString(EntriSimpanRequest.serializer(), entri()), kunciIdem = null)

        server.skrip += Langkah.Putus
        prosesor.prosesAntrean()
        val tersimpan = dao.ambil(id)!!.kunciIdempotensi
        assertNotNull("kunci disimpan sebelum kiriman pertama", tersimpan)
        assertEquals(tersimpan, server.rekaman.single().kunci)

        server.skrip += Langkah.Jawab(200, entriServer)
        prosesor.prosesAntrean()
        assertEquals(listOf(tersimpan, tersimpan), server.rekaman.map { it.kunci })
        assertEquals("kunci dibuat tepat sekali", 1, kunciDibuat.size)
    }

    @Test
    fun hapus404SetelahPercobaanAmbiguDianggapSelesai() = runBlocking<Unit> {
        antre(JenisOutbox.HAPUS_ENTRI, mkJson.encodeToString(PayloadHapusEntri.serializer(), PayloadHapusEntri("t-9")), k1)
        server.skrip += Langkah.Putus
        prosesor.prosesAntrean()
        // Kunci kedaluwarsa/baris pra-E: server tidak punya catatan → 404 asli.
        server.skrip += Langkah.Jawab(404, """{"error":"Task tidak ditemukan"}""")
        val r = prosesor.prosesAntrean()

        assertEquals(1, r.terkirim)
        assertTrue(dao.baris.isEmpty())
        assertEquals(listOf("DELETE", "DELETE"), server.rekaman.map { it.metode })
        assertEquals("/api/tasks?id=t-9&context=HARIAN", server.rekaman.last().jalur)
        assertEquals(listOf(k1, k1), server.rekaman.map { it.kunci })
    }

    @Test
    fun hapus404PadaPercobaanPertamaTetapGagalFinal() = runBlocking<Unit> {
        antre(JenisOutbox.HAPUS_ENTRI, mkJson.encodeToString(PayloadHapusEntri.serializer(), PayloadHapusEntri("t-9")), k1)
        server.skrip += Langkah.Jawab(404, """{"error":"Task tidak ditemukan"}""")
        prosesor.prosesAntrean()
        val baris = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_GAGAL, baris.status)
        assertEquals("Task tidak ditemukan", baris.pesanGalat)
    }

    @Test
    fun ubah409SetelahPercobaanAmbiguTetapGagalTanpaMenebak() = runBlocking<Unit> {
        // PUT yang ternyata sudah sukses lalu laporan dibekukan: dengan kunci yang
        // masih berlaku server membalas 200 pertama; tanpa catatan (kedaluwarsa)
        // 409 tetap ditampilkan — klien tidak menebak isi server.
        antre(JenisOutbox.UBAH_ENTRI, mkJson.encodeToString(EntriSimpanRequest.serializer(), entri("t-9")), k1)
        server.skrip += Langkah.Putus
        prosesor.prosesAntrean()
        server.skrip += Langkah.Jawab(409, """{"error":"Laporan sudah diteruskan.","locked":true,"frozen":"FORWARDED"}""")
        prosesor.prosesAntrean()
        assertEquals(OutboxEntity.STATUS_GAGAL, dao.baris.single().status)
        assertEquals(listOf(k1, k1), server.rekaman.map { it.kunci })
    }

    @Test
    fun kunciGandaSedangDiprosesSementara() = runBlocking<Unit> {
        antre(JenisOutbox.TAMBAH_ENTRI, mkJson.encodeToString(EntriSimpanRequest.serializer(), entri()), k1)
        server.skrip += Langkah.Jawab(409, """{"error":"Permintaan dengan kunci ini sedang diproses. Coba lagi sebentar.","locked":false}""")
        assertEquals(1, prosesor.prosesAntrean().gagalSementara)
        assertEquals(OutboxEntity.STATUS_MENUNGGU, dao.baris.single().status)
    }

    @Test
    fun headerHanyaUntukRuteBeridempotensiDanKunciSah() {
        val dasar = OutboxEntity(jenis = JenisOutbox.TAMBAH_ENTRI, payloadJson = "{}", dibuatPada = 0, kunciIdempotensi = k1)
        assertEquals(k1, dasar.headerIdempotensi())
        for (j in listOf(JenisOutbox.KIRIM_LAPORAN, JenisOutbox.TAMBAH_TUGAS, JenisOutbox.UBAH_TUGAS, JenisOutbox.HAPUS_TUGAS, JenisOutbox.UBAH_ENTRI, JenisOutbox.HAPUS_ENTRI, JenisOutbox.UNGGAH_BUKTI)) {
            assertEquals(j, k1, dasar.copy(jenis = j).headerIdempotensi())
        }
        for (j in listOf(JenisOutbox.SIMPAN_BUTIR_MINGGUAN, JenisOutbox.HAPUS_BUTIR_MINGGUAN, JenisOutbox.AKSI_MINGGUAN)) {
            assertNull(j, dasar.copy(jenis = j).headerIdempotensi())
        }
        assertNull(dasar.copy(kunciIdempotensi = null).headerIdempotensi())
        assertNull("kunci rusak tidak dikirim (server 400)", dasar.copy(kunciIdempotensi = "a b").headerIdempotensi())
    }

    @Test
    fun kunciAntreMewarisiKunciDaringAtauMembuatBaru() {
        assertEquals(k1, kunciIdempotensiAntre(k1) { "baru-00000" })
        assertEquals("baru-00000", kunciIdempotensiAntre(null) { "baru-00000" })
        assertEquals("baru-00000", kunciIdempotensiAntre("rusak") { "baru-00000" })
        assertTrue(Idempotensi.sah(kunciIdempotensiAntre(null)))
    }

    // ------------------------------------------------------------------ server palsu

    private sealed interface Langkah {
        /** Server menerima dan commit, tetapi jawaban tak pernah sampai (IOException). */
        data object Putus : Langkah
        data class Jawab(val kode: Int, val badan: String, val ulangan: Boolean = false) : Langkah
    }

    private data class Rekam(val metode: String, val jalur: String, val kunci: String?, val badan: String)

    private class ServerPalsu : Interceptor {
        val skrip = ArrayDeque<Langkah>()
        val rekaman = mutableListOf<Rekam>()

        override fun intercept(chain: Interceptor.Chain): Response {
            val req = chain.request()
            val badan = req.body?.let { b -> Buffer().also { b.writeTo(it) }.readUtf8() }.orEmpty()
            val q = req.url.encodedQuery?.let { "?$it" }.orEmpty()
            rekaman += Rekam(req.method, req.url.encodedPath + q, req.header(Idempotensi.HEADER), badan)
            return when (val l = skrip.removeFirstOrNull() ?: error("skrip server habis: ${req.method} ${req.url}")) {
                Langkah.Putus -> throw IOException("koneksi putus setelah server commit")
                is Langkah.Jawab -> Response.Builder()
                    .request(req)
                    .protocol(Protocol.HTTP_1_1)
                    .code(l.kode)
                    .message("palsu")
                    .apply { if (l.ulangan) header(Idempotensi.HEADER_ULANGAN, "true") }
                    .body(l.badan.toResponseBody("application/json".toMediaType()))
                    .build()
            }
        }
    }
}
