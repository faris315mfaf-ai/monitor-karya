package id.co.monitorkarya.feature.ringkasangrup.logika

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.ringkasangrup.data.DivisiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.MingguanDivisiDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import java.time.Instant
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Layar Direktur (B1) terhadap bentuk /api/ringkasan sebenarnya untuk
 * DIREKTUR_ENTITAS (src/app/api/ringkasan/route.ts: divisions[] dengan
 * head/weekly/outputs/onTime, outputs.trend.week, viewer, approvalRequests,
 * deadlineProposals, escalations[].divisionId).
 */
class LogikaDirekturTest {

    companion object {
        val JSON_DIREKTUR = """
        {"kind":"RINGKASAN","week":42,"scope":{"entities":1,"divisions":2,"global":false},
         "projects":[
          {"id":"p-1","code":"A1","name":"SIM RS","phase":"PELAKSANAAN","entityId":"ent-1","entityName":"PT M","entityCode":"MDC",
           "divisionId":"div-1","divisionName":"Teknologi","pic":"Rani","startDate":null,"targetEndDate":"2026-10-20T00:00:00.000Z",
           "status":"risk","reason":"Progres di bawah rencana","progress":60,"lastReportAt":null,"lastNote":null,"reportedToday":true,
           "outputsDone":1,"outputsTotal":3,"escalations":[]},
          {"id":"p-2","code":"B2","name":"Gudang","phase":"PELAKSANAAN","entityId":"ent-1","entityName":"PT M","entityCode":"MDC",
           "divisionId":"div-2","divisionName":"Keuangan","pic":null,"startDate":null,"targetEndDate":"2027-01-20T00:00:00.000Z",
           "status":"on","reason":null,"progress":30,"lastReportAt":null,"lastNote":null,"reportedToday":false,
           "outputsDone":0,"outputsTotal":0,"escalations":[]},
          {"id":"p-3","code":"C3","name":"Audit","phase":"PELAKSANAAN","entityId":"ent-1","entityName":"PT M","entityCode":"MDC",
           "divisionId":"div-1","divisionName":"Teknologi","pic":"Budi","startDate":null,"targetEndDate":"2026-10-14T00:00:00.000Z",
           "status":"done","reason":null,"progress":100,"lastReportAt":null,"lastNote":null,"reportedToday":true,
           "outputsDone":2,"outputsTotal":2,"escalations":[]}],
         "counts":{"on":1,"risk":1,"late":0,"done":1,"neutral":0},
         "daily":{"expected":3,"submitted":2,"onTime30Pct":70,"onTime30":7,"total30":10},
         "weekly":{"expected":2,"submitted":1,"approved":0},
         "trend":[{"label":"M41","submitted":3,"onTimePct":90},{"label":"M42","submitted":2,"onTimePct":80}],
         "byEntity":[],"decisions":[],
         "escalations":[{"id":"e-1","divisionId":"div-1","summary":"Server belum ada","needed":"KEPUTUSAN","status":"DIAJUKAN",
           "raisedAt":"2026-10-01T00:00:00.000Z","raisedBy":"Rani","entityName":"PT M","entityCode":"MDC","ageDays":12,"overdue":true}],
         "activity":[],
         "reportWeek":{"isoYear":2026,"isoWeek":41,"label":"M41","handoverBy":"2026-10-08T10:00:00.000Z","current":false},
         "divisions":[
          {"id":"div-1","name":"Teknologi","typeName":"Teknologi","entityId":"ent-1","entityName":"PT M","entityCode":"MDC",
           "head":{"id":"u-1","name":"Budi Santoso","email":"budi@pt.id","phone":"0812-3"},"projects":2,
           "weekly":{"id":"wr-1","state":"sent","statusHeader":"MENUNGGU_PERSETUJUAN","submittedAt":"2026-10-08T08:00:00.000Z",
             "submittedBy":"Budi Santoso","readAt":null,"itemsTotal":4,"itemsDone":3,"summary":"3 dari 4 pekerjaan selesai.",
             "points":["Migrasi selesai"],"obstacles":["Lisensi tertunda"],"comments":2,
             "headSummary":{"points":["Poin kadiv"],"sentAt":"2026-10-09T01:00:00.000Z","outputsAccepted":3,"outputsTarget":4,"openObstacles":1}},
           "outputs":{"total":5,"done":3,"active":1,"review":1,"onTime":2,"withDue":3,"trend":[0,1,0,2]},
           "onTime":{"pct":67,"ok":2,"total":3,"basis":"output"}},
          {"id":"div-2","name":"Keuangan","typeName":"Keuangan","entityId":"ent-1","entityName":"PT M","entityCode":"MDC",
           "head":null,"projects":1,
           "weekly":{"id":null,"state":"missing","statusHeader":null,"submittedAt":null,"submittedBy":null,"readAt":null,
             "itemsTotal":0,"itemsDone":0,"summary":null,"points":[],"obstacles":[],"comments":0,"headSummary":null},
           "outputs":{"total":0,"done":0,"active":0,"review":0,"onTime":0,"withDue":0,"trend":[0,0,1,1]},
           "onTime":null}],
         "outputs":{"total":5,"done":3,"active":1,"review":1,"onTime":2,"withDue":3,
           "trend":{"week":[{"label":"M39","value":0},{"label":"M40","value":1},{"label":"M41","value":1},{"label":"M42","value":3}],
             "month":[],"quarter":[]}},
         "deadlineProposals":[{"id":"dp-1","projectId":"p-1","projectName":"SIM RS","entityName":"PT M","divisionId":"div-1",
           "proposer":"Rani","proposedAt":"2026-10-09T01:00:00.000Z","previousDate":null,"proposedDate":"2026-12-01T00:00:00.000Z","reason":"Vendor"}],
         "attendance":null,
         "viewer":{"canRemind":true,"canMarkRead":true,"canDecideDeadline":true,"canComment":true,"canReview":true,"canNote":true,"canDecideApproval":true},
         "approvalRequests":[{"id":"ar-1","type":"ANGGARAN","title":"Server tambahan","description":null,"amount":5000000,
           "entityId":"ent-1","entityName":"PT M","entityCode":"MDC","divisionId":"div-2","divisionName":"Keuangan",
           "projectId":null,"projectName":null,"requestedById":"u-9","requester":"Sari","requesterRole":"KEPALA_DIVISI",
           "startDate":null,"endDate":null,"status":"DIAJUKAN","decidedBy":null,"decidedById":null,"decidedAt":null,
           "decisionNote":null,"file":null,"createdAt":"2026-10-10T01:00:00.000Z"}]}
        """.trimIndent()

        fun ringkasan(): RingkasanGrupDto = mkJson.decodeFromString(RingkasanGrupDto.serializer(), JSON_DIREKTUR)

        /** Selasa 13 Okt 2026 10.00 WIB. */
        val SEKARANG: Long = Instant.parse("2026-10-13T03:00:00Z").toEpochMilli()
    }

