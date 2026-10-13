package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.NotificationsInboxResponse
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
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
 * Kontrak laporan harian multi-item + lonceng (agen A1, 13 Okt 2026).
 *
 * Contoh JSON disalin dari route web:
 * - `src/app/api/tasks/route.ts` GET harian (`{workDate, locked, frozen,
 *   reportId, unlockUntil, tasks}` + TASK_INCLUDE + evidence) dan POST/PUT
 *   (`{ok, task}`); readBody membaca `achievementToday`, `followUp`,
 *   `needsEscalation === true`; PUT mempertahankan kolom yang kuncinya absen.
 * - `src/app/api/daily-input/route.ts` PUT (`{ok, reportId, submitted,
 *   derivedFromTasks}`), 409 beku `{error, locked, frozen, reportId}`, 422
 *   `{error, errors, evidenceCount}`.
 * - `src/app/api/notifications/route.ts` GET `?inbox=1` dan PATCH `{ids}|{all}`.
 */
class EntriLaporanA1Test {

    private lateinit var server: MockWebServer
    private lateinit var entriApi: EntriLaporanApi
    private lateinit var laporanApi: LaporanPicApi
    private lateinit var notifApi: NotificationsApi

    @Before
    fun siapkan() {
        server = MockWebServer()
        server.start()
        val baseUrl = server.url("/").toString()
        entriApi = buatApi(OkHttpClient(), baseUrl, EntriLaporanApi::class.java)
        laporanApi = buatApi(OkHttpClient(), baseUrl, LaporanPicApi::class.java)
        notifApi = buatApi(OkHttpClient(), baseUrl, NotificationsApi::class.java)
    }

    @After
    fun matikan() {
        server.shutdown()
    }

    private fun json(kode: Int, badan: String) =
        MockResponse().setResponseCode(kode).setHeader("Content-Type", "application/json").setBody(badan)

    // ------------------------------------------------------------ GET entri

