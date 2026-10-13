package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.app.ui.mejakerja.TugasAgenda
import id.co.monitorkarya.app.ui.mejakerja.centangEntri
import id.co.monitorkarya.app.ui.mejakerja.sisaMenuju
import id.co.monitorkarya.app.ui.mejakerja.susunMeja
import id.co.monitorkarya.app.ui.mejakerja.tumpangkanAgenda
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.PayloadUnggahBukti
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.core.network.dto.WorkDeskPicResponse
import id.co.monitorkarya.core.network.mkJson
import java.time.Instant
import kotlinx.serialization.KSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * B2 — tampilan laporan harian/meja kerja PIC dengan perubahan yang masih di
 * antrean (luring), susunan payload entri tanpa medan hilang, dan tenggat yang
 * dihitung dari lockAt aturan PT (bukan countdown jam env).
 */
class TumpangAntreanTest {

    private val kunci = "laporan:p-1:2026-10-13"

    private fun <T> pesan(id: Long, jenis: String, s: KSerializer<T>, nilai: T, status: StatusKirim = StatusKirim.MENUNGGU, galat: String? = null) =
        PesanOutbox(id, jenis, kunci, "label", status, galat, 0L, 0, mkJson.encodeToString(s, nilai))

    private fun entriServer(id: String, judul: String = "Entri $id") = Entri(
        id = id, judul = judul, deskripsi = null, pelaksana = "Rina", picUserId = "u-1",
        status = "BERJALAN", progres = 40, hasil = "lama", kendala = null, keputusan = null,
        rencana = null, eskalasi = false, escalationId = null, tags = listOf("t"), urgensi = "TINGGI",
        mulaiIso = "2026-10-13T01:00:00Z", selesaiIso = null, subtugas = emptyList(), bukti = emptyList(),
    )

    private val hari = EntriHari(terkunci = false, beku = null, reportId = "r-1", bukaSampaiIso = null, entri = listOf(entriServer("t-1"), entriServer("t-2")))

    private fun req(id: String? = null, judul: String = "Baru") = EntriSimpanRequest(
        context = "HARIAN", title = judul, description = "d", picName = "Rani", status = "TERKENDALA", progressPct = 30,
        obstacle = "Hujan", decisionNeeded = "Tenda", achievementToday = "Hasil", followUp = "Besok", needsEscalation = true,
        projectId = if (id == null) "p-1" else null, id = id, workDate = if (id == null) "2026-10-13" else null,
        startTime = "08:00", endTime = "10:00", subtasks = listOf(SubtaskInputDto("a", false)),
    )

    @Test
    fun entriLuringTampilSebagaiEntriLokalDenganSemuaMedan() {
        val h = tumpangkanAntrean(hari, listOf(pesan(7, JenisOutbox.TAMBAH_ENTRI, EntriSimpanRequest.serializer(), req())))
        val e = h.entri.last()
        assertEquals("lokal:7", e.id)
        assertTrue(e.lokal)
        assertEquals(StatusKirim.MENUNGGU, e.statusKirim)
        assertEquals("Hasil", e.hasil)
        assertEquals("Besok", e.rencana)
        assertTrue(e.eskalasi)
        assertEquals("Tenda", e.keputusan)
        assertEquals("08:00", e.jamMulai)
        // Ubah entri lokal mempertahankan jam dari payload tambah (tidak hilang).
        val ubah = susunPermintaanEntri("p-1", "2026-10-13", e.id, e, e.keIsian())
        assertEquals("08:00", ubah.startTime)
        assertEquals("10:00", ubah.endTime)
        assertEquals("lokal:7", ubah.id)
        assertNull(ubah.projectId)
    }

    @Test
    fun ubahHapusDanBuktiTertundaDitumpangkanBerurutan() {
        val h = tumpangkanAntrean(
            hari,
            listOf(
                pesan(1, JenisOutbox.UBAH_ENTRI, EntriSimpanRequest.serializer(), req(id = "t-1", judul = "Revisi")),
                pesan(2, JenisOutbox.HAPUS_ENTRI, PayloadHapusEntri.serializer(), PayloadHapusEntri("t-2")),
                pesan(3, JenisOutbox.UNGGAH_BUKTI, PayloadUnggahBukti.serializer(), PayloadUnggahBukti("t-1", "x.jpg", "foto.jpg", "image/jpeg", 2048)),
                pesan(4, JenisOutbox.KIRIM_LAPORAN, PayloadHapusEntri.serializer(), PayloadHapusEntri("abaikan")),
            ),
        )
        assertEquals(listOf("t-1"), h.entri.map { it.id })
        val e = h.entri.single()
        assertEquals("Revisi", e.judul)
        assertEquals("TERKENDALA", e.status)
        assertEquals(StatusKirim.MENUNGGU, e.statusKirim)
        val b = e.bukti.single()
        assertEquals("antre:3", b.id)
        assertEquals(3L, idOutboxBukti(b.id))
        assertFalse("bukti antre tidak dimuat sebagai thumbnail server", b.foto)
        // Bukti antre ikut dihitung: tombol kirim tidak tertahan saat luring.
        assertFalse(buktiKurang(h.entri, null))
    }

