package id.co.monitorkarya.feature.proyek

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.proyek.data.AjukanUlangRequest
import id.co.monitorkarya.feature.proyek.data.AksiUsulanRequest
import id.co.monitorkarya.feature.proyek.data.KeputusanRequest
import id.co.monitorkarya.feature.proyek.data.ProyekBaruRequest
import id.co.monitorkarya.feature.proyek.data.TahapBaruRequest
import id.co.monitorkarya.feature.proyek.data.UbahProyekRequest
import id.co.monitorkarya.feature.proyek.data.UbahStatusRequest
import id.co.monitorkarya.feature.proyek.data.UbahTahapRequest
import id.co.monitorkarya.feature.proyek.data.UrungkanRequest
import id.co.monitorkarya.feature.proyek.data.UrutanTahapRequest
import id.co.monitorkarya.feature.proyek.data.UsulTenggatRequest
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Sapu C2 K1: setiap badan permintaan disandikan dengan [mkJson] yang SAMA
 * dengan Retrofit (encodeDefaults=false). Medan yang wajib diterima server
 * harus ada di JSON walaupun nilainya sama dengan bawaan Kotlin.
 */
class PenyandianRequestTest {

    private fun <T> json(s: KSerializer<T>, v: T): JsonObject = mkJson.encodeToJsonElement(s, v).jsonObject

    private fun wajib(o: JsonObject, vararg kunci: String) {
        kunci.forEach { assertTrue("Medan wajib '$it' tidak terkirim: $o", o.containsKey(it)) }
    }

    @Test
    fun ajukanUlangSelaluMembawaResubmitTrue() {
        val teks = mkJson.encodeToString(AjukanUlangRequest.serializer(), AjukanUlangRequest("p1"))
        assertTrue(teks, teks.contains("\"resubmit\":true"))
        assertEquals("""{"id":"p1","resubmit":true}""", teks)
    }

    @Test
    fun semuaRequestProyekMembawaMedanWajib() {
        wajib(json(KeputusanRequest.serializer(), KeputusanRequest("p1", "DISETUJUI", "")), "projectId", "decision", "note")
        wajib(json(UbahStatusRequest.serializer(), UbahStatusRequest("p1", "DIARSIPKAN")), "id", "lifecycle")
        wajib(
            json(
                ProyekBaruRequest.serializer(),
                ProyekBaruRequest("Proyek A", "d".repeat(20), "", "", "", "", "", "", emptyList()),
            ),
            "name", "description", "purpose", "phase", "picUserId", "divisionId", "startDate", "targetEndDate", "relatedEntityIds",
        )
        wajib(
            json(
                UbahProyekRequest.serializer(),
                UbahProyekRequest(id = "p1", name = "Nama", description = "d".repeat(20), purpose = "", phase = "", picUserId = "", relatedEntityIds = emptyList()),
            ),
            "id", "name", "description", "purpose", "phase", "picUserId", "relatedEntityIds",
        )
        wajib(json(TahapBaruRequest.serializer(), TahapBaruRequest("p1", "Uji", null, null, "BELUM_MULAI", "")), "projectId", "name", "startDate", "dueDate", "status", "note")
        wajib(json(UbahTahapRequest.serializer(), UbahTahapRequest("s1", "Uji", null, null, "BELUM_MULAI", "")), "id", "name", "startDate", "dueDate", "status", "note")
        wajib(json(UrutanTahapRequest.serializer(), UrutanTahapRequest("p1", emptyList())), "projectId", "order")
        wajib(json(UsulTenggatRequest.serializer(), UsulTenggatRequest("p1", "2027-01-15", "Alasan cukup panjang")), "projectId", "proposedDate", "reason")
        wajib(json(AksiUsulanRequest.serializer(), AksiUsulanRequest("dp1", "undo")), "id", "action")
        wajib(json(UrungkanRequest.serializer(), UrungkanRequest("tok")), "token")
    }

    @Test
    fun ubahProyekTanggalTakBerubahTidakDikirimTetapiKosongDikirim() {
        val tanpa = json(
            UbahProyekRequest.serializer(),
            UbahProyekRequest(id = "p1", name = "Nama", description = "d".repeat(20), purpose = "", phase = "", picUserId = "", relatedEntityIds = emptyList()),
        )
        assertTrue(!tanpa.containsKey("startDate") && !tanpa.containsKey("targetEndDate"))
        val kosong = json(
            UbahProyekRequest.serializer(),
            UbahProyekRequest(
                id = "p1", name = "Nama", description = "d".repeat(20), purpose = "", phase = "", picUserId = "",
                relatedEntityIds = emptyList(), startDate = "",
            ),
        )
        // "" = kosongkan tanggal (server: has('startDate') → parseDate('') = null).
        assertEquals("\"\"", kosong["startDate"].toString())
    }
}