    @Test
    fun dto_divisi_direktur_terdekode() {
        val d = ringkasan()
        val dv = d.divisions.first()
        assertEquals("Budi Santoso", dv.head!!.name)
        assertEquals("0812-3", dv.head!!.phone)
        assertEquals("sent", dv.weekly.state)
        assertEquals(2, dv.weekly.comments)
        assertEquals(1, dv.weekly.headSummary!!.openObstacles)
        assertEquals(listOf(0, 1, 0, 2), dv.outputs.trend)
        assertNull(d.divisions[1].head)
        assertEquals("missing", d.divisions[1].weekly.state)
        assertEquals("M42", d.outputs!!.trend.week.last().label)
        assertTrue(d.viewer.canRemind)
        assertTrue(d.viewer.canMarkRead)
    }

    @Test
    fun susunan_semua_divisi() {
        val d = ringkasan()
        val s = susunDirektur(d, null, { it.weekly.state }, SEKARANG)
        assertEquals(3, s.total)
        assertEquals(2, s.sesuaiRencana) // on + done
        assertEquals(3, s.outputSelesai)
        assertEquals(5, s.outputTotal)
        assertEquals(listOf("div-2"), s.belumMasuk.map { it.id })
        assertEquals(1, s.diterima)
        assertEquals(3, s.menunggu) // 1 eskalasi + 1 tenggat + 1 persetujuan
        assertEquals("keputusan", s.kataMenunggu)
        assertEquals("2 persetujuan dan 1 eskalasi", s.teksMenunggu)
        assertEquals(67, s.tepatWaktuPct) // 2 dari 3 output bertenggat
        assertTrue(s.tepatWaktuBasisOutput)
        assertEquals(listOf("M39", "M40", "M41", "M42"), s.labelMinggu)
        assertEquals(listOf(0, 1, 1, 3), s.trenOutput)
        assertEquals(3, s.mingguIni)
        assertEquals(2, s.selisih)
        // Milestone 14 hari: p-1 (20 Okt) — p-3 selesai dikecualikan, p-2 terlalu jauh.
        assertEquals(listOf("p-1"), s.milestone.map { it.id })
        assertEquals("2 divisi · 3 proyek di bawah Anda", s.eyebrow)
        assertEquals("2 dari 3 proyek berjalan sesuai rencana.", s.jawaban)
        assertEquals(
            "1 perlu perhatian, 0 terlambat. Laporan Keuangan belum masuk. 2 persetujuan dan 1 eskalasi menunggu keputusan Anda.",
            s.pendukung,
        )
        assertEquals("Geser tenggat SIM RS", s.tenggat.single().judul)
        assertEquals("Anggaran · Sari · Keuangan", s.persetujuan.single().keterangan)
    }

