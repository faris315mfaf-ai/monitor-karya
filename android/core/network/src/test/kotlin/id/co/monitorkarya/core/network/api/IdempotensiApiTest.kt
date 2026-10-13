package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Gelombang E — header `Idempotency-Key` di kawat untuk SEMUA rute yang didukung
 * server (E-IDEMPOTENSI.md §2): POST/PUT/DELETE /api/tasks, PUT /api/daily-input,
 * POST /api/evidence/upload. Kunci null = header absen (perilaku lama); respons
 * ulangan (`Idempotency-Replayed: true`) terdekode seperti sukses biasa.
 */
class IdempotensiApiTest {

    private lateinit var server: MockWebServer
    private lateinit var tasks: TasksApi
    private lateinit var entri: EntriLaporanApi
    private lateinit var harian: DailyInputApi
    private lateinit var laporan: LaporanPicApi
    private lateinit var bukti: EvidenceApi

    private val kunci = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"

    @Before
    fun siapkan() {
        server = MockWebServer()
        server.start()
        val url = server.url("/").toString()
        val ok = OkHttpClient()
        tasks = buatApi(ok, url, TasksApi::class.java)
        entri = buatApi(ok, url, EntriLaporanApi::class.java)
        harian = buatApi(ok, url, DailyInputApi::class.java)
        laporan = buatApi(ok, url, LaporanPicApi::class.java)
        bukti = buatApi(ok, url, EvidenceApi::class.java)
    }

    @After
    fun matikan() {
        server.shutdown()
    }

    private fun json(badan: String, ulangan: Boolean = false) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .apply { if (ulangan) setHeader(Idempotensi.HEADER_ULANGAN, "true") }
        .setBody(badan)

    /** Badan POST/PUT entri (EntriSimpanResponse). */
    private val entriJson = """{"ok":true,"task":{"id":"t-9","projectId":"p-1","workDate":"2026-10-12T17:00:00.000Z","title":"A","status":"BERJALAN"}}"""

    /** Badan POST/PUT tugas (TaskSaveResponse, TaskDto lengkap). */
    private val tugasJson = """{"ok":true,"task":{"id":"t-9","projectId":"p-1","entityId":"e-1","workDate":"2026-10-12T17:00:00.000Z",""" +
        """"title":"A","status":"BERJALAN","urgency":"SEDANG","scope":"HARIAN","createdAt":"2026-10-13T00:00:00Z","updatedAt":"2026-10-13T00:00:00Z"}}"""

    private val laporanJson = """{"ok":true,"reportId":"r-1","submitted":true}"""

    private val entriBaru = EntriSimpanRequest(
        context = "HARIAN",
        title = "Pasang panel",
        description = null,
        picName = null,
        status = "BERJALAN",
        progressPct = 10,
        obstacle = null,
        decisionNeeded = null,
        achievementToday = null,
        followUp = null,
        needsEscalation = false,
        projectId = "p-1",
        workDate = "2026-10-13",
    )
    private val laporanBadan = DailyInputRequest(
        projectId = "p-1",
        action = "submit",
        status = "",
        achievementToday = "x",
        progressPct = 0,
        reportDate = "2026-10-13",
    )

    private fun periksa(metode: String, jalur: String) {
        val r = server.takeRequest()
        assertEquals(metode, r.method)
        assertEquals(jalur, r.path)
        assertEquals(kunci, r.getHeader(Idempotensi.HEADER))
    }

    @Test
    fun semuaRuteTulisMengirimHeaderKunci() = runBlocking<Unit> {
        server.enqueue(json(entriJson))
        server.enqueue(json(entriJson))
        server.enqueue(json(tugasJson))
        server.enqueue(json(tugasJson))
        server.enqueue(json(laporanJson))
        server.enqueue(json(laporanJson))

        assertTrue(entri.tambahEntri(entriBaru, kunci).isSuccessful)
        assertTrue(entri.ubahEntri(entriBaru.copy(id = "t-9", projectId = null, workDate = null), kunci).isSuccessful)
        assertTrue(tasks.buat(TaskSaveRequest(title = "A", projectId = "p-1"), kunci).isSuccessful)
        assertTrue(tasks.ubah(TaskSaveRequest(title = "A", id = "t-9"), kunci).isSuccessful)
        assertTrue(harian.simpan(laporanBadan, kunci).isSuccessful)
        assertTrue(laporan.kirim(laporanBadan, kunci).isSuccessful)

        periksa("POST", "/api/tasks")
        periksa("PUT", "/api/tasks")
        periksa("POST", "/api/tasks")
        periksa("PUT", "/api/tasks")
        periksa("PUT", "/api/daily-input")
        periksa("PUT", "/api/daily-input")
    }

