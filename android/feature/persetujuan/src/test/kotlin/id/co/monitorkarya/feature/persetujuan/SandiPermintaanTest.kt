package id.co.monitorkarya.feature.persetujuan

import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * D2 — sapuan DTO permintaan modul :feature:persetujuan. mkJson memakai
 * encodeDefaults=false; medan yang dibaca server harus tetap ada di JSON:
 *  - PATCH approval-requests / deadline-proposals: `id` + `action`
 *    (approve|reject|undo; selain itu 400) + `note` (wajib ≥5 untuk reject).
 *  - POST projects/approve: `projectId` + `decision` (DISETUJUI|DITOLAK; selain itu ditolak).
 */
class SandiPermintaanTest {

    private fun <T> sandi(s: KSerializer<T>, v: T): JsonObject =
        mkJson.parseToJsonElement(mkJson.encodeToString(s, v)).jsonObject

    @Test
    fun keputusan_actionSelaluTerkirimUntukSetiapAksi() {
        for (aksi in listOf(KeputusanRequest.SETUJUI, KeputusanRequest.TOLAK, KeputusanRequest.URUNGKAN)) {
            val obj = sandi(KeputusanRequest.serializer(), KeputusanRequest("a1", aksi))
            assertEquals(setOf("id", "action"), obj.keys)
            assertEquals(aksi, obj["action"]!!.jsonPrimitive.content)
        }
        val tolak = sandi(KeputusanRequest.serializer(), KeputusanRequest("a1", KeputusanRequest.TOLAK, "Anggaran habis."))
        assertEquals(setOf("id", "action", "note"), tolak.keys)
        assertEquals("Anggaran habis.", tolak["note"]!!.jsonPrimitive.content)
    }

    @Test
    fun keputusanProyek_decisionSelaluTerkirim() {
        for (putusan in listOf("DISETUJUI", "DITOLAK")) {
            val obj = sandi(KeputusanProyekRequest.serializer(), KeputusanProyekRequest("p1", putusan))
            assertEquals(setOf("projectId", "decision"), obj.keys)
            assertEquals(putusan, obj["decision"]!!.jsonPrimitive.content)
        }
        val catatan = sandi(KeputusanProyekRequest.serializer(), KeputusanProyekRequest("p1", "DITOLAK", "Lingkup ganda."))
        assertEquals(setOf("projectId", "decision", "note"), catatan.keys)
    }
}
