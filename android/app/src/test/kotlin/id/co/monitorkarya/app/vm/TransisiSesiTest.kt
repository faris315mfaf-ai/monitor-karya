package id.co.monitorkarya.app.vm

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** C3-T3: status Siap akun baru terbit SETELAH data akun lama dibersihkan. */
class TransisiSesiTest {

    private val log = mutableListOf<String>()

    private suspend fun jalankan(uidBaru: String, uidLama: String?, bersihkan: suspend () -> Unit = { log += "bersihkan" }) =
        transisiSiap(
            uidBaru = uidBaru,
            uidLama = uidLama,
            bersihkan = bersihkan,
            catatUid = { log += "catat:$it" },
            terbitkan = { log += "terbit" },
        )

    @Test
    fun akunBerganti_bersihkanDuluLaluCatatLaluTerbit() = runTest {
        assertTrue(jalankan(uidBaru = "B", uidLama = "A"))
        assertEquals(listOf("bersihkan", "catat:B", "terbit"), log)
    }

    @Test
    fun akunSama_tanpaPembersihan() = runTest {
        assertTrue(jalankan(uidBaru = "A", uidLama = "A"))
        assertEquals(listOf("catat:A", "terbit"), log)
    }

    @Test
    fun pertamaKali_tanpaPembersihan() = runTest {
        assertTrue(jalankan(uidBaru = "A", uidLama = null))
        assertEquals(listOf("catat:A", "terbit"), log)
    }

    @Test
    fun pembersihanLambat_terbitMenungguSampaiSelesai() = runTest {
        val selesai = CompletableDeferred<Unit>()
        val tugas = launch {
            jalankan(uidBaru = "B", uidLama = "A", bersihkan = {
                log += "mulai-bersih"
                selesai.await()
                log += "selesai-bersih"
            })
        }
        runCurrent()
        assertEquals(listOf("mulai-bersih"), log)
        selesai.complete(Unit)
        tugas.join()
        assertEquals(listOf("mulai-bersih", "selesai-bersih", "catat:B", "terbit"), log)
    }

    @Test
    fun pembersihanGagal_tidakTerbitDanUidTidakDicatat() = runTest {
        val hasil = jalankan(uidBaru = "B", uidLama = "A", bersihkan = { error("disk penuh") })
        assertFalse(hasil)
        assertEquals(emptyList<String>(), log)
    }
}
