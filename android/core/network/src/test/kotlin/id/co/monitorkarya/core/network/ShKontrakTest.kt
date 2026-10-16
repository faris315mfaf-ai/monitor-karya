package id.co.monitorkarya.core.network

import id.co.monitorkarya.core.network.dto.NavBadgesResponse
import id.co.monitorkarya.core.network.dto.ShCommentRequest
import id.co.monitorkarya.core.network.dto.ShDecisionRequest
import id.co.monitorkarya.core.network.dto.ShInboxReadRequest
import id.co.monitorkarya.core.network.dto.ShInboxResponse
import id.co.monitorkarya.core.network.dto.ShOptionsResponse
import id.co.monitorkarya.core.network.dto.ShOverviewResponse
import id.co.monitorkarya.core.network.dto.ShReportListResponse
import id.co.monitorkarya.core.network.dto.ShReportPatchRequest
import id.co.monitorkarya.core.network.dto.ShReportRequest
import id.co.monitorkarya.core.network.dto.ShReportResponse
import id.co.monitorkarya.core.network.dto.ShReviewResponse
import id.co.monitorkarya.core.network.dto.ShReviseRequest
import id.co.monitorkarya.core.network.dto.ShWeekResponse
import id.co.monitorkarya.core.network.dto.SignedRequest
import id.co.monitorkarya.core.network.dto.SignedResponse
import kotlinx.serialization.KSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kontrak kawat model subholding. Fixture di src/test/resources/sh direkam dari
 * server lokal (DB uji) oleh android/tools/rekam-fixture-sh.mjs — rekam ulang
 * bila rute web berubah. Badan permintaan dibandingkan sebagai JSON persis.
 */
class ShKontrakTest {

    private fun baca(nama: String): String =
        checkNotNull(javaClass.classLoader?.getResource("sh/$nama")) { "Fixture sh/$nama belum direkam" }.readText()

    private fun <T> dekode(s: KSerializer<T>, nama: String): T = mkJson.decodeFromString(s, baca(nama))

    private fun <T> kawat(s: KSerializer<T>, nilai: T): String = mkJson.encodeToString(s, nilai)

    @Test
    fun `pilihan form admin subholding terbaca`() {
        val o = dekode(ShOptionsResponse.serializer(), "options.json")
        assertTrue(o.subholding.id.isNotBlank())
        assertTrue(o.pts.isNotEmpty())
        assertTrue(o.pts.all { it.id.isNotBlank() && it.name.isNotBlank() })
        assertTrue(o.reporters.all { it.titleKind == "MANAJER" || it.titleKind == "KEPALA" })
    }

    @Test
    fun `daftar dan satu laporan terbaca lengkap`() {
        val daftar = dekode(ShReportListResponse.serializer(), "reports.json")
        assertTrue(daftar.items.isNotEmpty())
        assertTrue(daftar.total >= daftar.items.size)
        val r = daftar.items.first()
        assertTrue(r.id.isNotBlank() && r.ptName.isNotBlank() && r.kegiatan.isNotBlank())
        assertTrue(r.reportDate.matches(Regex("""\d{4}-\d{2}-\d{2}""")))
        assertTrue(r.status in setOf("MENUNGGU", "PERLU_PERBAIKAN", "DISETUJUI"))
        assertEquals(daftar.items.size, daftar.items.count { it.evidenceCount >= it.evidence.size || it.evidence.isEmpty() })
        val total = daftar.counts.menunggu + daftar.counts.perluPerbaikan + daftar.counts.disetujui
        assertEquals(daftar.total, total)

        val satu = dekode(ShReportResponse.serializer(), "report.json").report
        assertEquals(r.id, satu.id)
        // Admin subholding tidak pernah menerima catatan sorotan (catatan untuk manajemen).
        assertNull(satu.highlightNote)
    }

    @Test
    fun `kotak masuk admin terbaca`() {
        val k = dekode(ShInboxResponse.serializer(), "inbox.json")
        assertTrue(k.items.isNotEmpty())
        assertTrue(k.unreadCount >= 0)
        assertTrue(k.items.all { it.id.isNotBlank() && it.createdAt.isNotBlank() })
        assertTrue(k.items.any { it.report != null })
    }

    @Test
    fun `antrean supervisor membawa umur terlama, rekap, dan sorotan`() {
        val m = dekode(ShReviewResponse.serializer(), "review-menunggu.json")
        assertTrue(m.items.all { it.status == "MENUNGGU" })
        assertTrue(m.subholdings.isNotEmpty())
        val adaAntrean = m.subholdings.filter { it.waiting > 0 }
        assertTrue(adaAntrean.all { it.oldestAt != null })
        assertTrue(m.subholdings.filter { it.waiting == 0 }.all { it.oldestAt == null })
        assertTrue(m.today != null)

        val d = dekode(ShReviewResponse.serializer(), "review-disetujui.json")
        assertTrue(d.items.isNotEmpty())
        assertTrue(d.items.all { it.status == "DISETUJUI" && it.decidedAt != null })
        assertTrue(d.items.any { it.highlight && !it.highlightNote.isNullOrBlank() })
        assertTrue(d.items.flatMap { it.comments }.all { it.kind.isNotBlank() })
    }

