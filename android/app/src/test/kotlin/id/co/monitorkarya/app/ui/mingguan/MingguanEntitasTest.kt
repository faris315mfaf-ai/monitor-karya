package id.co.monitorkarya.app.ui.mingguan

import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.mkJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * D1: pemilih PT capaian mingguan untuk TI/Super Admin. Bentuk JSON dari
 * GET /api/weekly-input (src/app/api/weekly-input/route.ts): `entities`,
 * `entityId`, `entityPinned: !isMasterRole(role)`.
 */
class MingguanEntitasTest {

    private fun respons(pinned: Boolean, entityId: String?) = mkJson.decodeFromString(
        WeeklyInputResponse.serializer(),
        """
        {"week":{"key":"2026-W42","isoYear":2026,"isoWeek":42,"start":"2026-10-12","end":"2026-10-18",
                 "handoverBy":"2026-10-15T10:00:00.000Z","lockAt":"2026-10-16T10:00:00.000Z"},
         "entities":[{"id":"e1","code":"TPD","name":"PT Tunas"},{"id":"e2","code":"KRY","name":""}],
         "entityId":${entityId?.let { "\"$it\"" } ?: "null"},"entityPinned":$pinned,
         "divisions":[]}
        """.trimIndent(),
    )

    @Test
    fun peran_master_mendapat_daftar_pt_dan_pilihan_dipertahankan() {
        val papan = papanDari(respons(pinned = false, entityId = "e2"))
        assertFalse(papan.entitasTerpaku)
        assertEquals(listOf("e1", "e2"), papan.entitas.map { it.id })
        // Nama kosong jatuh ke kode PT.
        assertEquals(listOf("PT Tunas", "KRY"), papan.entitas.map { it.label })
        assertEquals("e2", papan.entitasId)
        // Muat ulang / aksi berikutnya tetap di PT yang sama (GET ?entityId=e2).
        assertEquals("e2", entitasSetelahMuat(papan))
    }

    @Test
    fun peran_berlingkup_terpaku_tidak_mengirim_entity_id() {
        val papan = papanDari(respons(pinned = true, entityId = "e1"))
        assertTrue(papan.entitasTerpaku)
        assertNull(entitasSetelahMuat(papan))
    }
}
