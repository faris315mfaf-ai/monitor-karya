package id.co.monitorkarya.feature.ringkasangrup.logika

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.ringkasangrup.data.DivisiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.DtoRingkasanGrupTest
import id.co.monitorkarya.feature.ringkasangrup.data.PetaKepatuhanDto
import id.co.monitorkarya.feature.ringkasangrup.data.ProyekGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.SimpulPetaDto
import id.co.monitorkarya.feature.ringkasangrup.data.TepatWaktuDivisiDto
import java.time.ZonedDateTime
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PemetaanTest {

    private val data = mkJson.decodeFromString(RingkasanGrupDto.serializer(), DtoRingkasanGrupTest.JSON_RINGKASAN)

    private fun proyek(id: String, ent: String, lapor: Boolean, status: String = "on", progres: Int = 50) =
        ProyekGrupDto(id = id, entityId = ent, entityName = "PT $ent", entityCode = ent.uppercase(),
            reportedToday = lapor, status = status, progress = progres)

    @Test
    fun kelompokPerusahaan_urut_kemunculan_dan_hitung_lapor() {
        val k = kelompokPerusahaan(
            listOf(proyek("a", "b", true), proyek("c", "a", false), proyek("d", "b", false)),
        )
        assertEquals(listOf("b", "a"), k.map { it.entityId })
        assertEquals(2, k[0].total)
        assertEquals(1, k[0].lapor)
    }

    @Test
    fun e2e3_labelPic_tanpa_awalan_ganda() {
        assertEquals("PIC Rani", labelPic(proyek("a", "b", true).copy(pic = "Rani")))
        assertEquals("PIC Pembangunan Pembangkit", labelPic(proyek("a", "b", true).copy(pic = "PIC Pembangunan Pembangkit")))
        assertEquals("PIC belum ditentukan", labelPic(proyek("a", "b", true).copy(pic = null)))
    }

    @Test
    fun lencanaPerusahaan_seperti_companyBadge() {
        assertEquals(Lencana(StatusRingkas.NEUTRAL, "Belum ada yang wajib"), lencanaPerusahaan(0, 0))
        assertEquals(Lencana(StatusRingkas.DONE, "Semua lapor"), lencanaPerusahaan(3, 3))
        assertEquals(Lencana(StatusRingkas.RISK, "Belum ada yang lapor"), lencanaPerusahaan(0, 3))
        assertEquals(Lencana(StatusRingkas.RISK, "2 belum lapor"), lencanaPerusahaan(1, 3))
    }

    @Test
    fun lencana_laporan_dan_eskalasi() {
        assertEquals("Dikerjakan", lencanaLaporan("ON_PROGRESS").label)
        assertEquals(StatusRingkas.RISK, lencanaLaporan("TERKENDALA").status)
        assertEquals("Tanpa status", lencanaLaporan(null).label)
        assertEquals(StatusRingkas.INFO, lencanaEskalasi("DITINJAU").status)
        assertEquals("ANEH", lencanaEskalasi("ANEH").label)
        assertEquals("Dukungan lintas fungsi", labelDibutuhkan("DUKUNGAN_LINTAS_FUNGSI"))
    }

    @Test
    fun kalimat_jawaban_dan_pendukung() {
        assertEquals("1 dari 2 proyek berjalan sesuai rencana.", kalimatJawaban(data))
        // 1 risk; 1 usulan tenggat → persetujuan menunggu.
        assertEquals("1 perlu perhatian, 0 terlambat. 1 persetujuan menunggu Anda.", kalimatPendukung(data))
        val kosong = data.copy(projects = emptyList(), deadlineProposals = emptyList(), escalations = emptyList())
        assertEquals("Belum ada proyek aktif di cakupan Anda.", kalimatJawaban(kosong))
        assertEquals("Tidak ada proyek yang tertahan. Tidak ada keputusan yang menunggu.", kalimatPendukung(kosong))
        assertEquals("Seluruh grup", labelCakupan(data))
        assertEquals("+3 poin vs akhir minggu lalu", deltaProgres(data))
        assertEquals(47, rataProgres(data.projects))
    }

    @Test
    fun kinerjaDivisi_menggabung_typeName_dan_urut_turun() {
        val d = listOf(
            DivisiGrupDto(id = "1", typeName = "Keuangan", onTime = TepatWaktuDivisiDto(ok = 1, total = 4)),
            DivisiGrupDto(id = "2", typeName = "Keuangan", onTime = TepatWaktuDivisiDto(ok = 3, total = 4, basis = "output")),
            DivisiGrupDto(id = "3", typeName = "Hukum", onTime = TepatWaktuDivisiDto(ok = 9, total = 10)),
            DivisiGrupDto(id = "4", typeName = "SDM", onTime = null),
        )
        val k = kinerjaDivisi(d)
        assertEquals(listOf("Hukum", "Keuangan"), k.map { it.nama })
        assertEquals(50, k[1].pct)
        assertEquals("4 dari 8 output tepat waktu", k[1].meta)
        assertEquals("9 dari 10 proyek lapor hari ini", k[0].meta)
    }

    /** B15 / KEPUTUSAN-AMBANG-KEPATUHAN.md: satu ambang untuk peta, sub-holding, dan 10 PT terendah. */
    @Test
    fun ambang_skor_tunggal() {
        assertEquals(Lencana(StatusRingkas.ON, "Baik"), pitaKepatuhan(90.0))
        assertEquals(Lencana(StatusRingkas.RISK, "Perlu perhatian"), pitaKepatuhan(89.9))
        assertEquals(Lencana(StatusRingkas.RISK, "Perlu perhatian"), pitaKepatuhan(75.0))
        assertEquals(Lencana(StatusRingkas.LATE, "Kritis"), pitaKepatuhan(74.9))
        // PT 80,8: dulu hijau "Sesuai jadwal" di peta, oranye di grafik.
        assertEquals(Lencana(StatusRingkas.RISK, "Perlu perhatian"), pitaKepatuhan(80.8))
        assertEquals(StatusRingkas.NEUTRAL, pitaKepatuhan(null).status)
    }

    @Test
    fun kalimat_kritis_memakai_ambang_75() =
        assertEquals("3 dari 12 entitas berstatus kritis (skor di bawah 75).", kalimatKritis(3, 12))

    @Test
    fun ratakanPeta_berjenjang_dan_datar() {
        val berjenjang = mkJson.decodeFromString(PetaKepatuhanDto.serializer(), DtoRingkasanGrupTest.JSON_PETA)
        val k = ratakanPeta(berjenjang.tree)
        assertEquals(1, k.size)
        assertEquals("Sub-holding Kesehatan", k[0].nama)
        assertEquals(listOf("MDC", "FRM"), k[0].sel.map { it.kode })
        assertEquals(78.5, k[0].rata!!, 0.0)

        val datar = ratakanPeta(
            listOf(
                SimpulPetaDto(id = "a", code = "A", complianceScore = 80.0),
                SimpulPetaDto(id = "b", code = "B", complianceScore = 60.0),
            ),
        )
        assertEquals("Perusahaan", datar.single().nama)
        assertEquals(70.0, datar.single().rata!!, 0.0)
        assertEquals(emptyList<KelompokPeta>(), ratakanPeta(emptyList()))
    }

    @Test
    fun barisMingguan_hanya_kolom_berisi() {
        val b = barisMingguan(
            buildJsonObject {
                put("name", JsonPrimitive("PT A"))
                put("Draft", JsonPrimitive(2))
                put("Menunggu persetujuan", JsonPrimitive(0))
                put("Disetujui", JsonPrimitive(1))
            },
        )
        assertEquals("PT A", b.nama)
        assertEquals(listOf("2 draft", "1 disetujui"), b.lencana.map { it.label })
        assertEquals(StatusRingkas.ON, b.lencana[1].status)
    }

    @Test
    fun format_wib_dan_angka() {
        assertEquals("13 Okt 2026", FormatWib.tanggal("2026-10-12T17:00:00.000Z"))
        assertEquals("14.20", FormatWib.jam("2026-10-13T07:20:00.000Z"))
        assertEquals("-", FormatWib.tanggal(null))
        assertEquals("1.466", FormatWib.angka(1466))
        assertEquals("68,5", FormatWib.desimal(68.54))
        assertEquals("70", FormatWib.desimal(70.0))
        assertEquals("-0,5", FormatWib.desimal(-0.5))
        assertEquals("-1,5", FormatWib.desimal(-1.54))
        assertEquals("-2", FormatWib.desimal(-2.0))
        val sekarang = ZonedDateTime.parse("2026-10-13T10:00:00+07:00[Asia/Jakarta]")
        assertEquals("Baru saja", FormatWib.relatif("2026-10-13T02:59:40.000Z", sekarang))
        assertEquals("5 menit lalu", FormatWib.relatif("2026-10-13T02:55:00.000Z", sekarang))
        assertEquals("Kemarin", FormatWib.relatif("2026-10-12T02:00:00.000Z", sekarang))
        assertEquals(
            "Senin, 12 Oktober 2026",
            FormatWib.tanggalPanjang(ZonedDateTime.parse("2026-10-12T08:00:00+07:00[Asia/Jakarta]")),
        )
        assertNull(FormatWib.urai("bukan tanggal"))
        assertEquals(50, persen(1, 2))
        assertEquals(0, persen(1, 0))
    }
}
