package id.co.monitorkarya.feature.persetujuan

import id.co.monitorkarya.core.network.mkJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dekode DTO terhadap JSON rute server sebenarnya + fungsi murni model. */
class PersetujuanDtoTest {

    @Test
    fun `ringkasan - bagian persetujuan terbaca, kolom lain diabaikan`() {
        val r = mkJson.decodeFromString(RingkasanPersetujuanResponse.serializer(), JSON_RINGKASAN)
        assertFalse(r.scope.global)
        assertEquals(3, r.scope.entities)
        assertEquals(true, r.viewer?.canDecideApproval)
        assertEquals(2, r.approvalRequests.size)
        val a = r.approvalRequests[0]
        assertEquals("ANGGARAN", a.type)
        assertEquals(48_500_000L, a.amount)
        assertEquals("rincian.pdf", a.file?.name)
        assertEquals(245_000L, a.file?.size)
        assertEquals("Aplikasi Absensi", r.deadlineProposals.single().projectName)
        assertEquals("DIREKTUR_ENTITAS", r.decisions.single().slot)
        assertTrue(r.escalations.single().overdue)
    }

    @Test
    fun `ringkasan lama tanpa kolom persetujuan tetap terbaca`() {
        val r = mkJson.decodeFromString(RingkasanPersetujuanResponse.serializer(), """{"kind":"RINGKASAN","week":41}""")
        assertNull(r.viewer)
        assertTrue(r.approvalRequests.isEmpty())
        val meja = susunMeja(r, emptyMap())
        assertTrue(meja.kosong)
        assertEquals("Semua persetujuan sudah beres.", meja.jawaban)
        assertEquals("0 perusahaan", meja.konteks)
    }

    @Test
    fun `riwayat decided=1 dan badan PATCH`() {
        val res = mkJson.decodeFromString(DaftarPermintaanResponse.serializer(), JSON_RIWAYAT)
        assertTrue(res.canDecide)
        assertEquals(15, res.undoMinutes)
        val r = res.items.mapNotNull { it.keRiwayat() }
        assertEquals(1, r.size)
        assertEquals(Keputusan.DITOLAK, r[0].keputusan)
        assertEquals("Anggaran sudah terpakai.", r[0].catatan)
        assertTrue(r[0].sub.startsWith("Budi Santoso · Rp 2 jt · Sari Direktur"))

        assertEquals(
            """{"id":"a1","action":"approve"}""",
            mkJson.encodeToString(KeputusanRequest.serializer(), KeputusanRequest("a1", KeputusanRequest.SETUJUI)),
        )
        assertEquals(
            """{"projectId":"p1","decision":"DITOLAK","note":"Lingkup ganda."}""",
            mkJson.encodeToString(KeputusanProyekRequest.serializer(), KeputusanProyekRequest("p1", "DITOLAK", "Lingkup ganda.")),
        )
        val proyek = mkJson.decodeFromString(
            KeputusanProyekResponse.serializer(),
            """{"ok":true,"lifecycle":"DIUSULKAN","pending":"MANAJEMEN","approvals":[],"undoToken":"t-9"}""",
        )
        assertEquals("t-9", proyek.undoToken)
        assertEquals("https://x/y", mkJson.decodeFromString(TautanBerkasResponse.serializer(), """{"url":"https://x/y"}""").url)
    }

    @Test
    fun `meja - item, meta, dan kalimat sama dengan web`() {
        val r = mkJson.decodeFromString(RingkasanPersetujuanResponse.serializer(), JSON_RINGKASAN)
        val meja = susunMeja(r, emptyMap())
        assertEquals("4 persetujuan menunggu keputusan Anda.", meja.jawaban)
        assertEquals("3 perusahaan", meja.konteks)

        val anggaran = meja.permintaan[0]
        assertEquals("Anggaran: Revisi anggaran Renovasi Ruang IT", anggaran.judul)
        assertEquals("Rp 48,5 jt", anggaran.meta)
        assertEquals("Rp 48.500.000", anggaran.nominalPenuh)
        assertEquals("Anggaran · Divisi Teknologi · SIM RS · PT Bhakti Rahayu", anggaran.barisJenis)
        assertEquals(BerkasInfo("rincian.pdf", "239 KB"), anggaran.berkas)
        assertEquals("BS", anggaran.inisial)

        val cuti = meja.permintaan[1]
        assertEquals("Cuti 3 hari", cuti.judul)
        assertEquals("14 Okt–16 Okt", cuti.meta)
        assertEquals("14 Okt–16 Okt", cuti.rentang)

        val tenggat = meja.tenggat.single()
        assertEquals("Geser tenggat Aplikasi Absensi ke 31 Okt", tenggat.judul)
        assertEquals("semula 24 Okt", tenggat.meta)
        assertEquals("Tenggat Aplikasi Absensi digeser ke 31 Okt.", pesanKeputusan(tenggat, true))

        val proyek = meja.proyek.single()
        assertEquals("Proyek baru: Portal Pasien", proyek.judul)
        assertEquals("Pengajuan proyek · PT Medika · Slot Direktur entitas", proyek.barisJenis)

        assertEquals("Rani Kusuma · butuh anggaran", meja.eskalasi.single().alasan)
        assertEquals("lewat SLA, 9 hari", meja.eskalasi.single().meta)

        // Keputusan lokal mengurangi hitungan menunggu.
        val sesudah = susunMeja(r, mapOf(anggaran.kunci to Keputusan.DISETUJUI))
        assertEquals("3 persetujuan menunggu keputusan Anda.", sesudah.jawaban)
        assertEquals(Keputusan.DISETUJUI, sesudah.permintaan[0].keputusan)
    }

