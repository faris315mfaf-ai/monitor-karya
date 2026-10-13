package id.co.monitorkarya.core.network.dto

import id.co.monitorkarya.core.network.api.LaporanDibacaApi
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * D1: mkJson memakai encodeDefaults=false, jadi properti non-null berbawaan
 * hilang dari badan kecuali bertanda @EncodeDefault(ALWAYS). Tes ini
 * mengunci badan yang dikirim utuh seperti web, plus DELETE berbadan.
 */
class EncodeDefaultD1Test {

    private fun <T> json(s: kotlinx.serialization.KSerializer<T>, v: T): JsonObject =
        mkJson.parseToJsonElement(mkJson.encodeToString(s, v)).jsonObject

    @Test
    fun simpan_task_mengirim_seluruh_kolom_bawaan() {
        val o = json(TaskSaveRequest.serializer(), TaskSaveRequest(title = "Pasang panel", id = "t-1"))
        assertEquals(JsonPrimitive("BELUM_MULAI"), o["status"])
        assertEquals(JsonPrimitive(0), o["progressPct"])
        assertEquals(JsonPrimitive("SEDANG"), o["urgency"])
        assertEquals(JsonArray(emptyList()), o["tags"])
        assertEquals(JsonArray(emptyList()), o["subtasks"])
        // Nullable berbawaan null tetap absen (picUserId absen = server mempertahankan PIC akun).
        assertTrue("picUserId" !in o)
    }

    @Test
    fun subtask_selalu_membawa_isDone() {
        val o = json(SubtaskInputDto.serializer(), SubtaskInputDto("Kabel"))
        assertEquals(JsonPrimitive(false), o["isDone"])
        val w = json(WeeklySubtaskInputDto.serializer(), WeeklySubtaskInputDto("Uji"))
        assertEquals(JsonPrimitive(false), w["isDone"])
    }

    @Test
    fun entri_dan_butir_mingguan_mengirim_daftar_kosong_eksplisit() {
        val e = json(
            EntriSimpanRequest.serializer(),
            EntriSimpanRequest("HARIAN", "x", null, null, "BERJALAN", 0, null, null, null, null, false, id = "t-1"),
        )
        assertEquals(JsonArray(emptyList()), e["tags"])
        assertEquals(JsonArray(emptyList()), e["subtasks"])

        val w = json(
            WeeklyItemSaveRequest.serializer(),
            WeeklyItemSaveRequest(
                divisionId = "d-1", itemId = "i-1", workItem = "Audit", targetOutput = "Laporan",
                picName = "Ani", status = "BERJALAN", achievementThisWeek = "", progressPct = 10,
                aspectCategoryId = "a-1", priorityId = "p-1",
            ),
        )
        assertEquals(JsonArray(emptyList()), w["tags"])
        assertEquals(JsonArray(emptyList()), w["subtasks"])
    }

    @Test
    fun payload_antrean_menyimpan_bawaan() {
        assertEquals(JsonPrimitive("HARIAN"), json(PayloadHapusEntri.serializer(), PayloadHapusEntri("t-1"))["context"])
        val b = PayloadUnggahBukti("lokal:1", "a.jpg", "a.jpg", "image/jpeg", 10L)
        assertEquals(JsonPrimitive("TASK"), json(PayloadUnggahBukti.serializer(), b)["targetType"])
    }

    @Test
    fun tandai_baca_tetap_ringkas_seperti_web() {
        assertEquals("""{"all":true}""", mkJson.encodeToString(TandaiBacaRequest.serializer(), TandaiBacaRequest(all = true)))
        assertEquals("""{"ids":["n1"]}""", mkJson.encodeToString(TandaiBacaRequest.serializer(), TandaiBacaRequest(ids = listOf("n1"))))
    }

    @Test
    fun batal_tandai_laporan_dibaca_delete_berbadan() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val api = buatApi(OkHttpClient(), server.url("/").toString(), LaporanDibacaApi::class.java)
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            val res = api.batalTandai(LaporanDibacaRequest(weeklyReportId = "w-1"))
            assertTrue(res.isSuccessful)
            val q = server.takeRequest()
            assertEquals("DELETE", q.method)
            assertEquals("/api/ringkasan/laporan-dibaca", q.path)
            assertEquals("""{"weeklyReportId":"w-1"}""", q.body.readUtf8())
        } finally {
            server.shutdown()
        }
    }
}
