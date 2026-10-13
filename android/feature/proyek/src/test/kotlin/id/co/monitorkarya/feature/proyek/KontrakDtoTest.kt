package id.co.monitorkarya.feature.proyek

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.proyek.data.DaftarEskalasiDto
import id.co.monitorkarya.feature.proyek.data.DaftarOutputDto
import id.co.monitorkarya.feature.proyek.data.DaftarProyekDto
import id.co.monitorkarya.feature.proyek.data.GalatHapusDto
import id.co.monitorkarya.feature.proyek.data.KeputusanDto
import id.co.monitorkarya.feature.proyek.data.OpsiProyekDto
import id.co.monitorkarya.feature.proyek.data.ProyekBaruRequest
import id.co.monitorkarya.feature.proyek.data.RiwayatLaporanDto
import id.co.monitorkarya.feature.proyek.data.SimpanProyekDto
import id.co.monitorkarya.feature.proyek.data.TahapBaruRequest
import id.co.monitorkarya.feature.proyek.data.TahapanDto
import id.co.monitorkarya.feature.proyek.data.UbahProyekRequest
import id.co.monitorkarya.feature.proyek.data.UbahTahapRequest
import id.co.monitorkarya.feature.proyek.data.UsulanTenggatListDto
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dekode respons dan bentuk badan permintaan terhadap rute server yang sebenarnya. */
class KontrakDtoTest {

    private inline fun <reified T> dekode(s: String): T = mkJson.decodeFromString(s)

    private inline fun <reified T> keObjek(v: T): JsonObject = mkJson.encodeToJsonElement(kotlinx.serialization.serializer<T>(), v).jsonObject

    @Test
    fun daftarProyekFormatServerTerdekode() {
        val d = dekode<DaftarProyekDto>(
            Fixture.daftar(
                Fixture.proyek("p1", manage = true, setLifecycle = true),
                Fixture.proyek(
                    "p2",
                    lifecycle = "DIUSULKAN",
                    approve = true,
                    pendingRole = "DIREKTUR_ENTITAS",
                    latestReport = null,
                    targetEndDate = null,
                    chain = """["ADMIN_PT","DIREKTUR_ENTITAS"]""",
                    approvals = """[{"role":"ADMIN_PT","decision":"DISETUJUI","note":null,"decidedAt":"2026-09-02T03:00:00.000Z","decidedByName":"Budi"},{"role":"DIREKTUR_ENTITAS","decision":null,"note":null,"decidedAt":null,"decidedByName":null}]""",
                ),
                total = 7,
            ),
        )
        assertEquals(7, d.total)
        assertEquals(2, d.items.size)
        assertEquals(1, d.summary?.waiting)
        val p1 = d.items[0]
        assertEquals("Operasional", p1.division?.name)
        assertEquals("PT Sigma", p1.entity.name)
        assertEquals(40, p1.latestReport?.progressPct)
        assertTrue(p1.permissions.manage)
        assertTrue(p1.permissions.setLifecycle)
        assertFalse(p1.permissions.approve)
        val p2 = d.items[1]
        assertEquals("DIREKTUR_ENTITAS", p2.pendingRole)
        assertEquals(2, p2.approvals.size)
        assertNull(p2.approvals[1].decision)
        assertNull(p2.latestReport)
        assertNull(p2.targetEndDate)
        assertTrue(p2.permissions.approve)
    }

    @Test
    fun opsiFormulirTerdekode() {
        val o = dekode<OpsiProyekDto>(Fixture.opsi)
        assertTrue(o.entityPinned)
        assertEquals("e1", o.entity?.id)
        assertEquals(listOf("ADMIN_PT", "DIREKTUR_ENTITAS"), o.chain)
        assertEquals(2, o.candidates.first().activeProjects)
        assertEquals("Operasional", o.divisions.single().name)
    }

    @Test
    fun responsSimpanKeputusanDanGalatHapus() {
        val s = dekode<SimpanProyekDto>("""{"ok":true,"project":${Fixture.proyek("p9", lifecycle = "DIARSIPKAN")},"undoToken":"tok-1"}""")
        assertEquals("DIARSIPKAN", s.project?.lifecycle)
        assertEquals("tok-1", s.undoToken)
        // PATCH tanpa arsip: undoToken null.
        assertNull(dekode<SimpanProyekDto>("""{"ok":true,"project":${Fixture.proyek()},"undoToken":null}""").undoToken)
        val k = dekode<KeputusanDto>("""{"ok":true,"lifecycle":"DIUSULKAN","pending":"DIREKTUR_ENTITAS","approvals":[{"role":"ADMIN_PT","decision":"DISETUJUI","note":null,"decidedAt":"2026-10-13T03:00:00.000Z"}],"undoToken":"tok-2"}""")
        assertEquals("DIREKTUR_ENTITAS", k.pending)
        assertEquals("tok-2", k.undoToken)
        val g = dekode<GalatHapusDto>("""{"error":"Proyek ini sudah punya 3 laporan/task, jadi tidak dihapus agar riwayatnya utuh. Arsipkan saja.","activity":3,"canArchive":true}""")
        assertTrue(g.canArchive)
        assertEquals(3, g.activity)
    }

