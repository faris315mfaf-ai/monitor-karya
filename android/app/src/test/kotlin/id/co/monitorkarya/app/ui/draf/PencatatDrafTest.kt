package id.co.monitorkarya.app.ui.draf

import id.co.monitorkarya.core.data.repo.Draf
import id.co.monitorkarya.core.data.repo.KunciDraf
import id.co.monitorkarya.core.data.repo.PenyimpanDraf
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Penyimpan di memori; [log] mencatat urutan tulisan. */
private class PenyimpanPalsu : PenyimpanDraf {
    val isi = mutableMapOf<KunciDraf, String>()
    val log = mutableListOf<String>()

    override suspend fun simpan(kunci: KunciDraf, json: String) {
        isi[kunci] = json
        log += "simpan:$json"
    }

    override suspend fun ambil(kunci: KunciDraf): Draf? = isi[kunci]?.let { Draf(it, 1L) }

    override suspend fun buang(kunci: KunciDraf) {
        isi.remove(kunci)
        log += "buang"
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class PencatatDrafTest {

    private val k = KunciDraf(KunciDraf.LAPORAN_ENTRI, "baru:p1", "2026-10-13")

    @Test
    fun ketikan_beruntun_ditulis_sekali_setelah_jeda() = runTest {
        val p = PenyimpanPalsu()
        val c = PencatatDraf(backgroundScope, p, jedaMs = 600)
        c.catat(k, "a")
        advanceTimeBy(300)
        c.catat(k, "ab")
        advanceTimeBy(300)
        c.catat(k, "abc")
        runCurrent()
        assertTrue("belum ditulis selama masih mengetik", p.log.isEmpty())
        advanceTimeBy(601)
        assertEquals(listOf("simpan:abc"), p.log)
    }

    @Test
    fun segera_membatalkan_catatan_tertunda_yang_lebih_lama() = runTest {
        val p = PenyimpanPalsu()
        val c = PencatatDraf(backgroundScope, p, jedaMs = 600)
        c.catat(k, "lama")
        c.segera(k, null) // simpan sukses → buang
        advanceTimeBy(2_000)
        assertEquals(listOf("buang"), p.log)
        assertNull(p.isi[k])
    }

    @Test
    fun tutup_menulis_seketika_dan_ambil_membaca_tulisan_itu() = runTest {
        val p = PenyimpanPalsu()
        val c = PencatatDraf(backgroundScope, p, jedaMs = 600)
        c.catat(k, "x")
        c.segera(k, "x-final")
        // Dibuka lagi tepat setelah ditutup: ambil antre di belakang tulisan.
        assertEquals("x-final", c.ambil(k)?.json)
        advanceTimeBy(2_000)
        assertEquals(listOf("simpan:x-final"), p.log)
    }

    @Test
    fun catatan_null_membuang_draf_setelah_jeda() = runTest {
        val p = PenyimpanPalsu()
        p.isi[k] = "lama"
        val c = PencatatDraf(backgroundScope, p, jedaMs = 600)
        c.catat(k, null) // isian kembali sama dengan versi tersimpan
        advanceTimeBy(601)
        assertNull(p.isi[k])
    }

    @Test
    fun galat_penyimpan_tidak_menghentikan_antrean() = runTest {
        val p = object : PenyimpanDraf {
            var n = 0
            val tersimpan = mutableListOf<String>()
            override suspend fun simpan(kunci: KunciDraf, json: String) {
                if (n++ == 0) error("disk penuh")
                tersimpan += json
            }
            override suspend fun ambil(kunci: KunciDraf): Draf? = null
            override suspend fun buang(kunci: KunciDraf) = Unit
        }
        val c = PencatatDraf(backgroundScope, p, jedaMs = 10)
        c.segera(k, "1")
        c.segera(k, "2")
        runCurrent()
        assertEquals(listOf("2"), p.tersimpan)
    }

    @Test
    fun teks_penanda_memuat_jam_draf() {
        // 13 Okt 2026 07.05 WIB = 00.05 UTC.
        val ms = java.time.Instant.parse("2026-10-13T00:05:00Z").toEpochMilli()
        assertEquals("Draf dipulihkan · 07.05", teksDrafPulih(ms, ms + 60_000))
    }
}
