package id.co.monitorkarya.core.domain.usecase

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Audit T12: pesan server (429/401/422) pada ganti sandi tidak boleh diratakan
 * menjadi "Tidak dapat menghubungi server".
 */
class SesiUseCaseT12Test {

    private fun sesi(gantiSandi: suspend (String, String) -> Boolean) = SesiUseCase(
        login = { _, _ -> error("tidak dipakai") },
        saya = { null },
        gantiSandi = gantiSandi,
        keluarSesi = {},
    )

    @Test
    fun pesanServerGalatSesiDitampilkanApaAdanya() = runBlocking {
        val hasil = sesi { _, _ -> throw GalatSesi("Terlalu banyak percobaan. Coba lagi dalam 15 menit.") }
            .ubahSandi("lama-lama-1", "baru-baru-2")
        assertEquals(HasilUbahSandi.Gagal("Terlalu banyak percobaan. Coba lagi dalam 15 menit."), hasil)
    }

    @Test
    fun galatTakTerdugaTetapPesanServerUmum() = runBlocking {
        val hasil = sesi { _, _ -> throw IllegalStateException("boom") }.ubahSandi("lama-lama-1", "baru-baru-2")
        assertEquals(HasilUbahSandi.Gagal(SesiUseCase.PESAN_SERVER), hasil)
    }

    @Test
    fun sukses() = runBlocking {
        assertTrue(sesi { _, _ -> true }.ubahSandi("lama-lama-1", "baru-baru-2") is HasilUbahSandi.Sukses)
    }

    @Test
    fun validasiKlienSebelumPanggilJaringan() = runBlocking {
        var dipanggil = false
        val uc = sesi { _, _ -> dipanggil = true; true }
        assertEquals(HasilUbahSandi.Gagal("Kata sandi baru minimal 8 karakter."), uc.ubahSandi("lama", "pendek"))
        assertEquals(HasilUbahSandi.Gagal("Kata sandi masih sama dengan yang lama."), uc.ubahSandi("samasama1", "samasama1"))
        assertTrue(!dipanggil)
    }
}
