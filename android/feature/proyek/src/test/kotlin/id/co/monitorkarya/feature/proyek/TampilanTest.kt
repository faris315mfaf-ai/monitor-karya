package id.co.monitorkarya.feature.proyek

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.data.RingkasanProyekDto
import id.co.monitorkarya.feature.proyek.domain.LangkahPersetujuan
import id.co.monitorkarya.feature.proyek.domain.Nada
import id.co.monitorkarya.feature.proyek.domain.ZONA_WIB
import id.co.monitorkarya.feature.proyek.domain.kalimatDukungan
import id.co.monitorkarya.feature.proyek.domain.kalimatJawaban
import id.co.monitorkarya.feature.proyek.domain.kunciTanggal
import id.co.monitorkarya.feature.proyek.domain.langkahPersetujuan
import id.co.monitorkarya.feature.proyek.domain.sisaHari
import id.co.monitorkarya.feature.proyek.domain.statusTampil
import java.time.LocalDate
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Port projectState/answerFor/supportFor/approvalSteps web. */
class TampilanTest {

    private val sekarang = ZonedDateTime.of(2026, 10, 13, 10, 0, 0, 0, ZONA_WIB)

    private fun p(json: String): ProyekDto = mkJson.decodeFromString(json)

    @Test
    fun pengajuanMenungguPenyetujuGiliran() {
        val s = statusTampil(p(Fixture.proyek(lifecycle = "DIUSULKAN", pendingRole = "ADMIN_PT")), sekarang)
        assertEquals(Nada.INFO, s.nada)
        assertEquals("Menunggu Admin PT", s.label)
        assertEquals(0, s.progres)
    }

    @Test
    fun ditolakMembawaAlasanPenolakan() {
        val s = statusTampil(
            p(
                Fixture.proyek(
                    lifecycle = "DITOLAK",
                    chain = """["ADMIN_PT"]""",
                    approvals = """[{"role":"ADMIN_PT","decision":"DITOLAK","note":"Anggaran belum jelas","decidedAt":null,"decidedByName":"Budi"}]""",
                ),
            ),
            sekarang,
        )
        assertEquals(Nada.LATE, s.nada)
        assertEquals("Ditolak", s.label)
        assertEquals("Anggaran belum jelas", s.alasan)
    }

    @Test
    fun aktifSesuaiJadwalBerisikoDanTerlambat() {
        val on = statusTampil(p(Fixture.proyek()), sekarang)
        assertEquals(Nada.ON, on.nada)
        assertNull(on.label)
        assertEquals(40, on.progres)

        val risk = statusTampil(
            p(Fixture.proyek(latestReport = """{"status":"TERKENDALA","progressPct":30,"reportDate":"2026-10-12T17:00:00.000Z","isLate":false,"obstacle":"Hujan deras. Lokasi banjir.","needsEscalation":false}""")),
            sekarang,
        )
        assertEquals(Nada.RISK, risk.nada)
        assertEquals("Hujan deras.", risk.alasan)

        // Tenggat instan (00.00Z = 07.00 WIB) hari ini sudah lewat pukul 10.00 WIB, seperti server.
        val late = statusTampil(p(Fixture.proyek(targetEndDate = "2026-10-11T00:00:00.000Z")), sekarang)
        assertEquals(Nada.LATE, late.nada)
        assertEquals("Lewat tenggat 2 hari", late.alasan)
    }

    @Test
    fun arsipDanTutupMemakaiSiklusHidup() {
        assertEquals(Nada.NEUTRAL to "Diarsipkan", statusTampil(p(Fixture.proyek(lifecycle = "DIARSIPKAN")), sekarang).let { it.nada to it.label })
        assertEquals(Nada.DONE to "Ditutup", statusTampil(p(Fixture.proyek(lifecycle = "DITUTUP")), sekarang).let { it.nada to it.label })
    }

    @Test
    fun kalimatJawabanDanDukungan() {
        assertEquals("Belum ada proyek aktif.", kalimatJawaban("AKTIF", 0, false))
        assertEquals("Tidak ada proyek yang cocok dengan saringan ini.", kalimatJawaban("AKTIF", 0, true))
        assertEquals("1.240 proyek aktif yang cocok dengan saringan.", kalimatJawaban("AKTIF", 1240, true))
        assertEquals("3 pengajuan menunggu persetujuan.", kalimatJawaban("DIUSULKAN", 3, false))
        assertEquals("5 proyek di semua status.", kalimatJawaban("ALL", 5, false))
        assertEquals(
            "1 pengajuan menunggu keputusan Anda, 2 terlambat, 1 belum punya laporan harian.",
            kalimatDukungan(RingkasanProyekDto(running = 4, waiting = 1, late = 2, silent = 1)),
        )
        assertEquals("Semua proyek aktif sesuai jadwal.", kalimatDukungan(RingkasanProyekDto(running = 4)))
        assertNull(kalimatDukungan(RingkasanProyekDto()))
    }

    @Test
    fun langkahRantaiPersetujuan() {
        val l = langkahPersetujuan(
            p(
                Fixture.proyek(
                    lifecycle = "DIUSULKAN",
                    pendingRole = "DIREKTUR_ENTITAS",
                    chain = """["ADMIN_PT","DIREKTUR_ENTITAS","MANAJEMEN"]""",
                    approvals = """[
                      {"role":"ADMIN_PT","decision":"DISETUJUI","note":"Oke","decidedAt":"2026-10-12T03:05:00.000Z","decidedByName":"Budi"},
                      {"role":"DIREKTUR_ENTITAS","decision":null,"note":null,"decidedAt":null,"decidedByName":null},
                      {"role":"MANAJEMEN","decision":null,"note":null,"decidedAt":null,"decidedByName":null}
                    ]""",
                ),
            ),
        )
        assertEquals(LangkahPersetujuan.Keadaan.SELESAI, l[0].keadaan)
        assertEquals("Disetujui · Oke", l[0].meta)
        assertEquals("Budi · 12 Okt 2026 · 10.05", l[0].sub)
        assertEquals(LangkahPersetujuan.Keadaan.GILIRAN, l[1].keadaan)
        assertEquals("Direktur entitas", l[1].judul)
        assertEquals(LangkahPersetujuan.Keadaan.MENUNGGU, l[2].keadaan)
        assertEquals("Manajemen holding", l[2].judul)
    }

    @Test
    fun tanggalWibUntukIsian() {
        // Tengah malam WIB tersimpan sebagai 17.00Z hari sebelumnya (toDateInput web).
        assertEquals("2026-09-11", kunciTanggal("2026-09-10T17:00:00Z"))
        assertEquals("", kunciTanggal(null))
        assertEquals(-2L, sisaHari("2026-10-11T00:00:00.000Z", LocalDate.of(2026, 10, 13)))
    }
}