    @Test
    fun `izin dari server - viewer menentukan tombol`() {
        val r = mkJson.decodeFromString(RingkasanPersetujuanResponse.serializer(), JSON_RINGKASAN)
        val pantau = r.copy(viewer = PemirsaDto(canDecideApproval = false, canDecideDeadline = false))
        val meja = susunMeja(pantau, emptyMap())
        assertTrue(meja.permintaan.none { it.bisaPutuskan })
        // Web: canDecideDeadline === false → usulan tenggat tidak ditampilkan.
        assertTrue(meja.tenggat.isEmpty())
        assertEquals("Cuti Budi Santoso disetujui dan dicatat di kehadiran.", pesanKeputusan(meja.permintaan[1], true))
        assertEquals("Anggaran \"Revisi anggaran Renovasi Ruang IT\" disetujui.", pesanKeputusan(meja.permintaan[0], true))
    }

    @Test
    fun `format nominal dan ukuran`() {
        assertEquals("Rp 750.000", rupiahRingkas(750_000))
        assertEquals("Rp 1,2 M", rupiahRingkas(1_200_000_000))
        assertEquals("Rp 2 jt", rupiahRingkas(2_000_000))
        assertEquals("900 B", ukuranBerkas(900))
        assertEquals("1,4 MB", ukuranBerkas(1_468_006))
    }

    companion object {
        /** Potret /api/ringkasan (Direktur entitas) — hanya kolom relevan + beberapa kolom lain. */
        val JSON_RINGKASAN = """
            {"kind":"RINGKASAN","week":42,"scope":{"entities":3,"divisions":7,"global":false},
             "projects":[],"counts":{"on":1,"risk":0,"late":0,"done":0,"neutral":0},
             "deadlineProposals":[{"id":"dp1","projectId":"p9","projectName":"Aplikasi Absensi","entityName":"PT Bhakti Rahayu",
               "divisionId":null,"proposer":"Rani Kusuma","proposedAt":"2026-10-12T03:00:00.000Z",
               "previousDate":"2026-10-23T17:00:00.000Z","proposedDate":"2026-10-30T17:00:00.000Z",
               "reason":"Integrasi mesin absensi tertunda vendor."}],
             "viewer":{"canRemind":true,"canMarkRead":true,"canDecideDeadline":true,"canComment":true,
               "canReview":true,"canNote":true,"canDecideApproval":true},
             "approvalRequests":[
               {"id":"ar1","type":"ANGGARAN","title":"Revisi anggaran Renovasi Ruang IT","description":"Kenaikan harga AC.",
                "amount":48500000,"entityId":"e1","entityName":"PT Bhakti Rahayu","entityCode":"BRH",
                "divisionId":"d1","divisionName":"Teknologi","projectId":"p1","projectName":"SIM RS",
                "requestedById":"u1","requester":"Budi Santoso","requesterRole":"KEPALA_DIVISI",
                "startDate":null,"endDate":null,"status":"DIAJUKAN","decidedBy":null,"decidedById":null,
                "decidedAt":null,"decisionNote":null,"file":{"name":"rincian.pdf","mime":"application/pdf","size":245000},
                "createdAt":"2026-10-13T01:00:00.000Z"},
               {"id":"ar2","type":"CUTI","title":"Cuti 3 hari","description":null,"amount":null,"entityId":"e1",
                "entityName":"PT Bhakti Rahayu","entityCode":"BRH","divisionId":null,"divisionName":null,"projectId":null,
                "projectName":null,"requestedById":"u1","requester":"Budi Santoso","requesterRole":"KEPALA_DIVISI",
                "startDate":"2026-10-13T17:00:00.000Z","endDate":"2026-10-15T17:00:00.000Z","status":"DIAJUKAN",
                "decidedBy":null,"decidedById":null,"decidedAt":null,"decisionNote":null,"file":null,
                "createdAt":"2026-10-12T01:00:00.000Z"}],
             "decisions":[{"id":"p5","name":"Portal Pasien","entityName":"PT Medika","proposer":"Dewi Lestari",
               "proposedAt":"2026-10-11T02:00:00.000Z","slot":"DIREKTUR_ENTITAS"}],
             "escalations":[{"divisionId":"d1","id":"es1","summary":"Server butuh memori.","needed":"ANGGARAN",
               "status":"DIAJUKAN","raisedAt":"2026-10-04T02:00:00.000Z","raisedBy":"Rani Kusuma",
               "entityName":"PT Bhakti Rahayu","entityCode":"BRH","ageDays":9,"overdue":true}],
             "activity":[]}
        """.trimIndent()

        /** Potret GET /api/approval-requests?decided=1. */
        val JSON_RIWAYAT = """
            {"canDecide":true,"undoMinutes":15,"items":[
              {"id":"ar7","type":"ANGGARAN","title":"Lisensi desain","description":null,"amount":2000000,
               "entityId":"e1","entityName":"PT Bhakti Rahayu","entityCode":"BRH","divisionId":null,"divisionName":null,
               "projectId":null,"projectName":null,"requestedById":"u1","requester":"Budi Santoso","requesterRole":"KEPALA_DIVISI",
               "startDate":null,"endDate":null,"status":"DITOLAK","decidedBy":"Sari Direktur","decidedById":"u9",
               "decidedAt":"2026-10-10T02:00:00.000Z","decisionNote":"Anggaran sudah terpakai.","file":null,
               "createdAt":"2026-10-09T02:00:00.000Z"},
              {"id":"ar8","type":"MATERI","title":"Video","status":"DITARIK","requester":"X","entityCode":"BRH"}
            ]}
        """.trimIndent()
    }
}
