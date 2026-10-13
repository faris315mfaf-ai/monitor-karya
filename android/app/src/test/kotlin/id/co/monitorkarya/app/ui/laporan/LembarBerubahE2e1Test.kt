package id.co.monitorkarya.app.ui.laporan

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** E2E-1 #5: Sheet "Ubah entri" tidak boleh tertutup geser saat isian berubah; #10 slot galat. */
class LembarBerubahE2e1Test {

    private val asli = IsianEntri(judul = "Pasang panel", pelaksana = "Rani", status = "BERJALAN", progres = 40, hasil = "Panel 1")

    @Test
    fun ubah_entri_tanpa_perubahan_boleh_ditutup_geser() {
        val l = LembarEntri(entriId = "t1", idTersimpan = "t1", isian = asli, isianAwal = asli)
        assertFalse(l.berubah)
    }

    @Test
    fun ubah_judul_atau_pelaksana_menandai_berubah() {
        val l = LembarEntri(entriId = "t1", idTersimpan = "t1", isian = asli.copy(judul = "Pasang panel 2"), isianAwal = asli)
        assertTrue(l.berubah)
        assertTrue(l.copy(isian = asli.copy(pelaksana = "Bimo")).berubah)
    }

    @Test
    fun sheet_dipulihkan_dibandingkan_dengan_isian_kosong() {
        assertTrue(LembarEntri(entriId = null, idTersimpan = null, isian = asli).berubah)
        assertFalse(LembarEntri(entriId = null, idTersimpan = null, isian = IsianEntri()).berubah)
    }

    @Test
    fun slot_galat_hanya_bila_ada_pesan() {
        assertNull(slotGalat(emptyList()))
        assertTrue(slotGalat(listOf("Kendala wajib diisi")) != null)
    }
}
