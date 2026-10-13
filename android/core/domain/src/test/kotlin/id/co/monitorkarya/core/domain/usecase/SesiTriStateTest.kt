package id.co.monitorkarya.core.domain.usecase

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tri-state sesi + gerbang mulai dingin luring (A1-LURING.md §1). */
class SesiTriStateTest {

    private val budi = PeranPengguna(
        id = "u-1",
        nama = "Budi",
        email = "budi@contoh.id",
        peran = Peran.PIC_PROYEK,
        scopeEntitasId = "pt-1",
    )

    private fun sesi(saya: suspend () -> PeranPengguna?) = SesiUseCase(
        login = { _, _ -> error("tidak dipakai") },
        saya = saya,
        gantiSandi = { _, _ -> true },
        keluarSesi = {},
    )

    @Test
    fun sahTidakSahTakTerjangkau() = runBlocking {
        assertEquals(HasilSaya.Sah(budi), sesi { budi }.muatSaya())
        assertEquals(HasilSaya.TidakSah, sesi { null }.muatSaya())
        val luring = sesi { throw IOException("Unable to resolve host") }.muatSaya()
        assertTrue(luring is HasilSaya.TakTerjangkau)
        assertEquals(SesiUseCase.PESAN_SERVER, (luring as HasilSaya.TakTerjangkau).pesan)
    }

    @Test
    fun luringDenganCookieDanProfilMasukKeShellBertandaLuring() {
        val k = SesiUseCase.putuskanMulai(HasilSaya.TakTerjangkau("x"), adaCookie = true, profilTersimpan = budi)
        assertEquals(KeputusanMulai.Masuk(budi, luring = true), k)
    }

    @Test
    fun luringTanpaProfilAtauCookieKeLogin() {
        assertEquals(
            KeputusanMulai.KeLogin(SesiUseCase.PESAN_LURING_TANPA_PROFIL),
            SesiUseCase.putuskanMulai(HasilSaya.TakTerjangkau("x"), adaCookie = true, profilTersimpan = null),
        )
        assertEquals(
            KeputusanMulai.KeLogin(null),
            SesiUseCase.putuskanMulai(HasilSaya.TakTerjangkau("x"), adaCookie = false, profilTersimpan = budi),
        )
    }

    @Test
    fun unauthorizedNyataSelaluKeLoginWalauProfilTersimpan() {
        assertEquals(
            KeputusanMulai.KeLogin(null),
            SesiUseCase.putuskanMulai(HasilSaya.TidakSah, adaCookie = true, profilTersimpan = budi),
        )
    }

    @Test
    fun sahSelaluDaring() {
        val lain = budi.copy(nama = "Budi Baru")
        assertEquals(
            KeputusanMulai.Masuk(lain, luring = false),
            SesiUseCase.putuskanMulai(HasilSaya.Sah(lain), adaCookie = true, profilTersimpan = budi),
        )
    }
}
