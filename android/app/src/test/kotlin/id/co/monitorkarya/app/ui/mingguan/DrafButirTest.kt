package id.co.monitorkarya.app.ui.mingguan

import id.co.monitorkarya.core.data.repo.Draf
import id.co.monitorkarya.core.data.repo.KunciDraf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** G1: draf otomatis Sheet butir capaian mingguan. */
class DrafButirTest {

    private val butir = ButirMingguan(
        id = "b1", pekerjaan = "Migrasi data", target = "2 gudang", picNama = "Sari", picJabatan = "",
        aspekId = "a1", aspekNama = "A", prioritasId = "p1", prioritasNama = "P", status = "ON_PROGRESS",
        progres = 40, capaian = "1 gudang", kendala = null, tindakLanjut = null, hariKerjaIso = null,
        hariKerjaKunci = null, posisi = 0, jumlahBukti = 0, dibuatIso = "",
    )

    private fun divisi(status: String?, bisaTulis: Boolean = true) = DivisiMingguan(
        id = "d1", nama = "Teknik", tipe = "", kepalaNama = null, bisaTulis = bisaTulis, alasanKunci = null,
        beku = false, bukaSampaiIso = null,
        laporan = status?.let { LaporanMingguan(id = "r1", statusHeader = it, diserahkanIso = null, disetujuiIso = null, butir = emptyList()) },
    )

    @Test
    fun kunci_per_butir_atau_butir_baru_divisi_per_minggu() {
        assertEquals(KunciDraf(KunciDraf.MINGGUAN_BUTIR, "b1", "2026-W42"), kunciDrafButir("d1", butir, "2026-W42"))
        assertEquals(KunciDraf(KunciDraf.MINGGUAN_BUTIR, "baru:d1", "2026-W42"), kunciDrafButir("d1", null, "2026-W42"))
    }

    @Test
    fun isian_sama_dengan_butir_tidak_menjadi_draf() {
        assertNull(isiDrafButir(isianAwalButir(butir), butir, bolehSunting = true))
        assertNull(isiDrafButir(isianAwalButir(null), null, bolehSunting = true))
        val ubah = isianAwalButir(butir).copy(capaian = "2 gudang selesai")
        assertNotNull(isiDrafButir(ubah, butir, bolehSunting = true))
        assertNull("papan tidak bisa ditulis → buang", isiDrafButir(ubah, butir, bolehSunting = false))
    }

    @Test
    fun draf_dipulihkan_hanya_bila_berbeda_dan_utuh() {
        val ubah = isianAwalButir(butir).copy(kendala = "Hujan", status = "TERKENDALA")
        val json = isiDrafButir(ubah, butir, bolehSunting = true)!!
        assertEquals(ubah, drafButirUntuk(Draf(json, 1L), butir))
        assertNull(drafButirUntuk(Draf(isianButirKeJson(isianAwalButir(butir)), 1L), butir))
        assertNull(drafButirUntuk(Draf("{rusak", 1L), butir))
        assertNull(drafButirUntuk(null, butir))
    }

    @Test
    fun json_bolak_balik() {
        val i = IsianButir("a", "p", "kerja", "target", "pic", "SELESAI", 100, "cap", "ken", "tl")
        assertEquals(i, isianButirDariJson(isianButirKeJson(i)))
    }

    @Test
    fun boleh_sunting_hanya_draft_terbuka() {
        assertTrue(bolehSuntingButir(divisi(null)))
        assertTrue(bolehSuntingButir(divisi("DRAFT")))
        assertFalse(bolehSuntingButir(divisi("MENUNGGU_PERSETUJUAN")))
        assertFalse(bolehSuntingButir(divisi("DRAFT", bisaTulis = false)))
    }
}