    @Test
    fun hapusGagalTetapTampilDenganPesanServer() {
        val h = tumpangkanAntrean(
            hari,
            listOf(pesan(2, JenisOutbox.HAPUS_ENTRI, PayloadHapusEntri.serializer(), PayloadHapusEntri("t-2"), StatusKirim.GAGAL, "Laporan beku.")),
        )
        val e = h.entri.first { it.id == "t-2" }
        assertEquals(StatusKirim.GAGAL, e.statusKirim)
        assertEquals("Laporan beku.", e.galatKirim)
    }

    @Test
    fun tanpaAntreanDataServerTidakBerubah() {
        assertEquals(hari, tumpangkanAntrean(hari, emptyList()))
    }

    @Test
    fun agendaMejaKerjaMenumpangCentangDanEntriLuring() {
        val tugas = listOf(TugasAgenda("t-1", "A", null, null, selesai = false, terkendala = false, statusLabel = ""))
        val centang = id.co.monitorkarya.core.network.dto.TaskSaveRequest(title = "A", id = "t-1", context = "HARIAN", status = "SELESAI", progressPct = 100)
        val hasil = tumpangkanAgenda(
            tugas,
            listOf(
                pesan(1, JenisOutbox.UBAH_TUGAS, id.co.monitorkarya.core.network.dto.TaskSaveRequest.serializer(), centang),
                pesan(2, JenisOutbox.TAMBAH_ENTRI, EntriSimpanRequest.serializer(), req(), StatusKirim.GAGAL, "Ditolak"),
            ),
        )
        assertTrue(hasil[0].selesai)
        assertEquals(StatusKirim.MENUNGGU, hasil[0].statusKirim)
        assertEquals("lokal:2", hasil[1].id)
        assertTrue(hasil[1].lokal)
        assertEquals(StatusKirim.GAGAL, hasil[1].statusKirim)
        assertEquals("08.00–10.00", hasil[1].jam)
    }

    @Test
    fun centangDariEntriTertundaMempertahankanNarasi() {
        val c = centangEntri(req(id = "t-1"), selesai = true)
        assertEquals("SELESAI", c.status)
        assertEquals(100, c.progressPct)
        assertEquals("Hasil", c.achievementToday)
        assertEquals("Besok", c.followUp)
        assertTrue(c.needsEscalation)
        assertTrue(c.subtasks.all { it.isDone })
    }

    @Test
    fun tenggatJamPtKustomDihitungDariLockAtBukanCountdown() {
        // Server lama mengirim countdown jam env 17.00 (7 jam) padahal PT 15.00.
        val desk = mkJson.decodeFromString(
            DailyInputGetResponse.serializer(),
            """{"reportDate":"2026-10-12T17:00:00.000Z","reportDateKey":"2026-10-13","today":true,"todayKey":"2026-10-13",
               "lockAt":"2026-10-13T08:00:00.000Z","locked":false,
               "countdown":{"hours":7,"minutes":0,"totalMs":25200000,"passed":false},"projects":[]}""",
        ).keDesk()
        assertFalse(desk.mode247)
        val teks = teksTenggat(desk, Instant.parse("2026-10-13T03:00:00Z"))
        assertTrue(teks, teks.startsWith("Tenggat 15.00 WIB · 5 jam 0 menit lagi."))
        // 24/7 = countdown null.
        val d247 = mkJson.decodeFromString(
            DailyInputGetResponse.serializer(),
            """{"reportDate":"2026-10-12T17:00:00.000Z","reportDateKey":"2026-10-13","todayKey":"2026-10-13","lockAt":"2026-10-13T17:00:00.000Z","countdown":null}""",
        ).keDesk()
        assertTrue(d247.mode247)
        assertTrue(teksTenggat(d247).startsWith("Tersedia 24/7"))
    }

    @Test
    fun mejaKerjaPotretLamaLewatTenggatMenjadiTerkunci() {
        val meja = mkJson.decodeFromString(
            WorkDeskPicResponse.serializer(),
            """{"kind":"PIC","today":"2026-10-12T17:00:00.000Z","lockAt":"2026-10-13T08:00:00.000Z","locked":false,
               "countdown":{"hours":2,"minutes":0,"totalMs":7200000,"passed":false},"cutoffLabel":"15.00 WIB","projects":[]}""",
        )
        val sisa = sisaMenuju(meja.lockAt, Instant.parse("2026-10-13T09:00:00Z"))!!
        assertTrue(sisa < 0)
        val d = susunMeja(meja, sisa)
        assertTrue(d.terkunci)
        val pagi = susunMeja(meja, sisaMenuju(meja.lockAt, Instant.parse("2026-10-13T05:30:00Z"))!!)
        assertFalse(pagi.terkunci)
    }
}
