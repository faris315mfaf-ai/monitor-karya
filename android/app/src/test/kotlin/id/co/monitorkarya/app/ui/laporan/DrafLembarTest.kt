package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.data.repo.Draf
import id.co.monitorkarya.core.data.repo.KunciDraf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** G1: draf otomatis Sheet entri PIC (C5 R5) — kapan disimpan, dipulihkan, dibuang. */
class DrafLembarTest {

    private val awal = IsianEntri(judul = "Cor pondasi", pelaksana = "Budi", progres = 40)
    private val ubah = LembarEntri(entriId = "t1", idTersimpan = "t1", isian = awal, isianAwal = awal)
    private val baru = LembarEntri(entriId = null, idTersimpan = null, isian = IsianEntri(pelaksana = "Budi"), isianAwal = IsianEntri(pelaksana = "Budi"))

    @Test
    fun kunci_entri_baru_per_proyek_dan_tanggal_entri_tersimpan_per_id() {
        assertEquals(
            KunciDraf(KunciDraf.LAPORAN_ENTRI, "baru:p1", "2026-10-13"),
            kunciDrafLembar(baru, "p1", "2026-10-13"),
        )
        assertEquals(KunciDraf(KunciDraf.LAPORAN_ENTRI, "t1", "2026-10-13"), kunciDrafLembar(ubah, "p1", "2026-10-13"))
        // Entri baru yang sudah tersimpan (Sheet tetap terbuka) memakai id-nya.
        assertEquals("t9", kunciDrafLembar(baru.copy(idTersimpan = "t9"), "p1", "d").objek)
    }

    @Test
    fun hanya_perubahan_pada_laporan_terbuka_yang_menjadi_draf() {
        assertNull("tanpa perubahan → buang", isiDrafLembar(ubah, terkunci = false))
        val diubah = ubah.copy(isian = awal.copy(hasil = "Selesai 60%"))
        assertNotNull(isiDrafLembar(diubah, terkunci = false))
        assertNull("laporan terkunci → tidak ada draf", isiDrafLembar(diubah, terkunci = true))
    }

    @Test
    fun ditutup_lalu_dibuka_lagi_memulihkan_isian_dengan_penanda() {
        val diubah = baru.copy(isian = baru.isian.copy(judul = "Pasang rangka", hasil = "Teks panjang", eskalasi = true))
        val json = isiDrafLembar(diubah, terkunci = false)!!
        val dibuka = pulihkanLembar(baru, Draf(json, disimpanPada = 77L))
        assertEquals(diubah.isian, dibuka.isian)
        assertEquals(77L, dibuka.drafPulih)
        // isianAwal tetap versi tersimpan → Sheet tetap terhitung berubah.
        assertEquals(baru.isianAwal, dibuka.isianAwal)
        assertEquals(true, dibuka.berubah)
    }

    @Test
    fun draf_sama_dengan_versi_tersimpan_atau_rusak_diabaikan() {
        assertEquals(ubah, pulihkanLembar(ubah, Draf(isianKeJson(awal), 1L)))
        assertEquals(ubah, pulihkanLembar(ubah, Draf("bukan json", 1L)))
        assertEquals(ubah, pulihkanLembar(ubah, null))
    }

    @Test
    fun buang_draf_mengembalikan_isian_tersimpan() {
        val dipulihkan = ubah.copy(isian = awal.copy(judul = "Draf"), drafPulih = 5L, galat = listOf("x"))
        val hasil = buangDrafLembar(dipulihkan)
        assertEquals(awal, hasil.isian)
        assertNull(hasil.drafPulih)
        assertEquals(emptyList<String>(), hasil.galat)
        assertNull(isiDrafLembar(hasil, terkunci = false))
    }

    @Test
    fun json_isian_bolak_balik_tanpa_id_atau_kunci_idempotensi() {
        val isian = IsianEntri("J", "D", "P", "TERKENDALA", 55, "H", "K", true, "Kep", "R")
        val json = isianKeJson(isian)
        assertEquals(isian, isianDariJson(json))
        // Draf hanya isian kerja: tanpa id entri/kunci idempotensi.
        listOf("entriId", "idTersimpan", "kunciTambah").forEach { assertEquals(false, json.contains(it)) }
    }
}
