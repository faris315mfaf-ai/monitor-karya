package id.co.monitorkarya.core.domain.teks

import org.junit.Assert.assertEquals
import org.junit.Test

/** BUG-14a / N-05 / E2E-R2-3 N2: tanpa "PIC PIC …" dan "PIC Belum ada PIC". */
class LabelPicTest {

    @Test
    fun namaBiasaDiberiAwalan() = assertEquals("PIC Bpk. Yudi", labelPic("Bpk. Yudi"))

    @Test
    fun namaBerawalanPicTidakDigandakan() =
        assertEquals("PIC Pembangunan Pembangkit Baru", labelPic("PIC Pembangunan Pembangkit Baru"))

    @Test
    fun placeholderServerDanKosong() {
        assertEquals(PIC_KOSONG, labelPic("Belum ada PIC"))
        assertEquals(PIC_KOSONG, labelPic(null))
        assertEquals(PIC_KOSONG, labelPic("  "))
        assertEquals(PIC_KOSONG, labelPic("-"))
    }
}
