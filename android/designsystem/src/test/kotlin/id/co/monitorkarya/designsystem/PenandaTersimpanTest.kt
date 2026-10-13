package id.co.monitorkarya.designsystem

import id.co.monitorkarya.designsystem.components.teksDataTersimpan
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

/** E2E-R2-3 B6: penanda potret Room "Data tersimpan HH.MM" (WIB). */
class PenandaTersimpanTest {

    private val wib = ZoneId.of("Asia/Jakarta")
    private fun ms(hari: Int, jam: Int, menit: Int) =
        ZonedDateTime.of(2026, 10, hari, jam, menit, 0, 0, wib).toInstant().toEpochMilli()

    @Test
    fun hariSamaHanyaJam() =
        assertEquals("Data tersimpan 14.05", teksDataTersimpan(ms(13, 14, 5), sekarangMs = ms(13, 16, 0)))

    @Test
    fun hariLainDenganTanggal() =
        assertEquals("Data tersimpan 12 Okt 23.50", teksDataTersimpan(ms(12, 23, 50), sekarangMs = ms(13, 8, 0)))
}
