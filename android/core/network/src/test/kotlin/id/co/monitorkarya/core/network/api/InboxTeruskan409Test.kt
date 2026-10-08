package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.dto.GalatDto
import id.co.monitorkarya.core.network.dto.KonflikDto
import id.co.monitorkarya.core.network.dto.TeruskanRequest
import id.co.monitorkarya.core.network.dto.UndoRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException

/**
 * Kontrak penerusan di meja Penerimaan Admin PT (tes agen T6-C10; kode zona
 * jaringan milik T6-C2 — InboxApi/TeruskanRequest/TeruskanResponse/GalatDto —
 * dan T6-C1 — KonflikDto; spesifikasi di `android/docs/FASE2.md` bagian 3).
 *
 * Contoh JSON disalin dari route web (diverifikasi 8 Okt 2026):
 * - `src/app/api/inbox/route.ts` — 409 penerusan HANYA `{error}` (klik ganda
 *   aman: klaim bersyarat); sukses `{ok, undoToken?}` — undoToken hanya bila
 *   `issueUndo` berhasil (src/lib/undo.ts, 15 menit, sekali pakai).
 * - `src/app/api/weekly-input/route.ts` — 409 beku membawa
 *   `{error, locked:true, frozen:true, reason:"FORWARDED"}` (weeklyWriteBlock
 *   di src/lib/lock.ts; WEEKLY_FROZEN_MESSAGE).
 * - `src/app/api/undo/route.ts` + UNDONE_MESSAGES — respons urungkan.
 *
 * Dijalankan lewat MockWebServer + `buatApi` supaya badan permintaan (path,
 * JSON persis `{kind, id}` / `{token}`) ikut terkunci, bukan hanya dekode
 * respons. Murni JVM.
 */
class InboxTeruskan409Test {

    private lateinit var server: MockWebServer
    private lateinit var inboxApi: InboxApi
    private lateinit var undoApi: UndoApi

    @Before
    fun siapkan() {
        server = MockWebServer()
        server.start()
        val baseUrl = server.url("/").toString()
        inboxApi = buatApi(OkHttpClient(), baseUrl, InboxApi::class.java)
        undoApi = buatApi(OkHttpClient(), baseUrl, UndoApi::class.java)
    }

    @After
    fun matikan() {
        server.shutdown()
    }

    private fun jawab(kode: Int, badan: String) {
        server.enqueue(
            MockResponse()
                .setResponseCode(kode)
                .setHeader("Content-Type", "application/json")
                .setBody(badan),
        )
    }

    // ------------------------------------------------------------- GET meja

    @Test
    fun mejaDuaArusTerdekodeUtuh() {
        jawab(
            200,
            """
            {
              "reportDate": "2026-10-08T00:00:00.000Z",
              "dailyLockAt": "2026-10-08T10:00:00.000Z",
              "dailyCountdown": { "hours": 3, "minutes": 24, "totalMs": 12240000, "passed": false },
              "dailyLocked": false,
              "week": { "isoYear": 2026, "isoWeek": 41,
                        "handoverBy": "2026-10-15T10:00:00.000Z", "lockAt": "2026-10-16T10:00:00.000Z" },
              "daily": [
                { "projectId": "p-1", "code": "PRJ-001", "name": "Aplikasi Absensi", "picName": "Rudi",
                  "reportId": "rep-1", "status": "ON_PROGRESS", "progressPct": 40, "evidenceCount": 2,
                  "submittedAt": "2026-10-08T09:30:00.000Z", "submittedBy": "Rudi",
                  "forwardedAt": null, "readyToForward": true },
                { "projectId": "p-2", "code": "PRJ-002", "name": "Portal Vendor", "picName": null,
                  "reportId": null, "status": null, "progressPct": null, "evidenceCount": 0,
                  "submittedAt": null, "submittedBy": null, "forwardedAt": null, "readyToForward": false }
              ],
              "weekly": [
                { "divisionId": "d-1", "name": "Divisi Keuangan", "headName": "Budi",
                  "reportId": "w-1", "statusHeader": "DISETUJUI", "itemCount": 5,
                  "submittedAt": "2026-10-12T09:00:00.000Z", "approvedAt": "2026-10-13T02:00:00.000Z",
                  "forwardedAt": null, "readyToForward": true }
              ]
            }
            """.trimIndent(),
        )
        val meja = runBlocking { inboxApi.inbox() }.body()!!
        assertFalse(meja.dailyLocked)
        assertEquals(3, meja.dailyCountdown!!.hours)
        assertEquals(2, meja.daily.size)
        // Baris tanpa laporan: semuanya null dan tidak siap diteruskan.
        assertNull(meja.daily[1].reportId)
        assertFalse(meja.daily[1].readyToForward)
        // Baris mingguan: siap diteruskan hanya bila DISETUJUI dan belum pernah.
        assertEquals("DISETUJUI", meja.weekly[0].statusHeader)
        assertTrue(meja.weekly[0].readyToForward)
    }

