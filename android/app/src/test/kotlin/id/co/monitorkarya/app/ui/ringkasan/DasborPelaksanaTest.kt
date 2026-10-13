package id.co.monitorkarya.app.ui.ringkasan

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ringkasan PIC/Kepala divisi (B1) terhadap bentuk GET /api/my-dashboard
 * sebenarnya (src/app/api/my-dashboard/route.ts picDashboard/kadivDashboard).
 */
class DasborPelaksanaTest {

    private fun urai(json: String) = uraiDasborPeran(mkJson.parseToJsonElement(json) as JsonObject)

    private val jsonPic = """
        {"kind":"PIC","countdown":{"hours":2,"minutes":15,"passed":false},"lockAt":"2026-10-13T10:00:00.000Z",
         "summary":{"projects":1,"submitted":0,"outstanding":1,"blocked":0,"onTimePct":85.71428571428571},
         "projects":[{"id":"p-1","code":"PRJ-1","name":"Aplikasi Absensi","phase":"PELAKSANAAN",
           "startDate":"2026-08-01T00:00:00.000Z","targetEndDate":"2026-10-20T00:00:00.000Z",
           "derivedStatus":"risk","reason":"Progres di bawah rencana","latestProgress":64,
           "latest":{"reportDate":"2026-10-11T17:00:00.000Z","achievementToday":"Modul login","obstacle":null,"followUp":"Uji API"},
           "history":[
             {"reportDate":"2026-10-08T17:00:00.000Z","status":"ON_PROGRESS","progressPct":50,"submitted":true,"forwarded":true,"isLate":false},
             {"reportDate":"2026-10-11T17:00:00.000Z","status":"TERKENDALA","progressPct":64,"submitted":true,"forwarded":false,"isLate":true}],
           "entityName":"PT A","status":null,"progressPct":null,"evidenceCount":0,
           "submitted":false,"forwarded":false,"needsEscalation":false}]}
    """.trimIndent()

    private val jsonKadiv = """
        {"kind":"KADIV","week":{"isoYear":2026,"isoWeek":42,"handoverBy":"2026-10-15T10:00:00.000Z","lockAt":"2026-10-16T10:00:00.000Z"},
         "handoverHoursLeft":55,"handoverPassed":false,
         "summary":{"divisions":2,"items":5,"done":2,"blocked":1,"missingEvidence":1,"needsEscalation":1},
         "byStatus":{"SELESAI":2,"TERKENDALA":1,"ON_PROGRESS":2},
         "history":[{"label":"M35","done":0,"total":0},{"label":"M42","done":2,"total":5}],
         "items":[{"id":"i-1","workItem":"Migrasi","picName":"Rani","targetDate":null,"progressPct":40,
           "status":"TERKENDALA","priority":"TINGGI","needsEscalation":true,"evidenceCount":0}],
         "divisions":[
           {"id":"d-1","name":"Teknologi","statusHeader":"MENUNGGU_PERSETUJUAN","itemCount":3,"submitted":true,"approved":false,"forwarded":false},
           {"id":"d-2","name":"Keuangan","statusHeader":"DRAFT","itemCount":2,"submitted":false,"approved":false,"forwarded":false}]}
    """.trimIndent()

    /** Selasa 13 Okt 2026 10.00 WIB. */
    private val sekarang = Instant.parse("2026-10-13T03:00:00Z").toEpochMilli()

    @Test
    fun pic_terurai_dan_kalimat_hari_ini() {
        val d = (urai(jsonPic) as DasborPeran.Pic).data
        assertEquals(1, d.jumlahProyek)
        assertEquals(85.71, d.tepatWaktuPct, 0.01)
        val p = d.proyek.single()
        assertEquals(64, p.progres)
        assertEquals(2, p.riwayat.size)
        assertNull(p.terakhir?.kendala)
        val (jawaban, pendukung) = kalimatPic(d, p, sekarang)
        assertEquals("Aplikasi Absensi 64% selesai.", jawaban)
        assertEquals(
            "Progres di bawah rencana. Laporan hari ini belum dikirim. Tenggat 17.00 · 2 jam 15 menit lagi.",
            pendukung,
        )
        assertEquals(MkStatus.RISK to "Laporan hari ini · Belum dikirim", lencanaHariIni(d, p))
        assertEquals(7, sisaHari(p.tenggat, sekarang))
        assertEquals(MkStatus.RISK, mkStatusTurunan(p.statusTurunan))
        assertEquals(MkStatus.RISK to "Terkendala", lencanaHarian("TERKENDALA"))
    }

    @Test
    fun tenggat_harian_24_7_ditutup_dan_lewat() {
        assertEquals("Tersedia 24/7 · kirim kapan saja", teksTenggatHarian(null, "", sekarang))
        // Kunci tengah malam WIB + lewat = pengisian ditutup.
        assertEquals(
            "Pengisian laporan sedang ditutup",
            teksTenggatHarian(HitungMundur(0, 0, true), "2026-10-12T17:00:00.000Z", sekarang),
        )
        assertEquals(
            "Tenggat 17.00 · lewat 1 jam 5 menit",
            teksTenggatHarian(HitungMundur(0, 0, true), "2026-10-13T10:00:00.000Z", Instant.parse("2026-10-13T11:05:00Z").toEpochMilli()),
        )
        assertEquals(
            "Tenggat 17.00 · 40 menit lagi",
            teksTenggatHarian(HitungMundur(0, 40, false), "2026-10-13T10:00:00.000Z", sekarang),
        )
    }

    @Test
    fun kadiv_terurai_dan_kalimat() {
        val d = (urai(jsonKadiv) as DasborPeran.Kadiv).data
        assertEquals(42, d.isoWeek)
        assertEquals(2, d.perStatus["SELESAI"])
        assertEquals("2 divisi Anda", namaDivisiKadiv(d))
        assertEquals("Kamis 17.00", labelSerah(d))
        val (jawaban, pendukung) = kalimatKadiv(d)
        assertEquals("2 divisi Anda menyelesaikan 2 dari 5 item minggu ini.", jawaban)
        assertEquals("1 item terkendala. 1 item belum punya bukti. Serahkan ke Admin PT paling lambat Kamis 17.00.", pendukung)
        assertEquals(40, persenSelesai(d))
        val alur = alurPenyerahan(d)
        assertEquals(MkStatus.DONE, alur[1].third) // salah satu divisi sudah menyerahkan
        assertEquals(MkStatus.INFO, alur[2].third)
        assertEquals(MkStatus.NEUTRAL, alur[3].third)
    }

    @Test
    fun e2e1_butir_na_tidak_dihitung_di_ringkasan() {
        assertEquals(3, butirDihitungKadiv(4, mapOf("NA" to 1, "SELESAI" to 2)))
        assertEquals(4, butirDihitungKadiv(4, emptyMap()))
        assertEquals(0, butirDihitungKadiv(1, mapOf("NA" to 3)))
    }

    @Test
    fun kind_lain_dan_kolom_hilang_tidak_menjatuhkan() {
        assertTrue(urai("""{"kind":"OVERSIGHT"}""") is DasborPeran.Lain)
        val kosong = (urai("""{"kind":"KADIV"}""") as DasborPeran.Kadiv).data
        assertEquals("Divisi Anda belum mengisi capaian minggu ini.", kalimatKadiv(kosong).first)
        val pic = (urai("""{"kind":"PIC","countdown":null}""") as DasborPeran.Pic).data
        assertNull(pic.hitung)
        assertTrue(pic.proyek.isEmpty())
    }
}
