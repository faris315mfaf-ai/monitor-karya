package id.co.monitorkarya.designsystem

import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.inisialDari
import id.co.monitorkarya.designsystem.components.labelPic
import id.co.monitorkarya.designsystem.components.projectRowSempit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** E2E-3 B4: ProjectRow tidak boleh menggencet nama proyek di lebar ponsel/sheet. */
class ProjectRowTest {

    @Test
    fun lebar_ponsel_dan_sheet_memakai_susunan_bertumpuk() {
        assertTrue(projectRowSempit(360.dp)) // ponsel potret
        assertTrue(projectRowSempit(411.dp))
        assertTrue(projectRowSempit(440.dp)) // panel samping MkSheet
        assertFalse(projectRowSempit(720.dp)) // tablet / layar lebar
    }

    @Test
    fun label_dan_inisial_pic() {
        assertEquals("PIC Rani Kusuma", labelPic("Rani Kusuma"))
        assertEquals("PIC belum ditentukan", labelPic(" "))
        assertEquals("RK", inisialDari("Rani Kusuma"))
        assertEquals("—", inisialDari(null))
    }
}
