package id.co.monitorkarya.app.ui.laporan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** E2E-R2 N2 (bukti terunggah tetap tampil) dan N7 (galat validasi basi). */
class LembarE2eR2Test {

    private val terkendala = IsianEntri(judul = "Pasang panel", status = "TERKENDALA")
    private val galatAwal = validasiEntri(terkendala)

    @Test
    fun galat_kendala_hilang_saat_kendala_diisi_rencana_tetap() {
        assertEquals(2, galatAwal.size)
        val sesudah = terkendala.copy(kendala = "Hujan")
        val sisa = galatSetelahUbah(galatAwal, terkendala, sesudah)
        assertEquals(listOf("Rencana besok wajib diisi untuk status Terkendala."), sisa)
    }

    @Test
    fun semua_galat_validasi_hilang_saat_kedua_medan_diisi() {
        val satu = terkendala.copy(kendala = "Hujan")
        val dua = satu.copy(rencana = "Lanjut besok")
        val sisa = galatSetelahUbah(galatSetelahUbah(galatAwal, terkendala, satu), satu, dua)
        assertTrue(sisa.isEmpty())
    }

    @Test
    fun galat_server_tidak_dibuang_saat_isian_berubah() {
        val server = listOf("Laporan hari ini sudah dikunci.")
        assertEquals(server, galatSetelahUbah(server, terkendala, terkendala.copy(kendala = "x")))
    }

    @Test
    fun ganti_status_ke_berjalan_membuang_galat_khusus_terkendala() {
        val sisa = galatSetelahUbah(galatAwal, terkendala, terkendala.copy(status = "BERJALAN"))
        assertTrue(sisa.isEmpty())
    }

    @Test
    fun bukti_unggahan_tetap_tampil_walau_muat_ulang_gagal() {
        val baru = Bukti(id = "ev1", nama = "foto.jpg", mime = "image/jpeg", ukuran = 10, tautan = null)
        val l = LembarEntri(entriId = null, idTersimpan = "t1", isian = terkendala, buktiBaru = listOf(baru))
        // Muat ulang gagal → daftar server masih kosong.
        assertEquals(listOf(baru), l.gabungBukti(emptyList()))
        // Muat ulang sukses → tidak ganda.
        assertEquals(listOf(baru), l.gabungBukti(listOf(baru)))
    }
}