    @Test
    fun bagianDetailTerdekode() {
        val t = dekode<TahapanDto>(Fixture.tahapan)
        assertTrue(t.canEdit)
        assertEquals(2, t.items.size)
        assertEquals("TERTAHAN", t.items[1].status)
        assertNull(t.items[1].startDate)

        val u = dekode<UsulanTenggatListDto>(Fixture.usulan)
        assertFalse(u.canDecide)
        assertEquals("DIAJUKAN", u.items.single().status)
        assertEquals("Rani Kusuma", u.items.single().proposedByName)

        val l = dekode<RiwayatLaporanDto>(Fixture.laporan)
        assertEquals(2, l.items.size)
        assertEquals("Rani Kusuma", l.items[0].submittedBy?.name)
        assertNull(l.items[1].submittedBy)
        assertTrue(l.items[1].isLate)

        val o = dekode<DaftarOutputDto>(Fixture.output)
        assertEquals("PERLU_REVISI", o.items.single().status)
        assertEquals(1, o.counts["PERLU_REVISI"])

        val e = dekode<DaftarEskalasiDto>(Fixture.eskalasi)
        assertEquals(3, e.items.size)
        assertEquals("Rani Kusuma", e.items[0].raisedBy?.name)
        assertTrue(e.items[1].isOverdue)
    }

    @Test
    fun badanUbahSelaluMembawaPtTerkaitDanMelewatkanDivisiTakBerubah() {
        val o = keObjek(
            UbahProyekRequest(
                id = "p1", name = "Nama baru", description = "x".repeat(20), purpose = "", phase = "PELAKSANAAN",
                picUserId = "", startDate = "", targetEndDate = "2026-12-31", relatedEntityIds = emptyList(),
            ),
        )
        // PT terkait dikosongkan harus tetap terkirim (server: has('relatedEntityIds')).
        assertEquals(0, o["relatedEntityIds"]!!.jsonArray.size)
        // picUserId "" = kosongkan PIC (server menerima string kosong).
        assertEquals("\"\"", o["picUserId"].toString())
        // Divisi/siklus tidak berubah → tidak dikirim.
        assertFalse(o.containsKey("divisionId"))
        assertFalse(o.containsKey("lifecycle"))
    }

    @Test
    fun badanAjukanMelewatkanSkipApprovalFalse() {
        val o = keObjek(
            ProyekBaruRequest(
                name = "Proyek A", description = "d".repeat(20), purpose = "", phase = "", picUserId = "",
                divisionId = "", startDate = "", targetEndDate = "", relatedEntityIds = listOf("e2"),
            ),
        )
        assertFalse(o.containsKey("skipApproval"))
        assertFalse(o.containsKey("entityId"))
        assertEquals(1, o["relatedEntityIds"]!!.jsonArray.size)
        val lewati = keObjek(
            ProyekBaruRequest(
                name = "Proyek A", description = "d".repeat(20), purpose = "", phase = "INISIASI", picUserId = "",
                divisionId = "", startDate = "", targetEndDate = "", relatedEntityIds = emptyList(), entityId = "e1", skipApproval = true,
            ),
        )
        assertEquals("true", lewati["skipApproval"].toString())
        assertEquals("\"e1\"", lewati["entityId"].toString())
    }

    @Test
    fun badanTahapMengirimNullEksplisitAgarTanggalBisaDikosongkan() {
        val put = keObjek(UbahTahapRequest("s1", "Konstruksi", null, null, "BERJALAN", ""))
        // PUT parsial: 'startDate' in body → null menghapus tanggal.
        assertTrue(put.containsKey("startDate"))
        assertEquals(JsonNull, put["startDate"])
        val post = keObjek(TahapBaruRequest("p1", "Uji", "2026-10-01", null, "BELUM_MULAI", ""))
        assertEquals("\"2026-10-01\"", post["startDate"].toString())
        assertEquals(JsonNull, post["dueDate"])
    }
}
