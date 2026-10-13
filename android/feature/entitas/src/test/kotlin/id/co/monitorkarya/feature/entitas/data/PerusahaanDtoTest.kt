package id.co.monitorkarya.feature.entitas.data

import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Dekode/sandi DTO tab Perusahaan terhadap bentuk rute sebenarnya:
 * src/app/api/companies/route.ts dan src/app/api/companies/users(+/activation).
 * Penyandian PATCH diuji karena rute akun membaca `body.x !== undefined`
 * sebagai "ubah x": kolom null wajib tidak terkirim.
 */
class PerusahaanDtoTest {

    private inline fun <reified T> urai(json: String): T = mkJson.decodeFromString(json)

    private inline fun <reified T> sandi(v: T): JsonObject = mkJson.parseToJsonElement(mkJson.encodeToString(v)).jsonObject

    @Test
    fun mejaPenuhSuperAdmin() {
        val dto = urai<MejaPerusahaanResponse>(
            """
            {
              "companies": [
                { "id": "h1", "code": "HOLDING-KARYA", "name": "Holding Karya", "type": "HOLDING", "parentId": null,
                  "logoData": null, "address": null, "phone": null, "email": null, "website": null, "isActive": true,
                  "createdAt": "2026-01-01T00:00:00.000Z", "parentName": null,
                  "users": [], "divisions": [], "projects": [],
                  "counts": { "users": 0, "divisions": 0, "projects": 0, "dailyReports": 0, "weeklyReports": 0 } },
                { "id": "pt1", "code": "PT-MED", "name": "PT Medcreatix", "type": "PT", "parentId": "h1",
                  "logoData": "data:image/png;base64,AAAA", "address": "Jl. A", "phone": "+62 21", "email": "pt@x.id",
                  "website": "https://x.id", "isActive": true, "createdAt": "2026-01-01T00:00:00.000Z", "parentName": "Holding Karya",
                  "users": [
                    { "id": "u1", "name": "Rani", "username": "rani", "email": "rani@x.id", "role": "ADMIN_PT", "title": null,
                      "phone": null, "isActive": true, "lastLoginAt": "2026-10-08T01:00:00.000Z", "avatarColor": "#2563eb",
                      "scopeEntityId": "pt1", "hasPassword": true, "divisionId": null, "divisionName": null,
                      "projectId": null, "projectName": null }
                  ],
                  "divisions": [ { "id": "d1", "name": "Keuangan", "headUserId": null, "headName": null } ],
                  "projects": [ { "id": "p1", "code": "PT-MED-PRJ-01", "name": "Gedung A", "lifecycle": "AKTIF", "picUserId": "u9", "picName": "Citra" } ],
                  "counts": { "users": 1, "divisions": 1, "projects": 1, "dailyReports": 12, "weeklyReports": 3 } }
              ],
              "holdingUsers": [
                { "id": "sa", "name": "Super", "username": "super", "email": "sa@x.id", "role": "SUPERADMIN", "title": null,
                  "phone": null, "isActive": true, "lastLoginAt": null, "avatarColor": null, "scopeEntityId": null,
                  "hasPassword": false, "divisionId": null, "divisionName": null, "projectId": null, "projectName": null }
              ],
              "totals": { "companies": 2, "users": 2, "divisions": 1, "projects": 1 },
              "me": "sa",
              "scope": "ALL",
              "canManageCompanies": true,
              "manageableRoles": ["PIC_PROYEK","KEPALA_DIVISI","ADMIN_PT","DIREKTUR_ENTITAS","DIREKTUR_SDM_GA","MANAJEMEN","TI","SUPERADMIN","AUDITOR"]
            }
            """.trimIndent(),
        )
        assertTrue(dto.canManageCompanies)
        assertEquals("ALL", dto.scope)
        assertEquals(9, dto.manageableRoles.size)
        assertEquals("Holding Karya", dto.companies[1].parentName)
        assertEquals(12, dto.companies[1].counts.dailyReports)
        assertFalse(dto.holdingUsers.single().hasPassword)
        assertEquals("u9", dto.companies[1].projects.single().picUserId)
    }

    @Test
    fun mejaTerbatasAdminPt() {
        val dto = urai<MejaPerusahaanResponse>(
            """
            { "companies": [], "holdingUsers": [], "totals": { "companies": 0, "users": 0, "divisions": 0, "projects": 0 },
              "me": "u1", "scope": "ENTITY", "canManageCompanies": false,
              "manageableRoles": ["ADMIN_PT","KEPALA_DIVISI","PIC_PROYEK"] }
            """.trimIndent(),
        )
        assertFalse(dto.canManageCompanies)
        assertEquals(listOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK"), dto.manageableRoles)
    }

    @Test
    fun jawabanTambahPerusahaanDanAkun() {
        val p = urai<TambahPerusahaanResponse>(
            """{ "ok": true, "entity": { "id": "pt9", "code": "PT-BARU", "name": "PT Baru" },
                 "accounts": [ { "id": "u9", "name": "Dewi", "role": "KEPALA_DIVISI", "username": "dewi", "email": "dewi@karya.co.id", "divisionId": "d9" } ] }""",
        )
        assertEquals("pt9", p.entity!!.id)
        assertEquals("d9", p.accounts.single().divisionId)
        val a = urai<AkunTersimpanResponse>(
            """{ "ok": true, "account": { "id": "u1", "name": "Rani", "username": "rani", "email": "rani@x.id",
                 "role": "ADMIN_PT", "title": null, "isActive": false, "scopeEntityId": "pt1" } }""",
        )
        assertEquals(false, a.account!!.isActive)
    }

    @Test
    fun aktivasi_tokenHanyaDiPath() {
        val j = urai<TerbitkanAktivasiJawaban>(
            """{ "ok": true, "activation": { "userId": "u3", "username": "citra",
                 "path": "/login/aktivasi#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ", "expiresAt": "2026-10-11T05:00:00.000Z" } }""",
        )
        assertTrue(j.activation!!.path.startsWith("/login/aktivasi#token="))
        assertTrue(urai<KelayakanAktivasiDto>("""{ "canActivate": true }""").canActivate)
        assertNull(urai<KeanggotaanAkunDto>("""{ "id": "u1", "memberDivisionId": null }""").memberDivisionId)
    }

    @Test
    fun patchAkun_kolomNullTidakTerkirim() {
        val obj = sandi(UbahAkunRequest(id = "u1", isActive = false))
        assertEquals(setOf("id", "isActive"), obj.keys)
        // "" = sengaja mengosongkan keanggotaan divisi.
        val lepas = sandi(UbahAkunRequest(id = "u1", memberDivisionId = ""))
        assertEquals("", lepas["memberDivisionId"]!!.jsonPrimitive.content)
        val perusahaan = sandi(UbahPerusahaanRequest(id = "pt1", isActive = true))
        assertEquals(setOf("id", "isActive"), perusahaan.keys)
    }

    @Test
    fun postPerusahaan_posisiTerkirim() {
        val obj = sandi(
            TambahPerusahaanRequest(
                name = "PT Baru",
                parentId = "h1",
                positions = listOf(PosisiBaruRequest(role = "ADMIN_PT", name = "Dewi", username = "dewi")),
            ),
        )
        assertEquals("PT Baru", obj["name"]!!.jsonPrimitive.content)
        assertTrue("positions" in obj.keys)
        assertFalse("code" in obj.keys)
    }
}
