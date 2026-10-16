package id.co.monitorkarya.core.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Pemetaan nama peran web → [Peran]; peran yang belum dikenal aplikasi = null. */
class PeranTest {

    @Test
    fun `peran subholding dikenali`() {
        assertEquals(Peran.ADMIN_SUBHOLDING, Peran.dariNama("ADMIN_SUBHOLDING"))
        assertEquals(Peran.SUPERVISOR, Peran.dariNama("SUPERVISOR"))
        assertEquals(Peran.SUPERUSER, Peran.dariNama("SUPERUSER"))
        assertEquals("Admin subholding", Peran.ADMIN_SUBHOLDING.labelIndonesia)
    }

    @Test
    fun `peran asing atau kosong menjadi null, bukan auditor`() {
        assertNull(Peran.dariNama("KETUA_UMUM"))
        assertNull(Peran.dariNama("supervisor"))
        assertNull(Peran.dariNama(""))
        assertNull(Peran.dariNama(null))
    }
}
