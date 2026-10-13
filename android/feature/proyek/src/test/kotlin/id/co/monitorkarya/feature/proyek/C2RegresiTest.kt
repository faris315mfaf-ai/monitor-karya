package id.co.monitorkarya.feature.proyek

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.data.UsulanTenggatListDto
import id.co.monitorkarya.feature.proyek.ui.Bagian
import id.co.monitorkarya.feature.proyek.ui.DetailUi
import id.co.monitorkarya.feature.proyek.ui.EditorTahapUi
import id.co.monitorkarya.feature.proyek.ui.LapisanSnackbar
import id.co.monitorkarya.feature.proyek.ui.UsulTenggatUi
import id.co.monitorkarya.feature.proyek.ui.lapisanSnackbar
import id.co.monitorkarya.feature.proyek.ui.pernahDitolak
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regresi C2 yang berupa logika murni (tanpa jaringan). */
class C2RegresiTest {

    private fun proyek(json: String): ProyekDto = mkJson.decodeFromString(json)

    @Test
    fun t1SnackbarDirenderDiPermukaanPalingAtas() {
        val d = DetailUi(proyek = proyek(Fixture.proyek("p1")))
        assertEquals(LapisanSnackbar.LAYAR, lapisanSnackbar(null, adaForm = false))
        assertEquals(LapisanSnackbar.DETAIL, lapisanSnackbar(d, adaForm = false))
        assertEquals(LapisanSnackbar.EDITOR_TAHAP, lapisanSnackbar(d.copy(editorTahap = EditorTahapUi()), adaForm = false))
        assertEquals(LapisanSnackbar.USUL_TENGGAT, lapisanSnackbar(d.copy(usulTenggat = UsulTenggatUi()), adaForm = false))
        assertEquals(LapisanSnackbar.FORM, lapisanSnackbar(null, adaForm = true))
        assertEquals(LapisanSnackbar.FORM, lapisanSnackbar(d, adaForm = true))
    }

    @Test
    fun r1UsulanMilikSendiriTidakBolehDiputusSendiri() {
        val daftar = mkJson.decodeFromString(UsulanTenggatListDto.serializer(), Fixture.usulan).copy(canDecide = true)
        val u = daftar.items.single()
        val d = DetailUi(proyek = proyek(Fixture.proyek("p1")), usulan = Bagian.Siap(daftar))
        assertFalse(d.copy(penggunaId = u.proposedById).bolehPutus(u))
        assertTrue(d.copy(penggunaId = "u-direktur").bolehPutus(u))
        // Tanpa profil: ikut canDecide server (server tetap hakim, 403).
        assertTrue(d.bolehPutus(u))
        assertFalse(d.copy(usulan = Bagian.Siap(daftar.copy(canDecide = false)), penggunaId = "u-direktur").bolehPutus(u))
    }

    @Test
    fun r2ProyekPernahDitolakTidakDitawariAktif() {
        assertTrue(pernahDitolak(proyek(Fixture.proyek("p1", lifecycle = "DITOLAK"))))
        val slotTolak = """[{"role":"ADMIN_PT","decision":"DITOLAK","note":"Kurang data","decidedAt":null,"decidedByName":"Budi"}]"""
        assertTrue(pernahDitolak(proyek(Fixture.proyek("p1", lifecycle = "DITUTUP", approvals = slotTolak))))
        assertFalse(pernahDitolak(proyek(Fixture.proyek("p1", lifecycle = "DITUTUP"))))
    }
}
