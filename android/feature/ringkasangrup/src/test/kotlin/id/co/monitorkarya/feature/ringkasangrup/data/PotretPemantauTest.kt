package id.co.monitorkarya.feature.ringkasangrup.data

import id.co.monitorkarya.core.data.repo.Tersimpan
import id.co.monitorkarya.feature.ringkasangrup.Bagian
import java.io.IOException
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/** E2E-R2-3 B6: daring dulu; potret Room HANYA saat server tak terjangkau. */
class PotretPemantauTest {

    private val disimpan = mutableListOf<String>()
    private var potretDibaca = 0
    private fun potretAda(): suspend () -> Tersimpan<String>? = { potretDibaca++; Tersimpan("kemarin-sore", 1_000L) }
    private fun tanpaPotret(): suspend () -> Tersimpan<String>? = { potretDibaca++; null }

    @Test
    fun suksesDisimpanDanSegar() = runTest {
        val (b, t) = ambilDaringDulu({ Response.success("segar") }, { disimpan += it }, potretAda())
        assertEquals(Bagian.Siap("segar"), b)
        assertNull(t)
        assertEquals(listOf("segar"), disimpan)
        assertEquals(0, potretDibaca)
    }

    @Test
    fun luringMemakaiPotretBerwaktu() = runTest {
        val (b, t) = ambilDaringDulu<String>({ throw IOException("ECONNREFUSED") }, { disimpan += it }, potretAda())
        assertEquals(Bagian.Siap("kemarin-sore"), b)
        assertEquals(1_000L, t)
        assertTrue(disimpan.isEmpty())
    }

    @Test
    fun luringTanpaPotretTetapGalat() = runTest {
        val (b, t) = ambilDaringDulu<String>({ throw IOException("ECONNREFUSED") }, { disimpan += it }, tanpaPotret())
        assertTrue(b is Bagian.Galat)
        assertNull(t)
    }

    @Test
    fun galatServerTidakMemakaiPotret() = runTest {
        val (b, t) = ambilDaringDulu<String>({ Response.error(500, "{}".toResponseBody()) }, { disimpan += it }, potretAda())
        assertTrue(b is Bagian.Galat)
        assertNull(t)
        assertEquals(0, potretDibaca)
        assertTrue(disimpan.isEmpty())
    }

    @Test
    fun ditolakTetapDitolak() = runTest {
        val (b, _) = ambilDaringDulu<String>({ Response.error(403, "{}".toResponseBody()) }, { disimpan += it }, potretAda())
        assertTrue(b is Bagian.Ditolak)
        assertEquals(0, potretDibaca)
    }

    @Test
    fun kunciMemuatTanggal() {
        assertEquals("pemantau:ringkasan:2026-10-13", KunciPotret.ringkasan("2026-10-13"))
        assertEquals("pemantau:peta:2026-10-13", KunciPotret.peta("2026-10-13"))
    }
}