    @Test
    fun susunan_satu_divisi_menyaring_semua_isi() {
        val d = ringkasan()
        val s = susunDirektur(d, "div-2", { it.weekly.state }, SEKARANG)
        assertEquals("div-2", s.satu!!.id)
        assertEquals(listOf("p-2"), s.proyek.map { it.id })
        assertTrue(s.eskalasi.isEmpty())
        assertTrue(s.tenggat.isEmpty())
        assertEquals(1, s.persetujuan.size)
        assertEquals("persetujuan", s.kataMenunggu)
        assertEquals("Divisi Keuangan · kepala divisi belum ditetapkan", s.eyebrow)
        assertEquals("0 dari 0 output selesai. Laporan mingguan: belum masuk.", s.pendukung)
        // Tanpa output bertenggat → cadangan tepat waktu laporan harian 30 hari.
        assertEquals(70, s.tepatWaktuPct)
        assertEquals(listOf(0, 0, 1, 1), s.trenOutput)
    }

    @Test
    fun keadaan_lencana_baris_dan_alur() {
        val d = ringkasan()
        assertEquals(Lencana(StatusRingkas.ON, "Terkirim"), lencanaMingguanDivisi("sent"))
        assertEquals(Lencana(StatusRingkas.LATE, "Belum masuk"), lencanaMingguanDivisi("missing"))
        assertEquals(Lencana(StatusRingkas.DONE, "Sudah dibaca"), lencanaMingguanDivisi("read"))
        assertEquals("2026-W41", kunciMingguLaporan(d.reportWeek))
        assertEquals("wr-1", kunciLaporanDivisi(d.divisions[0], "2026-W41"))
        assertEquals("div-2:2026-W41", kunciLaporanDivisi(d.divisions[1], "2026-W41"))
        val skrg = ZonedDateTime.parse("2026-10-09T16:00:00+07:00[Asia/Jakarta]")
        assertEquals(
            "Budi Santoso · kemarin — 3 dari 4 pekerjaan selesai. 2 tanggapan.",
            barisLaporanDivisi(d.divisions[0], "sent", "M41", skrg),
        )
        assertEquals("Kepala divisi belum ditetapkan — belum mengirim laporan M41.", barisLaporanDivisi(d.divisions[1], "missing", "M41"))
        val alur = alurMingguan(d.divisions) { it.weekly.state }
        assertEquals("1 dari 2 terkirim · 1 belum masuk", alur[1].sub)
        assertEquals(StatusRingkas.LATE, alur[1].status)
        assertEquals("0 dari 1 dibaca", alur[2].sub)
        assertEquals("Divisi Keuangan belum punya kepala divisi. Minta Admin PT menetapkannya.", teksHasilIngatkan("TANPA_KEPALA", d.divisions[1]))
        assertEquals("Budi Santoso sudah diingatkan hari ini.", teksHasilIngatkan("SUDAH_HARI_INI", d.divisions[0]))
        assertEquals("Pengingat terkirim ke Budi Santoso.", teksHasilIngatkan("TERKIRIM", d.divisions[0]))
    }

