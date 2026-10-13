package id.co.monitorkarya.feature.ringkasangrup.data

import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * D2 — sapuan DTO permintaan modul :feature:ringkasangrup (mkJson,
 * encodeDefaults=false):
 *  - POST/DELETE /api/ringkasan/laporan-dibaca {weeklyReportId} — wajib.
 *  - POST /api/notifications/remind {entityId, divisionId, week?} — `week`
 *    absen/null = minggu berjalan di server; bila layar menampilkan minggu
 *    lain, kuncinya harus terkirim.
 */
class SandiPermintaanTest {

    private fun <T> sandi(s: KSerializer<T>, v: T): JsonObject =
        mkJson.parseToJsonElement(mkJson.encodeToString(s, v)).jsonObject

    @Test
    fun tandaDibaca_weeklyReportIdTerkirim() {
        val obj = sandi(TandaDibacaRequest.serializer(), TandaDibacaRequest("w1"))
        assertEquals(setOf("weeklyReportId"), obj.keys)
        assertEquals("w1", obj["weeklyReportId"]!!.jsonPrimitive.content)
    }

    @Test
    fun ingatkanDivisi_entitasDivisiDanMingguTerkirim() {
        val obj = sandi(IngatkanDivisiRequest.serializer(), IngatkanDivisiRequest("pt1", "d1", "2026-W41"))
        assertEquals(setOf("entityId", "divisionId", "week"), obj.keys)
        assertEquals("2026-W41", obj["week"]!!.jsonPrimitive.content)

        // week null = minggu berjalan (server: absen/null/"" sama).
        val berjalan = sandi(IngatkanDivisiRequest.serializer(), IngatkanDivisiRequest("pt1", "d1"))
        assertEquals(setOf("entityId", "divisionId"), berjalan.keys)
    }
}
