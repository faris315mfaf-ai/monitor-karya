package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.network.dto.CountdownDto
import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import id.co.monitorkarya.core.network.dto.DailyInputProjectDto
import id.co.monitorkarya.core.network.dto.DailyOpenDayDto
import id.co.monitorkarya.core.network.dto.DailyReportIsiDto
import id.co.monitorkarya.core.network.dto.UnlockInfoDto
import java.io.ByteArrayInputStream
import java.time.Instant
import java.time.LocalDate
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** C5: T4 meja hari baru saat luring, S5 isian Sheet tersimpan, S2–S4 penyiap bukti. */
class C5LaporanTest {

    private fun potret(todayKey: String = "2026-10-12", lockAt: String = "2026-10-12T10:00:00Z", countdown: CountdownDto? = CountdownDto(1, 0, 3_600_000, false)) =
        DailyInputGetResponse(
            reportDate = "2026-10-11T17:00:00.000Z",
            reportDateKey = todayKey,
            today = true,
            todayKey = todayKey,
            lockAt = lockAt,
            locked = false,
            countdown = countdown,
            canRequestUnlock = true,
            openDays = listOf(DailyOpenDayDto("r-0", "p-1", "Proyek A", "2026-10-10", null)),
            projects = listOf(
                DailyInputProjectDto(
                    id = "p-1",
                    code = "PRJ-1",
                    name = "Proyek A",
                    phase = "Pelaksanaan",
                    taskCount = 3,
                    editable = false,
                    lockReason = "FORWARDED",
                    unlock = UnlockInfoDto("u-1", "DIAJUKAN"),
                    report = DailyReportIsiDto(id = "r-1", status = "TERKIRIM", achievementToday = "Kemarin"),
                ),
            ),
        )

    // ------------------------------------------------------------------ T4

    @Test
    fun mulaiLuringHariBaru_mejaHariIniBukanPotretKemarin() {
        val baru = mejaHariBaru(potret(), LocalDate.parse("2026-10-13"), Instant.parse("2026-10-13T01:00:00Z"))!!
        assertEquals("2026-10-13", baru.reportDateKey)
        assertEquals("2026-10-13", baru.todayKey)
        assertTrue(baru.today)
        // Jam batas PT ikut bergeser satu hari; belum lewat → bisa diisi.
        assertEquals("2026-10-13T10:00:00Z", baru.lockAt)
        assertFalse(baru.locked)
        val p = baru.projects.single()
        assertNull("laporan kemarin tidak tampil sebagai hari ini", p.report)
        assertEquals(0, p.taskCount)
        assertTrue(p.editable)
        assertNull(p.lockReason)
        assertNull(p.unlock)
        assertTrue(baru.openDays.isEmpty())
        // Desk: tanggal kunci (workDate entri baru & kunci antrean) = hari ini.
        assertEquals("2026-10-13", baru.keDesk().tanggalKunci)
    }

    @Test
    fun mejaHariBaru_lewatJamBatasPtTerkunci_dan247TetapTerbuka() {
        val lewat = mejaHariBaru(potret(), LocalDate.parse("2026-10-14"), Instant.parse("2026-10-14T11:00:00Z"))!!
        assertEquals("2026-10-14T10:00:00Z", lewat.lockAt)
        assertTrue(lewat.locked)
        assertEquals("TIME", lewat.projects.single().lockReason)
        assertFalse(lewat.projects.single().editable)

        val bebas = mejaHariBaru(potret(lockAt = "2026-10-12T16:59:59Z", countdown = null), LocalDate.parse("2026-10-13"), Instant.parse("2026-10-13T01:00:00Z"))!!
        assertTrue(bebas.keDesk().mode247)
        assertFalse(bebas.locked)
    }

    @Test
    fun mejaHariBaru_hanyaUntukPotretHariSebelumnya() {
        assertNull(mejaHariBaru(potret(todayKey = "2026-10-13"), LocalDate.parse("2026-10-13"), Instant.now()))
        assertNull("jam perangkat mundur: jangan menebak", mejaHariBaru(potret(todayKey = "2026-10-14"), LocalDate.parse("2026-10-13"), Instant.now()))
        assertNull(mejaHariBaru(potret(todayKey = "rusak"), LocalDate.parse("2026-10-13"), Instant.now()))
    }

    // ------------------------------------------------------------------ S5

    @Test
    fun isianSheetBertahanBolakBalik() {
        val l = LembarEntri(
            entriId = null,
            idTersimpan = "lokal:7",
            isian = IsianEntri(
                judul = "Pasang panel \"A\"",
                deskripsi = "baris 1\nbaris 2",
                pelaksana = "Rani",
                status = "TERKENDALA",
                progres = 40,
                hasil = "Panel 1–4",
                kendala = "Hujan",
                eskalasi = true,
                keputusan = "Tenda",
                rencana = "Lanjut",
            ),
            galat = listOf("tidak dipulihkan"),
            sibuk = true,
            kunciTambah = "11111111-1111-4111-8111-111111111111",
        )
        val kembali = lembarDariJson(lembarKeJson(l))!!
        assertEquals(l.copy(galat = emptyList(), sibuk = false), kembali)
        assertNull(lembarDariJson(null))
        assertNull(lembarDariJson("bukan json"))
    }

    // ------------------------------------------------------------------ S2–S4

    @Test
    fun mimeGenerikDitebakDariNamaDanFotoHeifTetapDiterimaUntukDikompres() {
        assertEquals("application/pdf", tentukanMime("application/octet-stream", "kontrak.PDF"))
        assertEquals("image/jpeg", tentukanMime(null, "a.jpg"))
        assertEquals("image/heif", tentukanMime("image/heif", "IMG_1.HEIF"))
        assertTrue(perluKompres(tentukanMime("image/heif", "x")!!))
        assertEquals("text/plain", tentukanMime("text/plain; charset=utf-8", "a.txt"))
        assertNull(tentukanMime("application/x-msdownload", "a.exe"))
        assertNull(tentukanMime("application/octet-stream", "tanpa-ekstensi"))
    }

    @Test
    fun bacaTerbatasMenolakBerkasBesarTanpaMemuatSemuanya() {
        val kecil = ByteArray(1000) { it.toByte() }
        assertArrayEquals(kecil, bacaTerbatas(ByteArrayInputStream(kecil), 1000))
        var dibaca = 0L
        val raksasa = object : java.io.InputStream() {
            override fun read(): Int = 1
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                dibaca += len
                return len // aliran tak berujung
            }
        }
        try {
            bacaTerbatas(raksasa, 200_000)
            fail("harus ditolak")
        } catch (e: GalatBerkas) {
            assertEquals(PESAN_TERLALU_BESAR, e.message)
        }
        assertTrue("berhenti tepat setelah melewati batas", dibaca <= 200_000 + 64 * 1024)
    }

    @Test
    fun orientasiExifMenjadiDerajatPutar() {
        assertEquals(0, derajatDariOrientasi(1))
        assertEquals(90, derajatDariOrientasi(6))
        assertEquals(180, derajatDariOrientasi(3))
        assertEquals(270, derajatDariOrientasi(8))
        assertEquals(0, derajatDariOrientasi(0))
    }
}
