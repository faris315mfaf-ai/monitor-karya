package id.co.monitorkarya.app.ui.tim

import id.co.monitorkarya.core.network.dto.KadivTeamResponse
import id.co.monitorkarya.core.network.mkJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * E2E-1 #1 (paritas member-sheet.tsx: Ingatkan, Tandai dibaca, kehadiran) dan
 * #8 ("tenggat 17.00 WIB WIB"). JSON berbentuk respons GET /api/kadiv/team.
 */
class TimAksiE2e1Test {

    private fun anggota(
        laporan: LaporanAnggota,
        diingatkan: String? = null,
        dibaca: String? = null,
        nama: String = "Bpk. Yudi Pratama",
    ) = AnggotaUi(
        id = "u1", nama = nama, jabatan = null, peran = "Manager / PIC proyek", inisial = "YP",
        kehadiran = "HADIR", proyek = listOf("SIM RS"), laporan = laporan, wajibLapor = 1, sudahMasuk = 0,
        dikirimIso = null, diingatkanIso = diingatkan, dibacaIso = dibaca, bebanPersen = 50, tugasTerbuka = 2,
        capaian = emptyList(), kendala = emptyList(),
    )

    private fun tim(label: String?, kunci: String? = null, wajib: Int = 3, masuk: Int = 1) = TimUi(
        divisiId = "d1", divisiNama = "SDM", tenggatLabel = label, terkunci = false,
        sudahMasuk = masuk, wajibLapor = wajib, anggota = emptyList(), kunciIso = kunci,
    )

    @Test
    fun nama_depan_membuang_sapaan_seperti_web() {
        assertEquals("Yudi", namaDepan("Bpk. Yudi Pratama"))
        assertEquals("Vera", namaDepan("Ibu Vera Lestari"))
        assertEquals("Rani", namaDepan("Rani Kusuma"))
        assertEquals("Sdri", namaDepan("Sdri"))
    }

    @Test
    fun aksi_utama_tandai_dibaca_ingatkan_atau_tutup() {
        assertEquals(AksiAnggota.TandaiDibaca, aksiUtamaAnggota(anggota(LaporanAnggota.TERKIRIM), terkunci = false))
        // Sudah dibaca → tidak ada tombol tandai lagi.
        assertEquals(AksiAnggota.Tutup, aksiUtamaAnggota(anggota(LaporanAnggota.TERKIRIM, dibaca = "2026-10-13T03:00:00Z"), false))
        val ingat = aksiUtamaAnggota(anggota(LaporanAnggota.BELUM), false) as AksiAnggota.Ingatkan
        assertEquals("Ingatkan Yudi", ingat.label)
        assertTrue(ingat.aktif)
        // Sudah diingatkan hari ini → label jam WIB, tombol mati (canRemind web).
        val sudah = aksiUtamaAnggota(anggota(LaporanAnggota.BELUM, diingatkan = "2026-10-13T03:41:00Z"), false) as AksiAnggota.Ingatkan
        assertEquals("Diingatkan 10.41", sudah.label)
        assertFalse(sudah.aktif)
        // Laporan terkunci → tidak bisa mengingatkan.
        assertFalse((aksiUtamaAnggota(anggota(LaporanAnggota.BELUM), true) as AksiAnggota.Ingatkan).aktif)
        assertEquals(AksiAnggota.Tutup, aksiUtamaAnggota(anggota(LaporanAnggota.ABSEN), false))
    }

    @Test
    fun tenggat_tidak_menggandakan_wib() {
        assertEquals("1 dari 3 masuk · tenggat 17.00 WIB", teksTenggatTim(tim("17.00 WIB")))
        assertEquals("1 dari 3 masuk · tenggat 17.00 WIB", teksTenggatTim(tim("17.00")))
        // 24/7 produksi: label server "24.00 WIB" ditampilkan apa adanya.
        assertEquals("tenggat 24.00 WIB", teksTenggatTim(tim("24.00 WIB", wajib = 0)))
        // Tanpa label → lockAt; tanpa keduanya tanda hubung, bukan jam tebakan.
        assertEquals("tenggat 16.00 WIB", teksTenggatTim(tim(null, kunci = "2026-10-13T09:00:00.000Z", wajib = 0)))
        assertEquals("tenggat —", teksTenggatTim(tim(" ", wajib = 0)))
    }

    @Test
    fun pemetaan_membawa_tanda_baca_rencana_dan_task() {
        val res = mkJson.decodeFromString(
            KadivTeamResponse.serializer(),
            """
            {"today":"2026-10-13","lockAt":"2026-10-13T10:00:00.000Z","locked":false,"cutoffLabel":"17.00 WIB",
             "division":{"id":"d1","name":"SDM","entityName":"PT Satu"},
             "members":[{"id":"u1","name":"Rani Kusuma","title":null,"role":"PIC_PROYEK","initials":"RK","attendance":"CUTI",
               "projects":[{"id":"p1","code":"P1","name":"SIM RS"}],
               "report":{"state":"TERKIRIM","required":1,"sent":1,"submittedAt":"2026-10-13T03:00:00.000Z","readAt":"2026-10-13T04:00:00.000Z"},
               "today":{"tasks":[{"id":"t1","title":"Pasang panel","status":"BERJALAN","progressPct":40,"projectName":"SIM RS"}],
                        "achievements":["Panel 1"],"obstacles":[],"plans":["Panel 2"]},
               "load":{"pct":80,"openTasks":3,"openMinutes":150}}],
             "onTime30":{"pct":null,"ok":0,"total":0,"target":0,"days":30},
             "summary":{"members":1,"reporters":1,"reported":1}}
            """.trimIndent(),
        )
        val ui = res.keTimUi()
        assertEquals("2026-10-13T10:00:00.000Z", ui.kunciIso)
        val a = ui.anggota.single()
        assertEquals("2026-10-13T04:00:00.000Z", a.dibacaIso)
        assertEquals(listOf("Panel 2"), a.rencana)
        assertEquals("Pasang panel", a.tugas.single().judul)
        assertEquals(150, a.sisaMenit)
        assertEquals("CUTI", a.kehadiran)
    }

    @Test
    fun status_kehadiran_dan_label_sama_dengan_web() {
        assertEquals(listOf("HADIR", "TERLAMBAT", "CUTI", "SAKIT", "IZIN"), STATUS_KEHADIRAN)
        assertEquals(listOf("Hadir", "Terlambat", "Cuti", "Sakit", "Izin"), STATUS_KEHADIRAN.map(::labelKehadiran))
        assertEquals("Menunggu keputusan", labelStatusTugas("MENUNGGU_KEPUTUSAN"))
    }
}
