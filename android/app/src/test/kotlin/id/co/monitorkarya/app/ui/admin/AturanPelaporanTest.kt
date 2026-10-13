package id.co.monitorkarya.app.ui.admin

import id.co.monitorkarya.core.network.dto.AturanPelaporanResponse
import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Panel Aturan pelaporan (BUG-02) terhadap rute
 * src/app/api/admin/report-settings/route.ts.
 */
class AturanPelaporanTest {

    private fun respons(json: String) = mkJson.decodeFromString<AturanPelaporanResponse>(json)

    @Test
    fun barisServer247DipetakanTanpaJam() {
        val r = respons(
            """{"settings":{"id":"rs1","entityId":"pt-1","dailyCutoffHour":null,"workingDays":[],
               "dailyOpen":true,"weeklyCutoffHour":null,"weeklyOpen":true,
               "createdAt":"2026-10-10T01:00:00.000Z","updatedAt":"2026-10-10T01:00:00.000Z"}}""",
        )
        assertEquals("pt-1", r.settings?.entityId)
        val a = petaAturan(r.settings)
        assertNull(a.jamHarian)
        assertNull(a.jamMingguan)
        assertTrue(a.hariKerja.isEmpty())
        assertFalse(a.bawaan)
        assertEquals("Mode saat ini: 24/7 · Terbuka", ringkasanMode(a))
        assertEquals("24/7 tanpa batas", teksJamHarian(a))
        assertEquals("Setiap hari", ringkasanHari(a.hariKerja))
    }

    @Test
    fun settingsNullBerartiBawaanServer() {
        val a = petaAturan(respons("""{"settings":null}""").settings)
        assertTrue(a.bawaan)
        assertEquals(17, a.jamHarian)
        assertEquals(listOf(1, 2, 3, 4, 5), a.hariKerja)
        assertEquals("Mode saat ini: Batasi 17.00 WIB · Terbuka", ringkasanMode(a))
        assertEquals("Senin–Jumat", ringkasanHari(a.hariKerja))
    }

    @Test
    fun nilaiGanjilDijepitDanDiurutkan() {
        val a = petaAturan(
            respons("""{"settings":{"dailyCutoffHour":30,"workingDays":[5,1,1,9],"dailyOpen":false,"weeklyCutoffHour":-2,"weeklyOpen":false}}""").settings,
        )
        assertEquals(23, a.jamHarian)
        assertEquals(0, a.jamMingguan)
        assertEquals(listOf(1, 5), a.hariKerja)
        assertEquals("Mode saat ini: Batasi 23.00 WIB · Ditutup", ringkasanMode(a))
        assertEquals("Senin, Jumat", ringkasanHari(a.hariKerja))
    }

    @Test
    fun validasiJamKustom() {
        assertEquals(HasilJam.Sah(17), bacaJam("17"))
        assertEquals(HasilJam.Sah(9), bacaJam(" 9.00 "))
        assertEquals(HasilJam.Sah(0), bacaJam("0:00"))
        assertEquals(HasilJam.Sah(23), bacaJam("23"))
        assertEquals(HasilJam.Sah(null), bacaJam("24/7"))
        assertEquals(HasilJam.Sah(null), bacaJam("Tanpa batas"))
        assertTrue(bacaJam("24") is HasilJam.Galat)
        assertTrue(bacaJam("-1") is HasilJam.Galat)
        assertTrue(bacaJam("17.30") is HasilJam.Galat)
        assertTrue(bacaJam("") is HasilJam.Galat)
        assertTrue(bacaJam("jam lima") is HasilJam.Galat)
    }

    @Test
    fun badanPutMengirimNullEksplisitUntuk247() {
        val b = badanSimpan("pt-1", PerubahanAturan.JamHarian(null))
        assertEquals("pt-1", b["entityId"]?.jsonPrimitive?.content)
        assertTrue(b.containsKey("dailyCutoffHour"))
        assertEquals(JsonNull, b["dailyCutoffHour"])
        assertEquals(2, b.size)
        // Terserialisasi lewat mkJson: null tetap ada (bukan dibuang).
        assertTrue(mkJson.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), b).contains("\"dailyCutoffHour\":null"))
    }

    @Test
    fun badanPutHanyaFieldYangBerubah() {
        assertEquals(JsonPrimitive(15), badanSimpan("pt", PerubahanAturan.JamMingguan(15))["weeklyCutoffHour"])
        assertEquals(JsonPrimitive(false), badanSimpan("pt", PerubahanAturan.BukaHarian(false))["dailyOpen"])
        assertEquals(JsonPrimitive(true), badanSimpan("pt", PerubahanAturan.BukaMingguan(true))["weeklyOpen"])
        val hari = badanSimpan("pt", PerubahanAturan.HariKerja(listOf(5, 1, 3, 3)))["workingDays"]!!.jsonArray
        assertEquals(listOf(1, 3, 5), hari.map { it.jsonPrimitive.content.toInt() })
        assertEquals(0, badanSimpan("pt", PerubahanAturan.HariKerja(emptyList()))["workingDays"]!!.jsonArray.size)
    }

    @Test
    fun alihHariSamaDenganWeb() {
        assertEquals(listOf(1, 2, 3), alihHari(listOf(1, 3), 2))
        assertEquals(listOf(3), alihHari(listOf(1, 3), 1))
        // Melepas hari terakhir = kosong = setiap hari.
        assertEquals(emptyList<Int>(), alihHari(listOf(3), 3))
    }

    @Test
    fun terapkanDanPesanTersimpan() {
        val a = ATURAN_BAWAAN_SERVER.terapkan(PerubahanAturan.JamHarian(null))
        assertNull(a.jamHarian)
        assertFalse(a.bawaan)
        assertEquals("Laporan harian kini 24/7 tanpa jam batas.", pesanTersimpan(PerubahanAturan.JamHarian(null)))
        assertEquals("Jam batas harian disimpan: 20.00 WIB.", pesanTersimpan(PerubahanAturan.JamHarian(20)))
        assertEquals("Hari wajib lapor disimpan: Setiap hari.", pesanTersimpan(PerubahanAturan.HariKerja(emptyList())))
    }

    @Test
    fun pilihanJamMenampilkanJamKustomAktif() {
        assertEquals(PILIHAN_JAM_HARIAN, pilihanJam(PILIHAN_JAM_HARIAN, null))
        assertEquals(PILIHAN_JAM_HARIAN, pilihanJam(PILIHAN_JAM_HARIAN, 17))
        assertEquals(listOf(9, 10, 12, 15, 17, 20, 23), pilihanJam(PILIHAN_JAM_HARIAN, 10))
        assertEquals("09.00", labelJam(9))
    }

    @Test
    fun keTenggatMembawaJamDanStatus() {
        val t = ATURAN_BAWAAN_SERVER.copy(jamHarian = null, mingguanBuka = false).keTenggat()
        assertNull(t.jamHarian)
        assertEquals(17, t.jamMingguan)
        assertTrue(t.harianBuka)
        assertFalse(t.mingguanBuka)
    }
}