    @Test
    fun hapusDanUnggahMengirimHeaderKunci() = runBlocking<Unit> {
        server.enqueue(json("""{"ok":true}"""))
        server.enqueue(
            json("""{"ok":true,"evidence":{"id":"e-1","fileName":"a.jpg","mime":"image/jpeg","size":3,"storageKey":"k","url":null,"createdAt":"2026-10-13T00:00:00Z"}}"""),
        )
        tasks.hapus(id = "t-9", konteks = "HARIAN", kunciIdempotensi = kunci)
        val teks = "text/plain".toMediaType()
        bukti.unggah(
            berkas = MultipartBody.Part.createFormData("file", "a.jpg", byteArrayOf(1, 2, 3).toRequestBody("image/jpeg".toMediaType())),
            targetType = "TASK".toRequestBody(teks),
            targetId = "t-9".toRequestBody(teks),
            kunciIdempotensi = kunci,
        )
        server.takeRequest().also {
            assertEquals("DELETE", it.method)
            assertEquals("/api/tasks?id=t-9&context=HARIAN", it.path)
            assertEquals(kunci, it.getHeader(Idempotensi.HEADER))
        }
        server.takeRequest().also {
            assertEquals("/api/evidence/upload", it.path)
            assertEquals(kunci, it.getHeader(Idempotensi.HEADER))
        }
    }

    @Test
    fun kunciNullTidakMengirimHeader() = runBlocking<Unit> {
        server.enqueue(json(entriJson))
        server.enqueue(json("""{"ok":true}"""))
        server.enqueue(json(laporanJson))
        entri.tambahEntri(entriBaru)
        tasks.hapus(id = "t-9", konteks = "HARIAN")
        laporan.kirim(laporanBadan)
        repeat(3) { assertNull(server.takeRequest().getHeader(Idempotensi.HEADER)) }
    }

    @Test
    fun responsUlanganTerdekodeSepertiSuksesBiasa() = runBlocking<Unit> {
        server.enqueue(json(entriJson))
        server.enqueue(json(entriJson, ulangan = true))
        val pertama = entri.tambahEntri(entriBaru, kunci)
        val ulang = entri.tambahEntri(entriBaru, kunci)
        assertTrue(pertama.isSuccessful && ulang.isSuccessful)
        assertFalse(Idempotensi.ulangan(pertama))
        assertTrue(Idempotensi.ulangan(ulang))
        // Badan ulangan = badan pertama → id server sama (penggantian id lokal tetap benar).
        assertEquals(pertama.body()!!.task!!.id, ulang.body()!!.task!!.id)
        assertEquals(kunci, server.takeRequest().getHeader(Idempotensi.HEADER))
        assertEquals(kunci, server.takeRequest().getHeader(Idempotensi.HEADER))
    }

    @Test
    fun kunciBaruUuidV4SesuaiPolaServer() {
        val semua = List(200) { Idempotensi.kunciBaru() }
        val uuidV4 = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
        semua.forEach {
            assertTrue(it, uuidV4.matches(it))
            assertTrue(Idempotensi.sah(it))
        }
        assertEquals(semua.size, semua.toSet().size)
        assertFalse(Idempotensi.sah(null))
        assertFalse(Idempotensi.sah("pendek"))
        assertFalse(Idempotensi.sah("-diawali-tanda-hubung"))
        assertFalse(Idempotensi.sah("spasi tidak boleh ada"))
        assertFalse(Idempotensi.sah("a".repeat(65)))
    }
}
