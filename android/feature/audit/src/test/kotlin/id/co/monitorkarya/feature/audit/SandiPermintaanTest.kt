package id.co.monitorkarya.feature.audit

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.audit.data.PutusanAksesRequest
import id.co.monitorkarya.feature.audit.sistem.Putusan
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * D2 — sapuan DTO permintaan modul :feature:audit. Satu-satunya badan tulis
 * adalah PATCH /api/access-requests {id, decision, note?}; server menolak 400
 * bila `decision` bukan approve|reject, jadi medan itu wajib ada di JSON
 * walau mkJson memakai encodeDefaults=false.
 */
class SandiPermintaanTest {

    private fun <T> sandi(s: KSerializer<T>, v: T): JsonObject =
        mkJson.parseToJsonElement(mkJson.encodeToString(s, v)).jsonObject

    @Test
    fun putusanAkses_decisionSelaluTerkirim() {
        for (p in Putusan.entries) {
            val obj = sandi(PutusanAksesRequest.serializer(), PutusanAksesRequest(id = "r1", decision = p.kode))
            assertEquals(setOf("id", "decision"), obj.keys)
            assertEquals(p.kode, obj["decision"]!!.jsonPrimitive.content)
        }
        assertEquals(setOf("approve", "reject"), Putusan.entries.map { it.kode }.toSet())

        val catatan = sandi(PutusanAksesRequest.serializer(), PutusanAksesRequest(id = "r1", decision = "reject", note = "Bukan wewenang."))
        assertEquals(setOf("id", "decision", "note"), catatan.keys)
    }
}
