package id.co.monitorkarya.app.ui.mejakadiv

import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.WeeklyAksiRequest
import id.co.monitorkarya.core.network.dto.WeeklyAksiResponse
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveRequest
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveResponse
import id.co.monitorkarya.core.network.dto.WeeklyMovesRequest
import id.co.monitorkarya.core.network.dto.WeeklyMovesResponse
import id.co.monitorkarya.core.network.mkJson
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
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
 * Meja kerja Kepala divisi (B1) terhadap bentuk route sebenarnya:
 * GET /api/work-desk cabang KADIV (kadivDesk) dan GET /api/weekly-input
 * (week/days/divisions[].report.items[]), POST /api/weekly-input 422 {error, errors[]}.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MejaKadivTest {

    companion object {
        const val JSON_MEJA = """
        {"kind":"KADIV","today":"2026-10-12T17:00:00.000Z",
         "divisions":[{"id":"div-1","name":"Teknologi","entityName":"PT Medcreatix",
           "history":[
             {"label":"M36","done":3,"total":4,"status":"DISETUJUI","onTime":true},
             {"label":"M37","done":2,"total":5,"status":"DISETUJUI","onTime":false},
             {"label":"M38","done":0,"total":0,"status":null,"onTime":false},
             {"label":"M39","done":4,"total":4,"status":"TERKUNCI","onTime":true},
             {"label":"M40","done":5,"total":6,"status":"DISETUJUI","onTime":true},
             {"label":"M41","done":1,"total":3,"status":"DRAFT","onTime":false}]}]}
        """

        private fun butir(id: String, status: String, bukti: Int, kendala: String?, workDate: String?) = """
            {"id":"$id","weeklyReportId":"wr-1","aspectCategoryId":"asp-1","workItem":"Butir $id",
             "targetOutput":"Target $id","picName":"Rani","picTitle":"Engineer","targetDate":null,
             "status":"$status","progressPct":50,"achievementThisWeek":"","obstacleFollowUp":${kendala?.let { "\"$it\"" } ?: "null"},
             "priorityId":"pr-1","needsEscalation":false,"evidenceCount":$bukti,"tags":[],"carriedOverFromId":null,
             "workDate":${workDate?.let { "\"$it\"" } ?: "null"},"position":0,"followUp":null,
             "createdAt":"2026-10-12T01:00:00.000Z","updatedAt":"2026-10-12T01:00:00.000Z",
             "aspectCategory":{"id":"asp-1","code":"SYS","name":"Sistem"},
             "priority":{"id":"pr-1","code":"SEDANG","name":"Sedang"},
             "subtasks":[],"evidence":[${buktiJson(id, bukti)}],"escalationRaised":false}
        """.trimIndent()

        /** Baris Evidence nyata sebanyak [n] (server memvalidasi baris ini, bukan evidenceCount). */
        private fun buktiJson(id: String, n: Int) = (1..n).joinToString(",") { k ->
            """{"id":"ev-$id-$k","targetId":"$id","fileName":"foto$k.jpg","url":null,"mime":"image/jpeg","size":1024,"createdAt":"2026-10-12T01:00:00.000Z"}"""
        }

        fun jsonPapan(submittedAt: String? = null, canApprove: Boolean = true) = """
        {"week":{"key":"2026-W42","isoYear":2026,"isoWeek":42,"start":"2026-10-11T17:00:00.000Z",
          "end":"2026-10-18T16:59:59.999Z","handoverBy":"2026-10-15T10:00:00.000Z","lockAt":"2026-10-16T10:00:00.000Z","current":true},
         "locked":false,"days":["2026-10-11T17:00:00.000Z","2026-10-12T17:00:00.000Z"],
         "weeks":[],"entities":[{"id":"ent-1","code":"MDC","name":"PT Medcreatix"}],"entityId":"ent-1","entityPinned":true,
         "aspects":[],"priorities":[],"canApprove":$canApprove,"canRemind":false,
         "divisions":[{"id":"div-1","name":"Teknologi","type":"Teknologi","headName":"Budi","writable":true,
           "lockReason":null,"frozen":false,"unlockUntil":null,
           "report":{"id":"wr-1","statusHeader":"${if (submittedAt != null) "MENUNGGU_PERSETUJUAN" else "DRAFT"}",
             "submittedAt":${submittedAt?.let { "\"$it\"" } ?: "null"},"approvedAt":null,"forwardedAt":null,"isLocked":false,
             "items":[
               ${butir("a", "SELESAI", 1, null, "2026-10-13")},
               ${butir("b", "ON_PROGRESS", 0, null, "2026-10-12T17:00:00.000Z")},
               ${butir("c", "TERKENDALA", 1, null, null)},
               ${butir("d", "NA", 0, null, null)}
             ]}}]}
        """.trimIndent()

        /** Selasa 13 Okt 2026 10.00 WIB. */
        val SEKARANG: Long = Instant.parse("2026-10-13T03:00:00Z").toEpochMilli()
    }

    private fun meja() = uraiMejaKadiv(mkJson.parseToJsonElement(JSON_MEJA) as JsonObject)
    private fun buatPapan(submittedAt: String? = null, canApprove: Boolean = true) =
        mkJson.decodeFromString(WeeklyInputResponse.serializer(), jsonPapan(submittedAt, canApprove))

    @Test
    fun meja_kadiv_terurai_dari_bentuk_route() {
        val m = meja()
        assertEquals("KADIV", m.kind)
        assertEquals(6, m.divisions.single().history.size)
        assertNull(m.divisions.single().history[2].status)
        assertTrue(m.divisions.single().history[0].onTime)
        // Kolom hilang tidak menjatuhkan urai.
        val kosong = uraiMejaKadiv(mkJson.parseToJsonElement("""{"kind":"KADIV"}""") as JsonObject)
        assertTrue(kosong.divisions.isEmpty())
    }

    @Test
    fun susunan_belum_diserahkan_mengikuti_kadiv_desk() {
        val p = buatPapan()
        val s = susunMejaKadiv(p, p.divisions.single(), meja(), SEKARANG)
        assertEquals(3, s.dihitung) // NA tidak dihitung
        assertEquals(1, s.selesai)
        assertEquals(1, s.terkendala)
        assertEquals(1, s.tanpaBukti) // b: berjalan tanpa bukti
        assertEquals(1, s.tanpaTindakLanjut)
        assertEquals(33, s.persen)
        assertFalse(s.diserahkan)
        assertEquals(AksiPrimerKadiv.SERAHKAN, s.aksiPrimer)
        assertEquals(listOf(true, false, false, false, false, false), s.syarat.map { it.ok })
        assertEquals("Paling lambat Kamis 17.00", s.syarat[3].petunjuk)
        assertEquals("1 dari 6 syarat penyerahan sudah terpenuhi.", s.jawaban)
        assertEquals(
            "1 item belum berbukti. 1 kendala belum punya tindak lanjut. Serahkan dalam 2 hari 7 jam, paling lambat Kamis 17.00.",
            s.pendukung,
        )
        // Perlu tindakan: b (tanpa bukti), c (terkendala tanpa tindak lanjut).
        assertEquals(listOf("b" to "Belum ada bukti", "c" to "Terkendala · tindak lanjut belum ditulis"), s.tindakan.map { it.butir.id to it.alasan })
        // Capaian hari ini: workDate kunci hari & ISO tengah malam WIB sama-sama cocok.
        assertEquals(listOf("a", "b"), s.hariIni.map { it.id })
        assertEquals(3, s.tepatWaktuSebelumnya)
        assertEquals("Capaian M42 · Belum diserahkan", s.lencanaKepala)
    }

    @Test
    fun susunan_sudah_diserahkan_menawarkan_setujui_atau_papan() {
        val p = buatPapan(submittedAt = "2026-10-13T02:30:00.000Z")
        val s = susunMejaKadiv(p, p.divisions.single(), meja(), SEKARANG)
        assertTrue(s.diserahkan)
        assertEquals(AksiPrimerKadiv.SETUJUI, s.aksiPrimer)
        assertEquals("Pukul 09.30", s.syarat[3].petunjuk)
        assertEquals("Capaian divisi Teknologi sudah diserahkan, 1 dari 3 item selesai.", s.jawaban)

        val p2 = buatPapan(submittedAt = "2026-10-13T02:30:00.000Z", canApprove = false)
        assertEquals(AksiPrimerKadiv.BUKA_PAPAN, susunMejaKadiv(p2, p2.divisions.single(), meja(), SEKARANG).aksiPrimer)
    }

    @Test
    fun e2e1_status_serah_mengikuti_status_header_dan_bukti_nyata() {
        // Seed: MENUNGGU_PERSETUJUAN tanpa submittedAt → tetap "Diserahkan" (sama dengan layar Capaian).
        val json = jsonPapan().replace("\"statusHeader\":\"DRAFT\"", "\"statusHeader\":\"MENUNGGU_PERSETUJUAN\"")
        val p = mkJson.decodeFromString(WeeklyInputResponse.serializer(), json)
        val s = susunMejaKadiv(p, p.divisions.single(), meja(), SEKARANG)
        assertTrue(s.diserahkan)
        assertEquals("Capaian M42 · Diserahkan", s.lencanaKepala)
    }

    @Test
    fun e2er2_n5_lencana_laporan_disetujui_ditulis_disetujui() {
        val json = jsonPapan().replace("\"statusHeader\":\"DRAFT\"", "\"statusHeader\":\"DISETUJUI\"")
        val p = mkJson.decodeFromString(WeeklyInputResponse.serializer(), json)
        val s = susunMejaKadiv(p, p.divisions.single(), meja(), SEKARANG)
        assertEquals("Capaian M42 · Disetujui", s.lencanaKepala)
    }

    @Test
    fun bantu_waktu_dan_galat() {
        assertEquals("kurang dari 1 menit", sisaPanjang(30_000))
        assertEquals("25 menit", sisaPanjang(25 * 60_000L))
        assertEquals("4 jam 10 menit", sisaPanjang((4 * 60 + 10) * 60_000L))
        assertEquals("2 hari 3 jam", sisaPanjang((51 * 60) * 60_000L))
        val g = galatAksi(
            Response.error<Any>(422, """{"error":"Capaian belum lengkap","errors":["Butir 1: bukti wajib","Butir 2: kendala wajib"]}""".toResponseBody()),
        )
        assertEquals("Capaian belum lengkap", g.first)
        assertEquals(2, g.second.size)
        assertEquals("Belum berhasil. Coba lagi.", galatAksi(Response.error<Any>(500, "bukan json".toResponseBody())).first)
    }

    // ------------------------------------------------------------------
    // ViewModel
    // ------------------------------------------------------------------

    private inner class MingguanPalsu : WeeklyInputApi {
        var diserahkan: String? = null
        val aksi = mutableListOf<WeeklyAksiRequest>()
        var tolak422 = false

        override suspend fun papan(entityId: String?, week: String?): Response<WeeklyInputResponse> = Response.success(buatPapan(diserahkan))

        override suspend fun aksi(body: WeeklyAksiRequest): Response<WeeklyAksiResponse> {
            aksi += body
            if (tolak422) {
                return Response.error(422, """{"error":"Capaian belum lengkap","errors":["Butir 2: bukti wajib"]}""".toResponseBody())
            }
            diserahkan = "2026-10-13T03:00:00.000Z"
            return Response.success(WeeklyAksiResponse(ok = true, statusHeader = "MENUNGGU_PERSETUJUAN"))
        }

        override suspend fun simpanButir(body: WeeklyItemSaveRequest): Response<WeeklyItemSaveResponse> = error("tidak dipakai")
        override suspend fun pindahkanButir(body: WeeklyMovesRequest): Response<WeeklyMovesResponse> = error("tidak dipakai")
        override suspend fun hapusButir(itemId: String): Response<OkResponse> = error("tidak dipakai")
    }

    private val mejaApi = object : MejaKadivApi {
        override suspend fun meja(): Response<JsonObject> = Response.success(mkJson.parseToJsonElement(JSON_MEJA) as JsonObject)
    }

    private val penjadwal = StandardTestDispatcher()

    @Before
    fun siapkan() = Dispatchers.setMain(penjadwal)

    @After
    fun bersihkan() = Dispatchers.resetMain()

    @Test
    fun vm_serahkan_mengirim_minggu_dan_divisi_lalu_memuat_ulang() = runTest(penjadwal) {
        val mingguan = MingguanPalsu()
        val vm = MejaKadivViewModel(mejaApi, mingguan)
        advanceUntilIdle()
        assertTrue(vm.ui.value.state is MejaKadivState.Siap)

        vm.serahkan()
        advanceUntilIdle()
        assertEquals(WeeklyAksiRequest("div-1", "2026-W42", "submit"), mingguan.aksi.single())
        assertEquals("Capaian Teknologi diserahkan ke Admin PT.", vm.ui.value.pesan?.teks)
        val siap = vm.ui.value.state as MejaKadivState.Siap
        assertEquals("2026-10-13T03:00:00.000Z", siap.papan.divisions.single().report?.submittedAt)
        assertNullOrEmpty(vm.ui.value.masalah)
    }

    @Test
    fun vm_422_menampilkan_daftar_perbaikan() = runTest(penjadwal) {
        val mingguan = MingguanPalsu().apply { tolak422 = true }
        val vm = MejaKadivViewModel(mejaApi, mingguan)
        advanceUntilIdle()
        vm.serahkan()
        advanceUntilIdle()
        assertEquals(listOf("Butir 2: bukti wajib"), vm.ui.value.masalah)
        assertEquals("Capaian belum lengkap", vm.ui.value.pesan?.teks)
        assertNull(vm.ui.value.sibuk)
    }

    private fun assertNullOrEmpty(l: List<String>) = assertTrue(l.isEmpty())
}