    // ---- E2E-2 (perbaikan feature) ----

    private fun divisi(id: String, nama: String, pt: String, kode: String = "", state: String = "missing") =
        DivisiGrupDto(
            id = id, name = nama, entityId = "e-$pt", entityName = pt, entityCode = kode,
            weekly = MingguanDivisiDto(state = state),
        )

    @Test
    fun label_divisi_ganda_diberi_nama_pt_bug09() {
        val semua = listOf(
            divisi("a", "Keuangan", "PT Energi Migas Sumut"),
            divisi("b", "Keuangan", "PT Listrik Kaltim"),
            divisi("c", "Teknik", "PT Listrik Kaltim"),
            divisi("d", "keuangan ", "", kode = "PT-009"),
        )
        val l = labelDivisiUnik(semua)
        assertEquals("Keuangan · PT Energi Migas Sumut", l["a"])
        assertEquals("Keuangan · PT Listrik Kaltim", l["b"])
        assertEquals("Teknik", l["c"])
        assertEquals("keuangan  · PT-009", l["d"]) // tanpa nama PT → kode PT
        // Chip dikelompokkan per PT lalu nama.
        assertEquals(listOf("d", "a", "b", "c"), urutanChipDivisi(semua).map { it.id })
    }

    @Test
    fun kalimat_belum_masuk_memakai_label_unik_dan_dipotong_bug09() {
        val d = ringkasan().copy(
            divisions = listOf(
                divisi("a", "Produksi", "PT A"),
                divisi("b", "Produksi", "PT B"),
                divisi("c", "Teknik", "PT B"),
                divisi("e", "Produksi", "PT C"),
            ),
        )
        val s = susunDirektur(d, null, { it.weekly.state }, SEKARANG)
        assertTrue(s.pendukung, s.pendukung.contains("Laporan Produksi · PT A, Produksi · PT B dan 2 divisi lain belum masuk."))
        assertEquals("Produksi · PT C", s.label(d.divisions[3]))
        val satu = susunDirektur(d, "b", { it.weekly.state }, SEKARANG)
        assertTrue(satu.eyebrow, satu.eyebrow.startsWith("Divisi Produksi · PT B · "))
    }

    @Test
    fun baris_laporan_tanpa_waktu_kirim_tidak_menampilkan_tanda_strip_bug14b() {
        val dv = ringkasan().divisions[0]
        val tanpaWaktu = dv.copy(weekly = dv.weekly.copy(submittedAt = null, submittedBy = "Ibu Mira", comments = 0, summary = "1 dari 3 pekerjaan selesai."))
        assertEquals("Ibu Mira — 1 dari 3 pekerjaan selesai.", barisLaporanDivisi(tanpaWaktu, "sent", "M41"))
        val tanpaRingkas = tanpaWaktu.copy(weekly = tanpaWaktu.weekly.copy(summary = null))
        assertEquals("Ibu Mira.", barisLaporanDivisi(tanpaRingkas, "sent", "M41"))
        assertNull(waktuKirimRelatif(null))
        assertNull(waktuKirimRelatif("bukan-tanggal"))
        val skrg = ZonedDateTime.parse("2026-10-09T16:00:00+07:00[Asia/Jakarta]")
        assertEquals("Kemarin", waktuKirimRelatif("2026-10-08T08:00:00.000Z", skrg))
    }
}
