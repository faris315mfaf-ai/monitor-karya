package id.co.monitorkarya.app.ui.admin

import id.co.monitorkarya.app.ui.kepatuhan.DivisiKepatuhan
import id.co.monitorkarya.app.ui.kepatuhan.MejaKepatuhan
import id.co.monitorkarya.app.ui.kepatuhan.StatusMingguan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Peta panas kepatuhan 10 hari kerja (BUG-02, port ComplianceHeatmapCard). */
class PetaPanasTest {

    private fun divisi(id: String, nama: String, riwayat: List<Int?>) = DivisiKepatuhan(
        id = id, nama = nama, kepalaNama = null, kepalaEmail = null, kepalaTelepon = null,
        wajib = 1, sudah = 1, cuti = 0, belumLapor = emptyList(), mingguan = StatusMingguan.BELUM,
        diserahkanIso = null, disetujuiIso = null, diteruskanIso = null, riwayat = riwayat,
    )

    private fun meja(hari: List<String>, vararg d: DivisiKepatuhan) = MejaKepatuhan(
        terkunci = false, bolehIngatkan = false, wajib = 0, sudah = 0, cuti = 0, diingatkan = 0, tanpaDivisi = 0,
        isoMinggu = 42, serahLewat = false, divisi = d.toList(), hari = hari,
    )

    private val tigaHari = listOf("2026-10-08T17:00:00.000Z", "2026-10-11T17:00:00.000Z", "2026-10-12T17:00:00.000Z")

    @Test
    fun labelKolomHariWib() {
        // Tengah malam WIB Senin 12 Okt = 11 Okt 17.00 UTC.
        assertEquals("Sen 12", labelHariKolom("2026-10-11T17:00:00.000Z"))
        assertEquals("Jum 9", labelHariKolom("2026-10-08T17:00:00.000Z"))
        assertEquals("-", labelHariKolom("rusak"))
    }

    @Test
    fun barisTanpaIsiDisaringDanRataRata() {
        val p = susunPetaPanas(
            meja(
                tigaHari,
                divisi("d1", "Teknologi", listOf(100, 50, null)),
                divisi("d2", "Keuangan", listOf(null, null, null)),
                divisi("d3", "Sumber Daya Manusia", listOf(75, 0, 100)),
            ),
        )
        assertEquals(listOf("Jum 9", "Sen 12", "Sel 13"), p.kolom)
        assertEquals(listOf("d1", "d3"), p.baris.map { it.divisiId })
        assertEquals(listOf("Tek", "SDM"), p.baris.map { it.label })
        // (100+50+75+0+100)/5 = 65.
        assertEquals(65, p.rataRata)
        assertEquals("Persen orang yang lapor per divisi, 3 hari kerja · rata-rata 65%", subjudulPetaPanas(p))
    }

    @Test
    fun riwayatDipadankanDenganJumlahKolom() {
        val p = susunPetaPanas(
            meja(
                tigaHari,
                divisi("d1", "Teknologi", listOf(80)),
                divisi("d2", "Media", listOf(10, 20, 30, 40, 150)),
            ),
        )
        assertEquals(listOf(80, null, null), p.baris[0].nilai)
        assertEquals(listOf(10, 20, 30), p.baris[1].nilai)
    }

    @Test
    fun petaKosong() {
        val p = susunPetaPanas(meja(emptyList(), divisi("d1", "Teknologi", listOf(100))))
        assertTrue(p.baris.isEmpty())
        assertNull(p.rataRata)
        assertEquals("Persen orang yang lapor per divisi, 0 hari kerja", subjudulPetaPanas(p))
    }

    @Test
    fun singkatanDanFraksiWarna() {
        assertEquals("SDM", singkat3("Sumber Daya Manusia"))
        assertEquals("Tek", singkat3("Teknologi"))
        assertEquals("HL", singkat3("hukum legal"))
        assertEquals(0f, fraksiSel(0), 0f)
        assertEquals(1f, fraksiSel(100), 0.0001f)
        assertEquals(0.59f, fraksiSel(50), 0.0001f)
    }

    @Test
    fun deskripsiPembacaLayar() {
        val p = susunPetaPanas(meja(tigaHari, divisi("d1", "Teknologi", listOf(100, null, 40))))
        assertEquals("Divisi Teknologi: Jum 9 100%, Sen 12 libur, Sel 13 40%", deskripsiBaris(p, p.baris.single()))
    }
}
