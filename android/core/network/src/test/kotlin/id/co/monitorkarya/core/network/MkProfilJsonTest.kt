package id.co.monitorkarya.core.network

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Serialisasi profil mulai dingin luring (A1). */
class MkProfilJsonTest {

    @Test
    fun bolakBalik() {
        val p = PeranPengguna("u1", "Sari", "sari@contoh.id", Peran.KEPALA_DIVISI, "pt-9")
        assertEquals(p, profilDariJson(profilKeJson(p)))
        val tanpaScope = p.copy(scopeEntitasId = null)
        assertEquals(tanpaScope, profilDariJson(profilKeJson(tanpaScope)))
    }

    @Test
    fun rusakAtauPeranAsingNull() {
        assertNull(profilDariJson(null))
        assertNull(profilDariJson("bukan json"))
        assertNull(profilDariJson("""{"id":"u1","peran":"RAJA"}"""))
        assertNull(profilDariJson("""{"peran":"PIC_PROYEK"}"""))
    }
}
