package id.co.monitorkarya.app.vm

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** C5-T3 + tinjauan C4: urutan masuk/keluar terhadap antrean dan data akun lama. */
class KeluarMasukC5Test {

    private val log = mutableListOf<String>()

    @Test
    fun masuk_lupakanSesiLaluTungguPekerjaSebelumLogin() = runTest {
        siapkanMasuk(lupakanSesi = { log += "lupakan-uid" }, hentikanPekerja = { log += "hentikan+tunggu" })
        log += "login"
        assertEquals(listOf("lupakan-uid", "hentikan+tunggu", "login"), log)
    }

    @Test
    fun keluar_membersihkanRoomDanCacheLaluTanpaSesi() = runTest {
        prosesKeluar(
            lupakanSesi = { log += "lupakan-uid" },
            bersihkan = { log += "hentikanDanBersihkan" },
            hapusProfil = { log += "hapus-profil" },
            terbitkanTanpaSesi = { log += "tanpa-sesi" },
        )
        assertEquals(listOf("lupakan-uid", "hentikanDanBersihkan", "hapus-profil", "tanpa-sesi"), log)
    }

    @Test
    fun keluar_pembersihanGagalTetapKeluarDanProfilTerhapus() = runTest {
        prosesKeluar(
            lupakanSesi = { log += "lupakan-uid" },
            bersihkan = { error("disk penuh") },
            hapusProfil = { log += "hapus-profil" },
            terbitkanTanpaSesi = { log += "tanpa-sesi" },
        )
        assertEquals(listOf("lupakan-uid", "hapus-profil", "tanpa-sesi"), log)
    }
}
