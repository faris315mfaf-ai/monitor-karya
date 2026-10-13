package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Logika murni laporan harian PIC multi-entri (agen A1). Rujukan perilaku:
 * src/components/views/daily-input-view.tsx (composeReportBody,
 * composeAchievement, reportState, EntrySheet.save, LockNotice) dan
 * src/app/api/daily-input/route.ts (lockAt per aturan PT, countdown null = 24/7).
 */
class LaporanLogikaTest {

    private fun entri(
        id: String,
        status: String = "BERJALAN",
        hasil: String? = null,
        kendala: String? = null,
        keputusan: String? = null,
        rencana: String? = null,
        progres: Int = 50,
        bukti: Int = 0,
    ) = Entri(
        id = id, judul = "Entri $id", deskripsi = null, pelaksana = "Rina", picUserId = null,
        status = status, progres = progres, hasil = hasil, kendala = kendala, keputusan = keputusan,
        rencana = rencana, eskalasi = false, escalationId = null, tags = emptyList(), urgensi = "SEDANG",
        mulaiIso = null, selesaiIso = null, subtugas = emptyList(),
        bukti = List(bukti) { Bukti("ev-$id-$it", "foto.jpg", "image/jpeg", 10, null) },
    )

    // ------------------------------------------------------------ narasi

    @Test
    fun narasiDigabungDenganPemisahGarisTegak() {
        val n = gabungNarasi(
            listOf(
                entri("a", hasil = " Modul izin diuji ", rencana = "Rilis"),
                entri("b", hasil = "", kendala = "Crane telat", rencana = null),
                entri("c", hasil = "Tower naik", keputusan = "Setujui sewa", rencana = "Sewa crane"),
            ),
        )
        assertEquals("Modul izin diuji | Tower naik", n.capaian)
        assertEquals("Entri b: Crane telat | Entri c: Setujui sewa", n.kendala)
        assertEquals("Rilis | Sewa crane", n.rencana)
    }

    @Test
    fun capaianTanpaNarasiMemakaiRingkasanRollup() {
        val n = gabungNarasi(listOf(entri("a", status = "SELESAI"), entri("b", progres = 40)))
        assertEquals("Selesai: Entri a. Berjalan: Entri b (40%)", n.capaian)
        assertNull(n.kendala)
        assertNull(n.rencana)
        assertEquals("1 entri tercatat, belum ada yang selesai atau berjalan.", susunCapaian(listOf(entri("x", status = "TERKENDALA"))))
    }

    @Test
    fun ringkasanDanPetunjukKirim() {
        assertEquals("Belum ada entri", ringkasEntri(emptyList()))
        val daftar = listOf(entri("a", status = "SELESAI"), entri("b", status = "TERKENDALA"), entri("c"))
        assertEquals("3 entri · 1 selesai · 1 terkendala", ringkasEntri(daftar))
        assertEquals("Tambahkan minimal satu entri sebelum mengirim laporan.", petunjukKirim(emptyList(), null))
        assertTrue(buktiKurang(daftar, null))
        assertEquals("Lampirkan minimal 1 bukti pada entri sebelum mengirim laporan.", petunjukKirim(daftar, null))
        // Bukti entri yang belum terhitung roll-up (draf belum disimpan) tetap dihitung.
        assertFalse(buktiKurang(listOf(entri("a", bukti = 1)), null))
        val laporan = LaporanTersimpan("r", "ON_PROGRESS", 40, jumlahBukti = 2, terkirimIso = null, diteruskanIso = null, terkunci = false)
        assertFalse(buktiKurang(daftar, laporan))
        assertNull(petunjukKirim(daftar, laporan))
    }

    // ------------------------------------------------------------ validasi & isian

    @Test
    fun validasiEntriSamaDenganWeb() {
        assertEquals(listOf("Judul entri wajib diisi."), validasiEntri(IsianEntri()))
        val terkendala = IsianEntri(judul = "x", status = "TERKENDALA")
        assertEquals(
            listOf(
                "Uraian kendala wajib diisi untuk status Terkendala.",
                "Rencana besok wajib diisi untuk status Terkendala.",
            ),
            validasiEntri(terkendala),
        )
        val eskalasi = IsianEntri(judul = "x", eskalasi = true)
        assertEquals(1, validasiEntri(eskalasi).size)
        assertTrue(validasiEntri(eskalasi.copy(keputusan = "Setujui")).isEmpty())
    }

    @Test
    fun statusSelesaiMendorongProgres100DanStatusLamaTetapTerwakili() {
        assertEquals(100, IsianEntri(progres = 30).denganStatus("SELESAI").progres)
        assertEquals(30, IsianEntri(progres = 30).denganStatus("TERKENDALA").progres)
        assertEquals(3, pilihanStatusUntuk("BERJALAN").size)
        val lama = pilihanStatusUntuk("MENUNGGU_KEPUTUSAN")
        assertEquals(4, lama.size)
        assertEquals("Menunggu keputusan", lama.last().second)
    }

