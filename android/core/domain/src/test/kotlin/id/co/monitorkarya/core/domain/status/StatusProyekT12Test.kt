package id.co.monitorkarya.core.domain.status

import id.co.monitorkarya.core.domain.model.LaporanHarian
import id.co.monitorkarya.core.domain.model.MkStatusDomain
import id.co.monitorkarya.core.domain.time.Wib
import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Audit T12: project-status.ts membandingkan INSTAN tenggat dengan "sekarang".
 * targetEndDate dari server berbentuk "2026-10-12T00:00:00.000Z" (07.00 WIB).
 * Perbandingan per tanggal kalender WIB menyatakan "terlambat" baru esoknya.
 */
class StatusProyekT12Test {

    private fun laporan(status: String = "ON_PROGRESS", progres: Int = 40) = LaporanHarian(
        id = "r1",
        proyekId = "p1",
        tanggal = LocalDate.of(2026, 10, 12),
        status = status,
        progresPct = progres,
        capaian = "",
        kendala = null,
        terlambat = false,
    )

    private fun wib(tanggal: String, jam: String): ZonedDateTime =
        ZonedDateTime.parse("${tanggal}T$jam+07:00[Asia/Jakarta]")

    private val tenggatServer: Instant = Instant.parse("2026-10-12T00:00:00.000Z") // 07.00 WIB

    @Test
    fun tenggatHariIniSetelahJamnyaSudahTerlambatSepertiServer() {
        val hasil = StatusProyek.hitungLengkap(
            tenggat = Wib.dariEpochMillis(tenggatServer.toEpochMilli()),
            terakhir = laporan(),
            sekarang = wib("2026-10-12", "10:00:00"),
            tenggatInstan = tenggatServer,
        )
        assertEquals(MkStatusDomain.LATE, hasil.status)
        assertEquals("Lewat tenggat 1 hari", hasil.alasan)
    }

    @Test
    fun sebelumJamTenggatMasihSesuaiJadwal() {
        val hasil = StatusProyek.hitungLengkap(
            tenggat = LocalDate.of(2026, 10, 12),
            terakhir = laporan(),
            sekarang = wib("2026-10-12", "06:59:00"),
            tenggatInstan = tenggatServer,
        )
        assertEquals(MkStatusDomain.ON, hasil.status)
    }

    @Test
    fun hariTerlambatDibulatkanKeBawahMinimalSatuSepertiMathFloor() {
        // 2 hari 5 jam sesudah tenggat -> floor = 2.
        val hasil = StatusProyek.hitungLengkap(
            tenggat = null,
            terakhir = laporan(),
            sekarang = wib("2026-10-14", "12:00:00"),
            tenggatInstan = tenggatServer,
        )
        assertEquals("Lewat tenggat 2 hari", hasil.alasan)
    }

    @Test
    fun proyekSelesaiTidakPernahTerlambat() {
        val hasil = StatusProyek.hitungLengkap(
            tenggat = null,
            terakhir = laporan(status = "SELESAI", progres = 100),
            sekarang = wib("2026-10-20", "09:00:00"),
            tenggatInstan = tenggatServer,
        )
        assertEquals(MkStatusDomain.DONE, hasil.status)
    }

    @Test
    fun tanpaTenggatInstanPerilakuLamaPerTanggalTetap() {
        val hasil = StatusProyek.hitung(
            tenggat = LocalDate.of(2026, 10, 12),
            terakhir = laporan(),
            sekarang = wib("2026-10-12", "10:00:00"),
        )
        assertEquals(MkStatusDomain.ON, hasil)
    }
}
