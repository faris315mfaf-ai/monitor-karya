package id.co.monitorkarya.feature.entitas.data

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.entitas.perusahaan.emailUntukUbah
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * D2 — sapuan DTO permintaan modul :feature:entitas. Setiap badan POST/PATCH
 * disandikan dengan mkJson (encodeDefaults=false) dan diperiksa: medan yang
 * dibaca server (src/app/api/companies/route.ts, companies/users/route.ts,
 * companies/users/activation/route.ts) benar-benar ada di JSON, dan "" untuk
 * maksud "kosongkan" ikut terkirim (null = tidak terkirim = tidak diubah).
 */
class SandiPermintaanTest {

    private fun <T> sandi(s: KSerializer<T>, v: T): JsonObject =
        mkJson.parseToJsonElement(mkJson.encodeToString(s, v)).jsonObject

    @Test
    fun tambahPerusahaan_isHolding_dan_positions_selaluTerkirim() {
        // Nilai bawaan pun harus terkirim (pelajaran C2 K1 `resubmit`).
        val pt = sandi(TambahPerusahaanRequest.serializer(), TambahPerusahaanRequest(name = "PT Baru"))
        assertEquals("PT Baru", pt["name"]!!.jsonPrimitive.content)
        assertTrue("isHolding wajib ada", pt.containsKey("isHolding"))
        assertFalse(pt["isHolding"]!!.jsonPrimitive.boolean)
        assertTrue("positions wajib ada", pt.containsKey("positions"))
        assertEquals(0, (pt["positions"] as JsonArray).size)
        // Kolom opsional null tetap tidak terkirim.
        assertFalse(pt.containsKey("parentId"))
        assertFalse(pt.containsKey("code"))

        val holding = sandi(
            TambahPerusahaanRequest.serializer(),
            TambahPerusahaanRequest(
                name = "Holding",
                isHolding = true,
                positions = listOf(PosisiBaruRequest(role = "SUPERADMIN", name = "Rani", username = "rani")),
            ),
        )
        assertTrue(holding["isHolding"]!!.jsonPrimitive.boolean)
        val posisi = (holding["positions"] as JsonArray).single().jsonObject
        assertEquals(setOf("role", "name", "username"), posisi.keys)
    }

    @Test
    fun ubahPerusahaan_stringKosongTerkirimUntukMengosongkan() {
        // Rute membaca `body[k] !== undefined` → "" dikosongkan (null di DB).
        val obj = sandi(
            UbahPerusahaanRequest.serializer(),
            UbahPerusahaanRequest(id = "pt1", name = "PT A", address = "", phone = "", email = "", website = ""),
        )
        assertEquals(setOf("id", "name", "address", "phone", "email", "website"), obj.keys)
        assertEquals("", obj["phone"]!!.jsonPrimitive.content)

        // Aktif/nonaktif: false harus tetap terkirim (Boolean? bukan bawaan false).
        val status = sandi(UbahPerusahaanRequest.serializer(), UbahPerusahaanRequest(id = "pt1", isActive = false))
        assertEquals(setOf("id", "isActive"), status.keys)
        assertFalse(status["isActive"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun tambahAkun_medanWajibTerkirim() {
        val obj = sandi(
            TambahAkunRequest.serializer(),
            TambahAkunRequest(entityId = "pt1", name = "Dewi", username = "dewi", role = "KEPALA_DIVISI", divisionName = "Keuangan"),
        )
        assertEquals(setOf("entityId", "name", "username", "role", "divisionName"), obj.keys)

        // entityId null = tingkat grup; server membaca absen = null.
        val grup = sandi(TambahAkunRequest.serializer(), TambahAkunRequest(name = "A", username = "aa", role = "MANAJEMEN"))
        assertEquals(setOf("name", "username", "role"), grup.keys)
    }

    @Test
    fun ubahAkun_maksudKosongkanTerkirimSebagaiStringKosong() {
        val obj = sandi(
            UbahAkunRequest.serializer(),
            UbahAkunRequest(id = "u1", title = "", phone = "", entityId = "", memberDivisionId = "", isActive = false),
        )
        assertEquals(setOf("id", "title", "phone", "entityId", "memberDivisionId", "isActive"), obj.keys)
        assertEquals("", obj["entityId"]!!.jsonPrimitive.content)
        assertFalse(obj["isActive"]!!.jsonPrimitive.boolean)

        // Hanya id: tidak ada medan lain yang ikut (PATCH tidak menimpa apa pun).
        assertEquals(setOf("id"), sandi(UbahAkunRequest.serializer(), UbahAkunRequest(id = "u1")).keys)
    }

    @Test
    fun ubahAkun_emailDikosongkanTidakLagiSuksesPalsu() {
        // Akun punya email, isian dikosongkan → "" terkirim → server 422 (bukan 200 tanpa perubahan).
        val dikosongkan = sandi(UbahAkunRequest.serializer(), UbahAkunRequest(id = "u1", email = emailUntukUbah("  ", "a@x.id")))
        assertTrue(dikosongkan.containsKey("email"))
        assertEquals("", dikosongkan["email"]!!.jsonPrimitive.content)

        // Akun memang tanpa email → tidak terkirim (tidak berubah).
        assertNull(emailUntukUbah("", null))
        assertFalse(sandi(UbahAkunRequest.serializer(), UbahAkunRequest(id = "u1", email = emailUntukUbah("", null))).containsKey("email"))

        // Isian terisi → huruf kecil, terpangkas.
        assertEquals("rani@x.id", emailUntukUbah(" Rani@X.id ", "lama@x.id"))
    }

    @Test
    fun terbitkanAktivasi_userIdTerkirim() {
        val obj = sandi(TerbitkanAktivasiBody.serializer(), TerbitkanAktivasiBody(userId = "u9"))
        assertEquals(setOf("userId"), obj.keys)
        assertEquals("u9", obj["userId"]!!.jsonPrimitive.content)
    }
}