    // ---------------------------------------------------------- POST teruskan

    @Test
    fun badanTeruskanHarianPersisKontrak() {
        jawab(200, """{"ok": true}""")
        runBlocking { inboxApi.teruskan(TeruskanRequest.harian("rep-1")) }
        val permintaan = server.takeRequest()
        assertEquals("/api/inbox", permintaan.path)
        assertEquals("""{"kind":"daily","id":"rep-1"}""", permintaan.body.readUtf8())
    }

    @Test
    fun badanTeruskanMingguanPersisKontrak() {
        jawab(200, """{"ok": true}""")
        runBlocking { inboxApi.teruskan(TeruskanRequest.mingguan("w-1")) }
        val permintaan = server.takeRequest()
        assertEquals("""{"kind":"weekly","id":"w-1"}""", permintaan.body.readUtf8())
    }

    @Test
    fun suksesMembawaUndoToken() {
        jawab(200, """{"ok": true, "undoToken": "tiket-123"}""")
        val isi = runBlocking { inboxApi.teruskan(TeruskanRequest.harian("rep-1")) }.body()!!
        assertTrue(isi.ok)
        assertEquals("tiket-123", isi.undoToken)
    }

    @Test
    fun suksesTanpaUndoTokenBukanGalat() {
        // issueUndo gagal (mis. migrasi 0025 belum ada) → field tidak dikirim;
        // penerusan tetap sukses, UI hanya tidak menawarkan "Urungkan".
        jawab(200, """{"ok": true}""")
        val isi = runBlocking { inboxApi.teruskan(TeruskanRequest.mingguan("w-1")) }.body()!!
        assertTrue(isi.ok)
        assertNull(isi.undoToken)
    }

    @Test
    fun konflik409SudahDiteruskanHanyaBerisiError() {
        // Di route ini 409 HANYA {error} (klaim bersyarat anti klik ganda) —
        // tidak ada locked/frozen/reportId.
        jawab(409, """{"error": "Laporan ini sudah diteruskan"}""")
        val respon = runBlocking { inboxApi.teruskan(TeruskanRequest.harian("rep-1")) }
        val galat = ApiError.dari(HttpException(respon))
        assertTrue(galat is ApiError.Konflik)
        galat as ApiError.Konflik
        assertEquals("Laporan ini sudah diteruskan", galat.pesan)
        assertNull(galat.locked)
        assertNull(galat.frozen)
        assertNull(galat.reportId)
        assertEquals(galat.pesan, galat.pesanTampil())
    }

