package id.co.monitorkarya.core.domain.status

import id.co.monitorkarya.core.domain.model.MkStatusDomain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Batas ambang kepatuhan sama persis dengan tests/lib/compliance-band.test.ts (web). */
class PitaKepatuhanTest {

    @Test
    fun sembilanPuluhBaik() {
        assertEquals(PitaKepatuhan.BAIK, pitaKepatuhan(90.0))
        assertEquals(MkStatusDomain.ON, pitaKepatuhan(90.0).status)
        assertEquals("Baik", pitaKepatuhan(90.0).label)
        assertEquals(PitaKepatuhan.BAIK, pitaKepatuhan(100.0))
    }

    @Test
    fun delapanPuluhSembilanKomaSembilanPerluPerhatianTanpaPembulatan() {
        assertEquals(PitaKepatuhan.PERHATIAN, pitaKepatuhan(89.9))
        assertEquals(MkStatusDomain.RISK, pitaKepatuhan(89.9).status)
        assertEquals("Perlu perhatian", pitaKepatuhan(89.9).label)
    }

    @Test
    fun tujuhPuluhLimaPerluPerhatian() = assertEquals(PitaKepatuhan.PERHATIAN, pitaKepatuhan(75.0))

    @Test
    fun tujuhPuluhEmpatKomaSembilanKritis() {
        assertEquals(PitaKepatuhan.KRITIS, pitaKepatuhan(74.9))
        assertEquals(MkStatusDomain.LATE, pitaKepatuhan(74.9).status)
        assertEquals("Kritis", pitaKepatuhan(74.9).label)
        assertEquals(PitaKepatuhan.KRITIS, pitaKepatuhan(0.0))
    }

    /** B15: PT 80,8 dulu hijau di peta tetapi oranye di grafik — kini satu jawaban. */
    @Test
    fun delapanPuluhKomaDelapanPerluPerhatian() = assertEquals(PitaKepatuhan.PERHATIAN, pitaKepatuhan(80.8))

    @Test
    fun tanpaSkorNull() = assertNull(pitaKepatuhanAtauNull(null))

    @Test
    fun legendaUrutTetapDanRentangTertulis() {
        assertEquals(
            listOf("Baik ≥ 90", "Perlu perhatian 75–89", "Kritis < 75"),
            PitaKepatuhan.LEGENDA.map { "${it.label} ${it.rentang}" },
        )
    }
}