    @Test
    fun `ringkasan manajemen dan pola 7 hari terbaca`() {
        val o = dekode(ShOverviewResponse.serializer(), "overview.json")
        assertTrue(o.date.isNotBlank())
        assertTrue(o.subholdings.all { it.allPts.isNotEmpty() || it.ptCount == 0 })
        val laporan = o.subholdings.flatMap { s -> s.pts.flatMap { it.reports } }
        assertTrue(laporan.isNotEmpty())
        assertTrue(laporan.all { it.id.isNotBlank() && it.kegiatan.isNotBlank() })

        val w = dekode(ShWeekResponse.serializer(), "week.json")
        assertEquals(7, w.days.size)
        assertEquals(w.end, w.days.last())
        assertTrue(w.subholdings.all { it.counts.size == 7 && it.pts.isEmpty() })

        val ws = dekode(ShWeekResponse.serializer(), "week-sub.json")
        assertEquals(1, ws.subholdings.size)
        assertTrue(ws.subholdings.single().pts.isNotEmpty())
        assertTrue(ws.subholdings.single().pts.all { it.counts.size == 7 })
    }

    @Test
    fun `lencana navigasi supervisor`() {
        val b = dekode(NavBadgesResponse.serializer(), "nav-badges.json")
        assertTrue((b.badges["sh-review"] ?: -1) >= 0)
    }

    @Test
    fun `respons minimal dan medan asing tetap terbaca`() {
        val r = mkJson.decodeFromString(
            ShReportListResponse.serializer(),
            """{"items":[{"id":"r1","decidedAt":null,"evidenceCount":null,"barang":"baru"}],"lain":1}""",
        )
        val satu = r.items.single()
        assertEquals("r1", satu.id)
        assertEquals(0, satu.evidenceCount)
        assertFalse(satu.highlight)
        assertEquals(0, r.counts.menunggu)
        val s = mkJson.decodeFromString(SignedResponse.serializer(), """{"items":[{"id":"e1","url":"https://x/y"}]}""")
        assertEquals("file", s.items.single().kind)
    }

    @Test
    fun `badan permintaan persis seperti yang diharapkan server`() {
        assertEquals(
            """{"kegiatan":"Pengecoran","deskripsi":"Lantai 3","ptId":"pt1","reporterName":"Budi","reporterTitleKind":"MANAJER","reporterTitleField":"Proyek"}""",
            kawat(ShReportRequest.serializer(), ShReportRequest("Pengecoran", "Lantai 3", "pt1", "Budi", "MANAJER", "Proyek")),
        )
        assertEquals("""{"kegiatan":"X"}""", kawat(ShReportPatchRequest.serializer(), ShReportPatchRequest(kegiatan = "X")))
        assertEquals("""{}""", kawat(ShReportPatchRequest.serializer(), ShReportPatchRequest()))
        // Setujui: highlight SELALU terkirim walau false (paritas decisionBody web).
        assertEquals("""{"highlight":false,"action":"approve"}""", kawat(ShDecisionRequest.serializer(), ShDecisionRequest()))
        assertEquals(
            """{"note":"Bagus","highlight":true,"highlightNote":"Perlu keputusan direksi","action":"approve"}""",
            kawat(ShDecisionRequest.serializer(), ShDecisionRequest("Bagus", true, "Perlu keputusan direksi")),
        )
        // Minta perbaikan: tanpa medan sorotan.
        assertEquals("""{"note":"Tambah foto","action":"revise"}""", kawat(ShReviseRequest.serializer(), ShReviseRequest("Tambah foto")))
        assertEquals("""{"body":"Sudah diperbaiki"}""", kawat(ShCommentRequest.serializer(), ShCommentRequest("Sudah diperbaiki")))
        assertEquals("""{"all":true}""", kawat(ShInboxReadRequest.serializer(), ShInboxReadRequest(all = true)))
        assertEquals("""{"ids":["a","b"]}""", kawat(ShInboxReadRequest.serializer(), ShInboxReadRequest(ids = listOf("a", "b"))))
        assertEquals(
            """{"ids":["e1"],"size":"thumb"}""",
            kawat(SignedRequest.serializer(), SignedRequest(listOf("e1"), SignedRequest.UKURAN_THUMB)),
        )
        assertEquals("""{"ids":["e1"]}""", kawat(SignedRequest.serializer(), SignedRequest(listOf("e1"))))
    }
}