    @Test
    fun konflik409BekuMingguanDenganReasonForwarded() {
        // Bentuk beku weekly-input (WEEKLY_FROZEN_MESSAGE, src/lib/lock.ts):
        // frozen dikirim server sebagai BOOLEAN, reason sebagai string.
        val pesanBeku =
            "Laporan minggu ini sudah diteruskan ke holding dan dibekukan. " +
                "Perubahan hanya lewat permohonan buka kunci yang disetujui."
        val badan =
            """{"error": "$pesanBeku", "locked": true, "frozen": true, "reason": "FORWARDED"}"""
        jawab(409, badan) // untuk ApiError
        jawab(409, badan) // untuk pembacaan errorBody mentah (sekali baca)

        val respon = runBlocking { inboxApi.teruskan(TeruskanRequest.mingguan("w-1")) }
        val galat = ApiError.dari(HttpException(respon))
        assertTrue(galat is ApiError.Konflik)
        galat as ApiError.Konflik
        assertEquals(pesanBeku, galat.pesan)
        assertEquals(java.lang.Boolean.TRUE, galat.locked)
        // ApiError.Konflik.frozen bertipe String?: literal boolean terbaca
        // sebagai teks "true" (jsonPrimitive.content) — kontrak T5-B1 memang
        // menargetkan frozen string "FORWARDED"/"LOCKED" milik daily-input.
        // Untuk membedakan beku vs kunci jam, baca reason lewat KonflikDto.
        // Tercatat di T6-C10-AUDIT butir 5.
        assertEquals("true", galat.frozen)

        val mentah = runBlocking { inboxApi.teruskan(TeruskanRequest.mingguan("w-1")) }
        val teks = mentah.errorBody()!!.string()
        val konflik = mkJson.decodeFromString<KonflikDto>(teks)
        assertEquals("FORWARDED", konflik.reason)
        assertEquals(java.lang.Boolean.TRUE, konflik.frozen)
        assertEquals(java.lang.Boolean.TRUE, konflik.locked)
        // Dua pandangan terketik atas badan yang sama (T6-C1 KonflikDto vs
        // T6-C2 GalatDto): keduanya wajib membaca beku ini dengan benar.
        val galatDto = mkJson.decodeFromString<GalatDto>(teks)
        assertEquals(java.lang.Boolean.TRUE, galatDto.frozen)
        assertEquals(java.lang.Boolean.TRUE, galatDto.locked)
    }

    // ------------------------------------------------------------- POST undo

    @Test
    fun urungkanResponsDanBadanPersisKontrak() {
        jawab(
            200,
            """
            { "ok": true, "action": "FORWARD_DAILY_REPORT", "targetType": "DAILY_REPORT",
              "targetId": "rep-1", "message": "Penerusan laporan harian diurungkan." }
            """.trimIndent(),
        )
        val isi = runBlocking { undoApi.urungkan(UndoRequest("tiket-123")) }.body()!!
        assertTrue(isi.ok)
        assertEquals("FORWARD_DAILY_REPORT", isi.action)
        assertEquals("DAILY_REPORT", isi.targetType)
        assertEquals("rep-1", isi.targetId)
        assertEquals("Penerusan laporan harian diurungkan.", isi.message)
        val permintaan = server.takeRequest()
        assertEquals("/api/undo", permintaan.path)
        assertEquals("""{"token":"tiket-123"}""", permintaan.body.readUtf8())
    }

    @Test
    fun urungkan409JendelaHabisTetapKonflik() {
        jawab(409, """{"error": "Batas urungkan 15 menit sudah lewat"}""")
        val respon = runBlocking { undoApi.urungkan(UndoRequest("tiket-123")) }
        val galat = ApiError.dari(HttpException(respon))
        assertTrue(galat is ApiError.Konflik)
        assertEquals("Batas urungkan 15 menit sudah lewat", (galat as ApiError.Konflik).pesan)
    }

    // ------------------------------------------------- galat remind (kepatuhan)

    @Test
    fun galatDtoRemind409TerkunciJamTujuhBelas() {
        // POST /api/admin/compliance/remind setelah 17.00 WIB (remind/route.ts).
        val badan = """{"error": "Laporan hari ini sudah dikunci pukul 17.00 WIB.", "locked": true}"""
        val terurai = mkJson.decodeFromString<GalatDto>(badan)
        assertEquals("Laporan hari ini sudah dikunci pukul 17.00 WIB.", terurai.error)
        assertEquals(java.lang.Boolean.TRUE, terurai.locked)

        jawab(409, badan)
        val respon = runBlocking { inboxApi.teruskan(TeruskanRequest.harian("rep-1")) }
        val galat = ApiError.dari(HttpException(respon))
        assertTrue(galat is ApiError.Konflik)
        assertEquals(java.lang.Boolean.TRUE, (galat as ApiError.Konflik).locked)
    }
}
