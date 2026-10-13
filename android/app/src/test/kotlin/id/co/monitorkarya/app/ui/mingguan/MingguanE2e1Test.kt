package id.co.monitorkarya.app.ui.mingguan

import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * E2E-1 #2 (bukti butir mingguan), #7 (N/A tampil "Belum mulai"), #9 (hitungan
 * butir beda antarlayar). JSON berbentuk GET /api/weekly-input.
 */
class MingguanE2e1Test {

    private fun item(id: String, status: String, cache: Int, rows: Int) = """
        {"id":"$id","weeklyReportId":"wr","aspectCategoryId":"a","workItem":"Butir $id","targetOutput":"T",
         "picName":"Rani","picTitle":"Rani","status":"$status","progressPct":50,"achievementThisWeek":"x",
         "priorityId":"p","evidenceCount":$cache,"position":0,"createdAt":"2026-10-12T01:00:00.000Z",
         "updatedAt":"2026-10-12T01:00:00.000Z","aspectCategory":{"id":"a","code":"A","name":"Aspek"},
         "priority":{"id":"p","code":"P","name":"Sedang"},
         "evidence":[${(1..rows).joinToString(",") { """{"id":"ev$id$it","targetId":"$id","fileName":"f$it.jpg","mime":"image/jpeg","size":2048,"createdAt":"2026-10-12T01:00:00.000Z"}""" }}]}
    """.trimIndent()

    private fun papan(): PapanMingguan = papanDari(
        mkJson.decodeFromString(
            WeeklyInputResponse.serializer(),
            """
            {"week":{"key":"2026-W42","isoYear":2026,"isoWeek":42,"start":"2026-10-12","end":"2026-10-18",
                     "handoverBy":"2026-10-15T10:00:00.000Z","lockAt":"2026-10-16T10:00:00.000Z"},
             "divisions":[{"id":"d1","name":"Keuangan","type":"Keuangan","writable":true,
               "report":{"id":"wr","statusHeader":"MENUNGGU_PERSETUJUAN","items":[
                 ${item("b1", "SELESAI", cache = 2, rows = 0)},
                 ${item("b2", "ON_PROGRESS", cache = 1, rows = 1)},
                 ${item("b3", "NA", cache = 0, rows = 0)},
                 ${item("b4", "SELESAI", cache = 0, rows = 2)}]}}]}
            """.trimIndent(),
        ),
    )

    @Test
    fun jumlah_bukti_dari_baris_nyata_bukan_cache() {
        val butir = papan().divisi.single().laporan!!.butir
        val b1 = butir.first { it.id == "b1" }
        // Seed: evidenceCount 2 tetapi 0 baris Evidence → server menolak 422.
        assertEquals(0, b1.jumlahBukti)
        assertEquals(listOf("b1"), butirTanpaBukti(butir).map { it.id })
        val b4 = butir.first { it.id == "b4" }
        assertEquals(2, b4.bukti.size)
        assertEquals("f1.jpg", b4.bukti.first().nama)
    }

    @Test
    fun status_yang_mewajibkan_bukti_sama_dengan_lock_ts() {
        assertTrue(butirWajibBukti("SELESAI"))
        assertTrue(butirWajibBukti("ON_PROGRESS"))
        assertTrue(butirWajibBukti("TERKENDALA"))
        assertFalse(butirWajibBukti("BELUM_MULAI"))
        assertFalse(butirWajibBukti("NA"))
        assertEquals("WEEKLY_ITEM", TARGET_BUKTI)
    }

    @Test
    fun na_punya_label_dan_kolom_sendiri() {
        assertEquals("N/A", labelStatusButir("NA"))
        assertEquals(MkStatus.NEUTRAL, mkStatusButir("NA"))
        assertEquals("na", kolomStatus("NA"))
        assertEquals("belum", kolomStatus("BELUM_MULAI"))
        val kolom = bagiKolom(papan().divisi.single().laporan!!.butir)
        assertEquals(listOf("belum", "berjalan", "selesai", "na"), kolom.keys.toList())
        assertTrue(kolom.getValue("belum").isEmpty())
        assertEquals("N/A", labelKolom("na"))
        // Tanpa butir N/A kolomnya tidak tampil.
        assertFalse("na" in bagiKolom(papan().divisi.single().laporan!!.butir.filter { it.status != "NA" }))
    }

    @Test
    fun hitungan_tidak_menghitung_na() {
        val butir = papan().divisi.single().laporan!!.butir
        assertEquals("2 dari 3 butir selesai · 1 N/A tidak dihitung", teksHitungButir(butir))
        assertEquals("Belum ada butir capaian minggu ini.", teksHitungButir(emptyList()))
        assertEquals(3, butirDihitung(butir).size)
    }

    @Test
    fun teks_serah_tanpa_tenggat_tidak_menebak_jam() {
        assertFalse(teksSerah(null, null).contains("17.00"))
    }

    @Test
    fun ukuran_bukti_terbaca() {
        assertEquals("2 KB", ukuranBukti(2048))
        assertEquals("1,5 MB", ukuranBukti(1572864))
        assertEquals("Berkas", ukuranBukti(0))
    }
}
