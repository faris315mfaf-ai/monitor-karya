package id.co.monitorkarya.feature.pesan.logika

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.feature.pesan.data.PesanDto
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LogikaPesanTest {

    private fun p(template: String, title: String = "", body: String = "", tab: String? = null, readAt: String? = null) =
        PesanDto(id = template + title, template = template, title = title, body = body, tab = tab, readAt = readAt)

    @Test
    fun jenis_dari_template_lalu_teks() {
        assertEquals(JenisPesan.KOMENTAR, jenisPesan(p("REVIEW_OUTPUT")))
        assertEquals(JenisPesan.KOMENTAR, jenisPesan(p("KOMENTAR_MINGGUAN")))
        assertEquals(JenisPesan.PERSETUJUAN, jenisPesan(p("KEPUTUSAN_AKSES")))
        assertEquals(JenisPesan.PENGINGAT, jenisPesan(p("PENGINGAT_HARIAN_PIC")))
        assertEquals(JenisPesan.PENGINGAT, jenisPesan(p("ESKALASI_KADIV_HARIAN")))
        assertEquals(JenisPesan.PERSETUJUAN, jenisPesan(p("X", title = "Permintaan Anda Disetujui")))
        assertEquals(JenisPesan.PENGINGAT, jenisPesan(p("X", body = "Anda diingatkan Admin PT")))
        assertEquals(JenisPesan.PEMBERITAHUAN, jenisPesan(p("X", title = "Info sistem")))
    }

    @Test
    fun label_template_dan_tab_sesuai_peran() {
        assertEquals("Pengingat laporan harian PIC", labelTemplate("PENGINGAT_HARIAN_PIC"))
        assertNull(labelTemplate("LAIN"))
        assertEquals(TabId.LAPORAN_HARIAN, tabTerkait(p("X", tab = "daily-input"), Peran.PIC_PROYEK))
        // Manajemen tidak punya tab Laporan harian → tanpa tindak lanjut.
        assertNull(tabTerkait(p("X", tab = "daily-input"), Peran.MANAJEMEN))
        // Model subholding 16 Okt 2026: Manajemen hanya sh-overview; Persetujuan lama milik Direktur entitas.
        assertNull(tabTerkait(p("X", tab = "approvals"), Peran.MANAJEMEN))
        assertEquals(TabId.PERSETUJUAN, tabTerkait(p("X", tab = "approvals"), Peran.DIREKTUR_ENTITAS))
        assertEquals(TabId.SH_REVIEW, tabTerkait(p("X", tab = "sh-review"), Peran.SUPERVISOR))
        assertEquals(TabId.SH_INBOX, tabTerkait(p("X", tab = "sh-inbox"), Peran.ADMIN_SUBHOLDING))
        assertNull(tabTerkait(p("X", tab = "sh-review"), Peran.ADMIN_SUBHOLDING))
        // D1: Statistik kini TabId biasa untuk Admin PT; peran lain tidak punya.
        assertEquals(TabId.STATISTIK, tabTerkait(p("X", tab = "statistik"), Peran.ADMIN_PT))
        assertNull(tabTerkait(p("X", tab = "statistik"), Peran.TI))
        assertNull(tabTerkait(p("X", tab = "pesan"), Peran.ADMIN_PT))
        assertNull(tabTerkait(p("X", tab = null), Peran.TI))
    }

    @Test
    fun saring_jawaban_lencana() {
        val daftar = listOf(p("A"), p("B", readAt = "2026-10-01T00:00:00.000Z"))
        assertEquals(2, saringPesan(daftar, Saring.SEMUA).size)
        assertEquals(listOf("A"), saringPesan(daftar, Saring.BELUM).map { it.template })
        assertEquals("3 pesan belum dibaca.", kalimatJawaban(3))
        assertEquals("Semua pesan sudah dibaca.", kalimatJawaban(0))
        assertNull(teksLencana(0))
        assertEquals("7", teksLencana(7))
        assertEquals("9", teksLencana(9))
        assertEquals("9+", teksLencana(10))
        assertEquals("9+", teksLencana(120))
    }

    @Test
    fun waktu_wib() {
        assertEquals("13 Okt 2026 09.55", WaktuPesan.tanggalJam("2026-10-13T02:55:00.000Z"))
        assertEquals("-", WaktuPesan.tanggalJam(null))
        val sekarang = ZonedDateTime.parse("2026-10-13T10:00:00+07:00[Asia/Jakarta]")
        assertEquals("5 menit lalu", WaktuPesan.relatif("2026-10-13T02:55:00.000Z", sekarang))
        assertEquals("2 jam lalu", WaktuPesan.relatif("2026-10-13T01:00:00.000Z", sekarang))
        assertEquals("Kemarin", WaktuPesan.relatif("2026-10-12T02:00:00.000Z", sekarang))
        assertEquals("3 hari lalu", WaktuPesan.relatif("2026-10-10T02:00:00.000Z", sekarang))
        assertEquals("30 Sep 2026", WaktuPesan.relatif("2026-09-30T02:00:00.000Z", sekarang))
    }

    @Test
    fun c1_r9_kemarinMengikutiKalenderWib() {
        val sekarang = ZonedDateTime.parse("2026-10-13T08:00:00+07:00[Asia/Jakarta]")
        // 11 Okt 23.00 WIB = 33 jam lalu, dua hari kalender (dulu "Kemarin").
        assertEquals("2 hari lalu", WaktuPesan.relatif("2026-10-11T16:00:00.000Z", sekarang))
        // 12 Okt 23.00 WIB = 9 jam lalu.
        assertEquals("9 jam lalu", WaktuPesan.relatif("2026-10-12T16:00:00.000Z", sekarang))
    }

    @Test
    fun c1_r10_jamSelaluDigitLatin() {
        val asal = java.util.Locale.getDefault()
        try {
            java.util.Locale.setDefault(java.util.Locale.forLanguageTag("ar-EG-u-nu-arab"))
            assertEquals("13 Okt 2026 09.55", WaktuPesan.tanggalJam("2026-10-13T02:55:00.000Z"))
        } finally {
            java.util.Locale.setDefault(asal)
        }
    }
}