    @Test
    fun permintaanEntriBaruDanUbah() {
        val isian = IsianEntri(judul = "  Uji  ", pelaksana = "Rina", status = "BERJALAN", progres = 120, hasil = "", rencana = " besok ")
        val baru = susunPermintaanEntri("p-1", "2026-10-13", null, null, isian)
        assertEquals("p-1", baru.projectId)
        assertEquals("2026-10-13", baru.workDate)
        assertNull(baru.id)
        assertEquals("Uji", baru.title)
        assertEquals(100, baru.progressPct)
        assertNull(baru.achievementToday)
        assertEquals("besok", baru.followUp)
        assertEquals("HARIAN", baru.context)

        val lama = entri("t-1").copy(
            picUserId = "u-9", tags = listOf("lapangan"), urgensi = "TINGGI",
            mulaiIso = "2026-10-13T01:00:00Z", selesaiIso = "2026-10-13T03:30:00Z",
            subtugas = listOf(SubtaskInputDto("Cek baut", true)),
        )
        val ubah = susunPermintaanEntri("p-1", "2026-10-13", "t-1", lama, isian)
        assertEquals("t-1", ubah.id)
        assertNull(ubah.projectId)
        assertNull(ubah.workDate)
        assertEquals("u-9", ubah.picUserId)
        assertEquals("TINGGI", ubah.urgency)
        assertEquals("08:00", ubah.startTime)
        assertEquals("10:30", ubah.endTime)
        assertEquals(1, ubah.subtasks.size)
    }

    // ------------------------------------------------------------ meja & kunci

    private fun meja(json: String): DeskLaporan = mkJson.decodeFromString<DailyInputGetResponse>(json).keDesk()

    private val proyekJson = """
        {"id":"p-1","code":"PRJ-1","name":"Aplikasi Absensi","phase":"PELAKSANAAN","taskCount":2,"derived":true,
         "editable":false,"lockReason":"FORWARDED","unlock":null,
         "report":{"id":"r-1","status":"ON_PROGRESS","progressPct":40,"achievementToday":"x","evidenceCount":1,
           "submittedAt":"2026-10-13T08:00:00.000Z","forwardedAt":"2026-10-13T09:00:00.000Z","isLocked":true,"evidence":[]}}
    """.trimIndent()

    @Test
    fun mode247DariCountdownNull() {
        val d = meja(
            """{"reportDate":"2026-10-12T17:00:00.000Z","reportDateKey":"2026-10-13","today":true,"todayKey":"2026-10-13",
               "lockAt":"2026-10-13T17:00:00.000Z","locked":false,"countdown":null,"canRequestUnlock":true,
               "openDays":[{"reportId":"r-0","projectId":"p-1","projectName":"Aplikasi Absensi","date":"2026-10-10","unlockUntil":"2026-10-14T01:00:00.000Z"},
                           {"reportId":"r-9","projectId":"p-1","projectName":"Aplikasi Absensi","date":"2026-10-13","unlockUntil":null}],
               "projects":[]}""",
        )
        assertTrue(d.mode247)
        assertEquals("Mode 24/7", labelTenggat(d))
        // Hari yang sedang tampil tidak diulang sebagai banner "dibuka".
        assertEquals(listOf("2026-10-10"), d.hariDibuka.map { it.tanggal })
        assertTrue(teksTenggat(d).startsWith("Tersedia 24/7"))
    }

    @Test
    fun jamPtKustomDihitungDariLockAtBukanCountdown() {
        // PT memakai jam 15.00 WIB (08.00Z); server mengirim countdown basis 17.00 — diabaikan.
        val d = meja(
            """{"reportDate":"2026-10-12T17:00:00.000Z","reportDateKey":"2026-10-13","today":true,"todayKey":"2026-10-13",
               "lockAt":"2026-10-13T08:00:00.000Z","locked":false,
               "countdown":{"hours":5,"minutes":0,"totalMs":18000000,"passed":false},
               "canRequestUnlock":true,"openDays":[],"projects":[]}""",
        )
        assertFalse(d.mode247)
        assertEquals("Tenggat 15.00", labelTenggat(d))
        val kini = Instant.parse("2026-10-13T06:45:00Z")
        assertEquals("1 jam 15 menit", sisaWaktu(d.kunciIso, kini))
        assertEquals("Tenggat 15.00 WIB · 1 jam 15 menit lagi.", teksTenggat(d, kini))
        assertNull(sisaWaktu(d.kunciIso, Instant.parse("2026-10-13T08:00:01Z")))
    }

