package id.co.monitorkarya.app.ui.mejakerja

import id.co.monitorkarya.core.network.dto.TaskDto
import id.co.monitorkarya.core.network.dto.WorkDeskPicResponse
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Susunan meja kerja PIC (agen A1) terhadap bentuk GET /api/work-desk cabang
 * PIC (src/app/api/work-desk/route.ts: today/history[].date ISO awal hari WIB,
 * countdown/cutoffLabel dari ReportSettings — "24.00 WIB" = 24/7).
 */
class MejaKerjaLogikaTest {

    private fun meja(cutoff: String = "17.00 WIB", locked: Boolean = false, submitted: Boolean = false) =
        mkJson.decodeFromString<WorkDeskPicResponse>(
            """
            {"kind":"PIC","today":"2026-10-12T17:00:00.000Z","lockAt":"2026-10-13T10:00:00.000Z","locked":$locked,
             "countdown":{"hours":2,"minutes":15,"totalMs":8100000,"passed":false},"cutoffLabel":"$cutoff",
             "days":["2026-10-09T17:00:00.000Z","2026-10-12T17:00:00.000Z"],
             "projects":[{"id":"p-1","code":"PRJ-1","name":"Aplikasi Absensi","phase":"PELAKSANAAN","entityName":"PT A",
               "tasks":{"total":4,"done":1,"blocked":1},
               "report":${if (submitted) """{"status":"ON_PROGRESS","progressPct":40,"submittedAt":"2026-10-13T08:00:00.000Z","forwardedAt":null,"isLate":false,"evidenceCount":2}""" else "null"},
               "history":[
                 {"date":"2026-10-09T17:00:00.000Z","submitted":true,"isLate":true,"status":"ON_PROGRESS","progressPct":30},
                 {"date":"2026-10-12T17:00:00.000Z","submitted":$submitted,"isLate":false,"status":null,"progressPct":null}
               ],
               "remindedAt":"2026-10-13T02:12:00.000Z","remindedBy":"Rani"}]}
            """.trimIndent(),
        )

    @Test
    fun belumDikirimDenganTenggatDanPengingat() {
        val d = susunMeja(meja())
        assertEquals("Laporan Aplikasi Absensi hari ini belum dikirim.", d.jawaban)
        assertEquals(
            "Tenggat 17.00 WIB, 2 jam 15 menit lagi. 1 dari 4 task hari ini selesai. Rani mengingatkan pukul 09.12.",
            d.dukungan,
        )
        val p = d.proyek.single()
        assertEquals(MkStatus.NEUTRAL, p.status)
        assertEquals("Diingatkan Rani pukul 09.12", p.pengingat)
        assertEquals(listOf(KeadaanHari.TERLAMBAT, KeadaanHari.MENUNGGU), p.riwayat.map { it.keadaan })
        assertEquals("2026-10-13", p.riwayat.last().tanggal)
        // Hari ini tidak dihitung dalam tepat waktu 10 hari.
        assertEquals(1, d.riwayatTotal)
        assertEquals(0, d.tepatWaktuPct)
        assertTrue(d.eyebrow.startsWith("Meja kerja · Selasa, 13 Oktober"))
    }

    @Test
    fun mode247TanpaTenggatJam() {
        val d = susunMeja(meja(cutoff = "24.00 WIB"))
        assertTrue(d.mode247)
        assertTrue(d.dukungan.startsWith("Tersedia 24/7 · kirim kapan saja."))
        assertTrue(d.subAntrean.startsWith("Kirim kapan saja"))
    }

    @Test
    fun terkirimDanTerkunci() {
        val d = susunMeja(meja(locked = true, submitted = true))
        assertEquals(0, d.belumTerkirim)
        assertEquals("Laporan Aplikasi Absensi hari ini sudah terkirim.", d.jawaban)
        assertTrue(d.dukungan.startsWith("Tenggat 17.00 WIB sudah lewat"))
        assertEquals(MkStatus.DONE to "Terkirim 15.00", d.proyek.single().let { it.status to it.statusLabel })
        assertNull(d.proyek.single().pengingat)
        assertEquals(KeadaanHari.HARI_INI, d.proyek.single().riwayat.last().keadaan)
    }

    @Test
    fun sisaPanjangDanCentang() {
        assertEquals("2 jam 15 menit", sisaPanjang(8_100_000))
        assertEquals("3 jam", sisaPanjang(10_800_000))
        assertEquals("5 menit", sisaPanjang(300_000))
        val t = mkJson.decodeFromString<TaskDto>(
            """{"id":"t-1","projectId":"p-1","entityId":"e","workDate":"2026-10-12T17:00:00.000Z","title":"Uji",
               "picName":"Rina","startAt":"2026-10-13T01:00:00.000Z","endAt":"2026-10-13T03:00:00.000Z",
               "status":"TERKENDALA","progressPct":95,"urgency":"TINGGI","scope":"HARIAN","obstacle":"Crane telat",
               "createdAt":"2026-10-13T01:00:00.000Z","updatedAt":"2026-10-13T01:00:00.000Z",
               "subtasks":[{"id":"s","title":"Cek","isDone":false,"createdAt":"2026-10-13T01:00:00.000Z"}]}""",
        )
        val a = t.keAgenda()
        assertTrue(a.terkendala)
        assertFalse(a.selesai)
        assertEquals("08.00–10.00", a.jam)
        assertEquals("Rina · 0 dari 1 langkah · Crane telat", a.meta)
        val selesai = badanCentang(t, true)
        assertEquals("SELESAI", selesai.status)
        assertEquals(100, selesai.progressPct)
        assertTrue(selesai.subtasks.all { it.isDone })
        assertEquals("08:00", selesai.startTime)
        val batal = badanCentang(t, false)
        assertEquals("BERJALAN", batal.status)
        assertEquals(90, batal.progressPct)
        assertFalse(batal.subtasks.single().isDone)
    }
}