    @Test
    fun entriHariTerdekodeDenganNarasiDanBukti() = runBlocking {
        server.enqueue(
            json(
                200,
                """
                {
                  "workDate": "2026-10-12T17:00:00.000Z",
                  "locked": false,
                  "frozen": null,
                  "reportId": "rep-1",
                  "unlockUntil": null,
                  "tasks": [
                    {
                      "id": "t-1", "projectId": "p-1", "entityId": "e-1",
                      "workDate": "2026-10-12T17:00:00.000Z",
                      "title": "Pemasangan struktur tower segmen 3",
                      "description": null, "tags": [], "picUserId": "u-9", "picName": "Rina",
                      "startAt": null, "endAt": null, "durationMin": null,
                      "status": "TERKENDALA", "progressPct": 40, "urgency": "SEDANG",
                      "sortOrder": 0, "scope": "HARIAN",
                      "obstacle": "Crane terlambat", "decisionNeeded": "Setujui sewa crane",
                      "achievementToday": "Baut segmen 2 dikencangkan",
                      "followUp": "Konfirmasi crane", "needsEscalation": true,
                      "escalationId": null, "createdById": "u-9",
                      "createdAt": "2026-10-13T01:00:00.000Z", "updatedAt": "2026-10-13T02:00:00.000Z",
                      "subtasks": [
                        { "id": "s-1", "taskId": "t-1", "weeklyItemId": null, "title": "Cek baut", "isDone": true, "position": 0, "createdAt": "2026-10-13T01:00:00.000Z" }
                      ],
                      "picUser": { "id": "u-9", "name": "Rina" },
                      "escalation": null,
                      "evidence": [
                        { "id": "ev-1", "targetId": "t-1", "fileName": "foto.jpg", "url": null, "mime": "image/jpeg", "size": 120000, "createdAt": "2026-10-13T02:00:00.000Z" }
                      ]
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )
        val res = entriApi.entriHari("p-1", "2026-10-13")
        val minta = server.takeRequest()
        assertEquals("/api/tasks?projectId=p-1&date=2026-10-13", minta.path)
        val isi = res.body()!!
        assertEquals("rep-1", isi.reportId)
        val e = isi.tasks.single()
        assertEquals("Baut segmen 2 dikencangkan", e.achievementToday)
        assertEquals("Konfirmasi crane", e.followUp)
        assertTrue(e.needsEscalation)
        assertEquals(1, e.evidence.size)
        assertEquals("Cek baut", e.subtasks.single().title)
    }

    @Test
    fun entriHariTanpaTanggalTidakMengirimDate() = runBlocking {
        server.enqueue(json(200, """{"workDate":"2026-10-12T17:00:00.000Z","locked":true,"frozen":"FORWARDED","reportId":"r","unlockUntil":null,"tasks":[]}"""))
        val isi = entriApi.entriHari("p-1").body()!!
        assertEquals("/api/tasks?projectId=p-1", server.takeRequest().path)
        assertTrue(isi.locked)
        assertEquals("FORWARDED", isi.frozen)
    }

    // ------------------------------------------------------------ POST/PUT entri

    private fun badan(): JsonObject = mkJson.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject

    @Test
    fun tambahEntriSelaluMengirimNarasiDanTandaEskalasiFalse() = runBlocking {
        server.enqueue(json(200, """{"ok":true,"task":{"id":"t-2","projectId":"p-1","workDate":"2026-10-12T17:00:00.000Z","title":"Uji","status":"BERJALAN"}}"""))
        val res = entriApi.tambahEntri(
            EntriSimpanRequest(
                context = "HARIAN",
                title = "Uji",
                description = null,
                picName = "Rina",
                status = "BERJALAN",
                progressPct = 0,
                obstacle = null,
                decisionNeeded = null,
                achievementToday = null,
                followUp = null,
                needsEscalation = false,
                projectId = "p-1",
                workDate = "2026-10-13",
            ),
        )
        assertEquals("t-2", res.body()!!.task!!.id)
        val b = badan()
        // PUT server mempertahankan nilai lama bila kunci absen → kunci wajib ada.
        assertEquals(JsonPrimitive(false), b["needsEscalation"])
        assertTrue(b.containsKey("achievementToday"))
        assertTrue(b.containsKey("followUp"))
        assertEquals(JsonPrimitive(0), b["progressPct"])
        assertEquals(JsonPrimitive("HARIAN"), b["context"])
        assertEquals(JsonPrimitive("2026-10-13"), b["workDate"])
        // picUserId null tidak dikirim: server mempertahankan akun PIC task.
        assertFalse(b.containsKey("picUserId"))
        assertFalse(b.containsKey("id"))
    }

    @Test
    fun ubahEntriMembawaKolomMejaKerjaLama() = runBlocking {
        server.enqueue(json(200, """{"ok":true,"task":{"id":"t-1","projectId":"p-1","workDate":"2026-10-12T17:00:00.000Z","title":"Uji","status":"SELESAI","progressPct":100}}"""))
        entriApi.ubahEntri(
            EntriSimpanRequest(
                context = "HARIAN",
                title = "Uji",
                description = "",
                picName = "Rina",
                status = "SELESAI",
                progressPct = 100,
                obstacle = null,
                decisionNeeded = null,
                achievementToday = "Selesai diuji",
                followUp = "",
                needsEscalation = true,
                id = "t-1",
                picUserId = "u-9",
                tags = listOf("lapangan"),
                urgency = "TINGGI",
                startTime = "08:00",
                endTime = "10:30",
                subtasks = listOf(SubtaskInputDto("Cek baut", isDone = true)),
            ),
        )
        val minta = server.takeRequest()
        assertEquals("PUT", minta.method)
        val b = mkJson.parseToJsonElement(minta.body.readUtf8()).jsonObject
        assertEquals(JsonPrimitive("t-1"), b["id"])
        assertEquals(JsonPrimitive("u-9"), b["picUserId"])
        assertEquals(JsonPrimitive("TINGGI"), b["urgency"])
        assertEquals(JsonPrimitive("08:00"), b["startTime"])
        assertEquals(JsonPrimitive(true), b["needsEscalation"])
        assertFalse(b.containsKey("projectId"))
    }

    @Test
    fun tambahEntri409BekuMenjadiKonflik() = runBlocking {
        server.enqueue(json(409, """{"error":"Laporan ini sudah diteruskan ke holding dan dibekukan.","locked":true,"frozen":"FORWARDED","reportId":"rep-1"}"""))
        val res = entriApi.tambahEntri(
            EntriSimpanRequest("HARIAN", "x", null, null, "BERJALAN", 0, null, null, null, null, false, projectId = "p-1"),
        )
        val galat = ApiError.dari(HttpException(res))
        assertTrue(galat is ApiError.Konflik)
        galat as ApiError.Konflik
        assertEquals("FORWARDED", galat.frozen)
        assertEquals("rep-1", galat.reportId)
    }

    // ------------------------------------------------------------ PUT daily-input

    @Test
    fun kirimLaporanTanpaUndoToken() = runBlocking {
        server.enqueue(json(200, """{"ok":true,"reportId":"rep-1","submitted":true,"derivedFromTasks":true}"""))
        val isi = laporanApi.kirim(
            DailyInputRequest(
                projectId = "p-1", action = "submit", status = "",
                achievementToday = "a | b", obstacle = null, followUp = null,
                progressPct = 0, reportDate = "2026-10-13",
            ),
        ).body()!!
        assertTrue(isi.submitted)
        assertNull(isi.undoToken)
        val b = badan()
        assertEquals(JsonPrimitive("submit"), b["action"])
        assertEquals(JsonPrimitive("2026-10-13"), b["reportDate"])
    }

    @Test
    fun kirimLaporan422MembawaDaftarGalat() = runBlocking {
        server.enqueue(json(422, """{"error":"Lampirkan minimal 1 bukti.","errors":["Lampirkan minimal 1 bukti.","Capaian wajib diisi."],"evidenceCount":0}"""))
        val res = laporanApi.kirim(DailyInputRequest("p-1", "submit", "", "", progressPct = 0, reportDate = "2026-10-13"))
        val galat = ApiError.dari(HttpException(res))
        assertTrue(galat is ApiError.Validasi)
        assertEquals(2, (galat as ApiError.Validasi).errors.size)
    }

    @Test
    fun kirimLaporanMembacaUndoTokenBilaAda() {
        val isi = mkJson.decodeFromString<id.co.monitorkarya.core.network.dto.DailyInputKirimResponse>(
            """{"ok":true,"reportId":"r","submitted":false,"derivedFromTasks":true,"undoToken":"tok-1"}""",
        )
        assertEquals("tok-1", isi.undoToken)
    }

    // ------------------------------------------------------------ notifikasi

    @Test
    fun loncengTerdekodeDanTandaiBacaMengirimIds() = runBlocking {
        server.enqueue(
            json(
                200,
                """
                {"unread":2,"items":[
                  {"id":"n-1","template":"PIC_REMINDER","title":"Laporan harian belum dikirim","body":"Kirim sebelum 17.00","tab":"work-desk","createdAt":"2026-10-13T05:00:00.000Z","readAt":null},
                  {"id":"n-2","template":"LAMA","title":"LAMA","body":"","tab":null,"createdAt":"2026-10-12T05:00:00.000Z","readAt":"2026-10-12T06:00:00.000Z"}
                ]}
                """.trimIndent(),
            ),
        )
        val isi: NotificationsInboxResponse = notifApi.kotakMasuk().body()!!
        assertEquals("/api/notifications?inbox=1", server.takeRequest().path)
        assertEquals(2, isi.unread)
        assertEquals("work-desk", isi.items[0].tab)
        assertNull(isi.items[1].tab)

        server.enqueue(json(200, """{"ok":true,"marked":1}"""))
        notifApi.tandaiBaca(TandaiBacaRequest(ids = listOf("n-1")))
        val b = badan()
        assertEquals("n-1", (b["ids"] as kotlinx.serialization.json.JsonArray).single().let { (it as JsonPrimitive).content })
        assertFalse(b.containsKey("all"))

        server.enqueue(json(200, """{"ok":true,"marked":5}"""))
        notifApi.tandaiBaca(TandaiBacaRequest(all = true))
        val semua = badan()
        assertEquals(JsonPrimitive(true), semua["all"])
        assertFalse(semua.containsKey("ids"))
    }
}