    @Test
    fun laporanDiteruskanBekuDanBisaAjukanBukaKunci() {
        val d = meja(
            """{"reportDate":"2026-10-12T17:00:00.000Z","reportDateKey":"2026-10-13","today":true,"todayKey":"2026-10-13",
               "lockAt":"2026-10-13T10:00:00.000Z","locked":false,"countdown":{"hours":1,"minutes":0,"totalMs":3600000,"passed":false},
               "canRequestUnlock":true,"openDays":[],"projects":[$proyekJson]}""",
        )
        val p = d.proyek.single()
        assertTrue(p.terkunci)
        assertEquals(MkStatus.DONE to "Diteruskan ke holding", keadaanLaporan(p, true))
        val info = infoKunci(p, true, d, null)!!
        assertEquals("Diteruskan · dibekukan", info.label)
        assertTrue(info.bolehAjukan)
        assertNull(info.catatan)
        assertEquals("Laporan Aplikasi Absensi hari ini sudah diteruskan ke holding.", kalimatJawaban(d))

        // Buka kunci sudah diajukan → tombol hilang, lencana proses tampil.
        val diajukan = p.copy(bukaKunci = BukaKunciInfo("DIAJUKAN", null))
        val info2 = infoKunci(diajukan, true, d, null)!!
        assertFalse(info2.bolehAjukan)
        assertEquals("DIAJUKAN", info2.prosesBuka)

        // Sedang dibuka → info, bukan terkunci.
        val dibuka = p.copy(bisaEdit = true, alasanKunci = null, bukaKunci = BukaKunciInfo("DIEKSEKUSI", "2026-10-14T01:00:00.000Z"))
        assertEquals(MkStatus.INFO, keadaanLaporan(dibuka, false).first)
        assertEquals(MkStatus.INFO, infoKunci(dibuka, false, d, null)!!.status)

        // Peran tanpa unlock:request → catatan, bukan tombol.
        val tanpaHak = infoKunci(p, true, d.copy(bolehAjukanBuka = false), null)!!
        assertFalse(tanpaHak.bolehAjukan)
        assertEquals("Minta Admin PT mengajukan buka kunci bila laporan ini perlu diubah.", tanpaHak.catatan)
    }

    @Test
    fun keadaanLaporanBelumDiisiDanDraf() {
        val p = ProyekLaporan("p", "K", "N", "PELAKSANAAN", 0, true, null, null, null)
        assertEquals(MkStatus.NEUTRAL to "Belum diisi", keadaanLaporan(p, false))
        assertEquals(MkStatus.LATE to "Tidak dikirim", keadaanLaporan(p, true))
        val draf = p.copy(laporan = LaporanTersimpan("r", "ON_PROGRESS", 10, 0, null, null, false))
        assertEquals(MkStatus.RISK to "Draf belum dikirim", keadaanLaporan(draf, false))
    }

    // ------------------------------------------------------------ galat

    @Test
    fun galatDipetakanRamah() {
        val beku = petakanGalat(ApiError.Konflik("Laporan ini sudah diteruskan.", locked = true, frozen = "FORWARDED", reportId = "r-1"))
        assertTrue(beku is GalatTulis.Beku)
        assertEquals("r-1", (beku as GalatTulis.Beku).reportId)
        val validasi = petakanGalat(ApiError.Validasi("Lampirkan bukti.", listOf("Lampirkan bukti.", "Capaian wajib.")))
        assertEquals(listOf("Lampirkan bukti.", "Capaian wajib."), validasi.daftarPesan())
        val tanpaDaftar = petakanGalat(ApiError.Validasi("Judul task wajib diisi."))
        assertEquals(listOf("Judul task wajib diisi."), tanpaDaftar.daftarPesan())
        assertTrue(petakanGalat(ApiError.Jaringan("luring")) is GalatTulis.Umum)
    }

    // ------------------------------------------------------------ kompres bukti

    @Test
    fun ukuranKompresSisiPanjang2048() {
        assertEquals(2048 to 1536, ukuranTarget(4000, 3000))
        assertEquals(1152 to 2048, ukuranTarget(2250, 4000))
        assertEquals(800 to 600, ukuranTarget(800, 600))
        assertEquals(1, sampelUkuran(3000, 2000))
        assertEquals(2, sampelUkuran(8000, 6000))
        assertEquals("IMG_001.jpg", namaJpg("IMG_001.HEIC"))
        assertEquals("foto.jpg", namaJpg("foto.png"))
        assertEquals("laporan.pdf", namaDenganEkstensi("laporan", "application/pdf"))
        assertEquals("data.csv", namaDenganEkstensi("data.csv", "text/csv"))
        assertEquals("image/heic", tebakMime("a.heic"))
        assertNull(tebakMime("skrip.exe"))
        assertTrue(perluKompres("image/png"))
        assertFalse(perluKompres("image/gif"))
        assertFalse(perluKompres("application/pdf"))
    }
}
