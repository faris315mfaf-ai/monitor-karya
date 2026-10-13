package id.co.monitorkarya.feature.audit

import id.co.monitorkarya.feature.audit.model.angka
import id.co.monitorkarya.feature.audit.model.inisial
import id.co.monitorkarya.feature.audit.model.jadwalPengingat
import id.co.monitorkarya.feature.audit.model.kunciBerubah
import id.co.monitorkarya.feature.audit.model.labelAksi
import id.co.monitorkarya.feature.audit.model.labelSasaran
import id.co.monitorkarya.feature.audit.model.labelHariKerja
import id.co.monitorkarya.feature.audit.model.labelPeran
import id.co.monitorkarya.feature.audit.model.nadaAksi
import id.co.monitorkarya.feature.audit.model.relatif
import id.co.monitorkarya.feature.audit.model.teksJson
import id.co.monitorkarya.feature.audit.model.waktuWib
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatTest {

    @Test
    fun `waktu selalu WIB`() {
        // 07.05 UTC = 14.05 WIB; 20.00 UTC = 03.00 WIB hari berikutnya.
        assertTrue(waktuWib("2026-10-13T07:05:00.000Z").startsWith("13 "))
        assertTrue(waktuWib("2026-10-13T07:05:00.000Z").endsWith("2026, 14.05 WIB"))
        assertTrue(waktuWib("2026-10-13T20:00:00Z").startsWith("14 "))
        assertEquals("—", waktuWib(null))
        assertEquals("—", waktuWib("bukan tanggal"))
    }

    @Test
    fun `relatif memakai kalender WIB`() {
        val kini = Instant.parse("2026-10-13T05:00:00Z")
        assertEquals("baru saja", relatif("2026-10-13T04:59:30Z", kini))
        assertEquals("5 menit lalu", relatif("2026-10-13T04:55:00Z", kini))
        assertEquals("3 jam lalu", relatif("2026-10-13T02:00:00Z", kini))
        assertEquals("kemarin", relatif("2026-10-12T04:00:00Z", kini))
        assertEquals("3 hari lalu", relatif("2026-10-10T04:00:00Z", kini))
    }

    @Test
    fun `teksJson aman sebagai teks`() {
        assertEquals("", teksJson(null))
        assertEquals("", teksJson(JsonNull))
        val obj = Json.parseToJsonElement("""{"a":1,"b":"<script>"}""")
        val rapi = teksJson(obj)
        assertTrue(rapi.contains("\n  \"a\": 1"))
        assertTrue(rapi.contains("<script>"))
        // String berisi JSON diurai lalu dirapikan; string biasa apa adanya.
        assertTrue(teksJson(JsonPrimitive("""{"x":true}""")).contains("\"x\": true"))
        assertEquals("<b>teks</b>", teksJson(JsonPrimitive("<b>teks</b>")))
        assertEquals("12", teksJson(JsonPrimitive(12)))
        val panjang = teksJson(JsonPrimitive("x".repeat(50)), batas = 10)
        assertEquals("xxxxxxxxxx…", panjang)
    }

    @Test
    fun `kunciBerubah membandingkan objek`() {
        val a = Json.parseToJsonElement("""{"role":"PIC_PROYEK","isActive":true,"lama":1}""")
        val b = Json.parseToJsonElement("""{"role":"TI","isActive":true,"baru":2}""")
        assertEquals(listOf("baru", "lama", "role"), kunciBerubah(a, b))
        assertEquals(emptyList<String>(), kunciBerubah(null, b))
        assertEquals(listOf("s"), kunciBerubah(JsonPrimitive("""{"s":1}"""), JsonPrimitive("""{"s":2}""")))
    }

    @Test
    fun `E2E-3 B8 - aksi persetujuan dan tinjau tidak lagi tampil mentah`() {
        val kode = listOf(
            "APPROVE_APPROVAL_REQUEST", "REJECT_APPROVAL_REQUEST", "WITHDRAW_APPROVAL_REQUEST",
            "REOPEN_APPROVAL_REQUEST", "CREATE_APPROVAL_REQUEST", "UNDO_APPROVAL_DECISION",
            "ATTACH_APPROVAL_FILE", "COMMENT_WEEKLY_REPORT", "REVIEW_PROJECT", "UNDO_REVIEW_PROJECT",
            "UNDO_DEADLINE_DECISION", "UNDO_WEEKLY_COMMENT", "UPDATE_REPORT_SETTINGS",
            "ISSUE_ACCOUNT_ACTIVATION", "ACTIVATE_ACCOUNT", "ARCHIVE_PROJECT",
        )
        kode.forEach { k -> assertTrue(k, labelAksi(k) != k && !labelAksi(k).contains('_')) }
        assertEquals("Urungkan keputusan persetujuan", labelAksi("UNDO_APPROVAL_DECISION"))
        assertEquals("Permintaan persetujuan", labelSasaran("APPROVAL_REQUEST"))
        assertEquals("Aturan pelaporan", labelSasaran("REPORT_SETTINGS"))
    }

    @Test
    fun `label aksi, peran, hari kerja, jadwal`() {
        assertEquals("Setujui permintaan akses", labelAksi("APPROVE_ACCESS_REQUEST"))
        assertEquals(MkStatus.DONE, nadaAksi("APPROVE_ACCESS_REQUEST"))
        assertEquals("AKSI_BARU", labelAksi("AKSI_BARU"))
        assertEquals(MkStatus.NEUTRAL, nadaAksi("AKSI_BARU"))
        assertEquals("Tim TI", labelPeran("TI"))
        assertEquals("PERAN_X", labelPeran("PERAN_X"))
        assertEquals("Setiap hari", labelHariKerja(emptyList()))
        assertEquals("Senin–Jumat", labelHariKerja(listOf(5, 4, 3, 2, 1)))
        assertEquals("Senin, Rabu", labelHariKerja(listOf(3, 1)))
        assertEquals("Setiap hari kerja 16.30", jadwalPengingat("HARIAN", "16:30", null, null))
        assertEquals("Jumat 13.00", jadwalPengingat("MINGGUAN", "13:00", 5, null))
        assertEquals("2 hari tidak lapor · dicek 09.00", jadwalPengingat("ESKALASI_KADIV", "09:00", null, 2))
        assertEquals("1.234", angka(1234))
        assertEquals("GP", inisial("Galih Pratama"))
    }

    @Test
    fun `jadwal eskalasi dengan hari pecahan (C1-R5)`() {
        assertEquals("1,5 hari tidak lapor · dicek 09.00", jadwalPengingat("ESKALASI_KADIV", "09:00", null, 1.5))
        assertEquals("3 hari tidak lapor · dicek 09.00", jadwalPengingat("ESKALASI_KADIV", "09:00", null, 3.0))
        assertEquals("2 hari tidak lapor · dicek 09.00", jadwalPengingat("ESKALASI_KADIV", "09:00", null, null))
    }
}
