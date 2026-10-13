package id.co.monitorkarya.core.data.sync

import id.co.monitorkarya.core.data.repo.HasilBaca
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * E2E-R2 N1: 403 "Proyek ini di luar tanggung jawab Anda" pada tugas satu
 * proyek tidak boleh menghentikan sinkron proyek lain, dan putaran tetap
 * dianggap lancar (terakhirSinkron diperbarui).
 */
class TarikPerProyekTest {

    private val ok: HasilBaca<Unit> = HasilBaca.Sukses(Unit)
    private val ditolak = HasilBaca.Gagal("Proyek ini di luar tanggung jawab Anda", kodeHttp = 403)

    @Test
    fun ditolak403DilewatiDanProyekSisanyaTetapDitarik() = runBlocking {
        val laporanDitarik = mutableListOf<String>()
        val tugasDitarik = mutableListOf<String>()
        val r = tarikPerProyek(
            idProyek = listOf("asing", "milik1", "milik2"),
            tarikLaporan = { laporanDitarik += it; ok },
            tarikTugas = { tugasDitarik += it; if (it == "asing") ditolak else ok },
        )
        assertEquals(listOf("asing", "milik1", "milik2"), laporanDitarik)
        assertEquals(listOf("asing", "milik1", "milik2"), tugasDitarik)
        assertEquals(1, r.dilewati)
        assertEquals(5, r.sukses)
        assertTrue(r.lancar)
    }

    @Test
    fun ditolakPadaLaporanTetapMencobaTugasProyekSama() = runBlocking {
        val tugasDitarik = mutableListOf<String>()
        val r = tarikPerProyek(
            idProyek = listOf("p1"),
            tarikLaporan = { ditolak },
            tarikTugas = { tugasDitarik += it; ok },
        )
        assertEquals(listOf("p1"), tugasDitarik)
        assertTrue(r.lancar)
    }

    @Test
    fun galatServerDicatatGagalTapiProyekBerikutnyaTetapDitarik() = runBlocking {
        val tugasDitarik = mutableListOf<String>()
        val r = tarikPerProyek(
            idProyek = listOf("p1", "p2"),
            tarikLaporan = { if (it == "p1") HasilBaca.Gagal("Server bermasalah", kodeHttp = 500) else ok },
            tarikTugas = { tugasDitarik += it; ok },
        )
        assertEquals(listOf("p1", "p2"), tugasDitarik)
        assertEquals(1, r.gagal)
        assertFalse(r.lancar)
    }

    @Test
    fun luringMenghentikanPutaranDini() = runBlocking {
        val laporanDitarik = mutableListOf<String>()
        val r = tarikPerProyek(
            idProyek = listOf("p1", "p2", "p3"),
            tarikLaporan = { laporanDitarik += it; if (it == "p2") HasilBaca.Gagal("Luring", luring = true) else ok },
            tarikTugas = { ok },
        )
        assertEquals(listOf("p1", "p2"), laporanDitarik)
        assertTrue(r.terhenti)
        assertFalse(r.lancar)
    }

    @Test
    fun sesiBerakhir401MenghentikanPutaran() = runBlocking {
        var panggilan = 0
        val r = tarikPerProyek(
            idProyek = listOf("p1", "p2"),
            tarikLaporan = { panggilan++; HasilBaca.Gagal("Sesi berakhir", kodeHttp = 401) },
            tarikTugas = { panggilan++; ok },
        )
        assertEquals(1, panggilan)
        assertFalse(r.lancar)
    }

    @Test
    fun tanpaProyekTetapLancar() = runBlocking {
        assertTrue(tarikPerProyek(emptyList(), { ok }, { ok }).lancar)
    }
}
