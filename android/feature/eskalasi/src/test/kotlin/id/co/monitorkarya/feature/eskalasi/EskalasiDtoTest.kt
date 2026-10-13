package id.co.monitorkarya.feature.eskalasi

import id.co.monitorkarya.core.network.mkJson
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dekode DTO terhadap bentuk JSON rute server sebenarnya + fungsi murni model. */
class EskalasiDtoTest {

    @Test
    fun `GET escalations - bentuk Prisma lengkap terbaca`() {
        val isi = mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), JSON_DAFTAR)
        assertEquals(2, isi.total)
        assertEquals(100, isi.pageSize)
        val a = isi.items[0]
        assertEquals("cmesc1", a.id)
        assertEquals("DAILY_REPORT", a.sourceType)
        assertEquals("ANGGARAN", a.needed)
        assertEquals(9, a.ageDays)
        assertTrue(a.isOverdue)
        assertEquals("BRH", a.entity?.code)
        assertEquals("Rani Kusuma", a.raisedBy?.name)
        assertNull(a.decidedBy)
        assertEquals(IzinEskalasiDto(mayReview = true, mayDecide = true, mayClose = false), a.perms)
        val b = isi.items[1]
        assertEquals("DIPUTUSKAN", b.status)
        assertEquals("Setujui penambahan memori.", b.decisionText)
        assertNull(b.entity?.region)
        assertEquals(IzinEskalasiDto(mayClose = true), b.perms)
    }

    @Test
    fun `GET escalations - respons server lama tanpa perms tetap terbaca`() {
        val lama = mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), JSON_DAFTAR_TANPA_PERMS)
        assertEquals(2, lama.items.size)
        assertTrue(lama.items.all { it.perms == null })
    }

    @Test
    fun `POST actions - undoToken terbaca, badan tanpa kolom null`() {
        val res = mkJson.decodeFromString(AksiEskalasiResponse.serializer(), JSON_AKSI)
        assertTrue(res.ok)
        assertEquals("tiket-123", res.undoToken)
        val tanpaTiket = mkJson.decodeFromString(AksiEskalasiResponse.serializer(), """{"ok":true,"escalation":{}}""")
        assertNull(tanpaTiket.undoToken)

        assertEquals(
            """{"action":"review","id":"e1"}""",
            mkJson.encodeToString(AksiEskalasiRequest.serializer(), AksiEskalasiRequest.tinjau("e1")),
        )
        assertEquals(
            """{"action":"decide","id":"e1","decisionText":"Setujui anggaran."}""",
            mkJson.encodeToString(AksiEskalasiRequest.serializer(), AksiEskalasiRequest.putuskan("e1", "Setujui anggaran.")),
        )
    }

    @Test
    fun `izin - hanya dari perms server`() {
        // Server menulis izin per item; klien memetakan apa adanya.
        assertEquals(
            IzinAksi(tinjau = true, putuskan = true),
            dto("DIAJUKAN", IzinEskalasiDto(mayReview = true, mayDecide = true)).keItem().izin,
        )
        assertEquals(IzinAksi(tutup = true), dto("DIPUTUSKAN", IzinEskalasiDto(mayClose = true)).keItem().izin)
        // Status tidak dipakai untuk menebak: perms server yang menentukan.
        assertEquals(IzinAksi(putuskan = true), dto("DIAJUKAN", IzinEskalasiDto(mayDecide = true)).keItem().izin)
        // Server lama tanpa perms: baca saja, tidak ada tombol tebakan.
        assertFalse(dto("DIAJUKAN", null).keItem().izin.ada)
        assertFalse(dto("DIPUTUSKAN", null).keItem().izin.ada)
    }

    @Test
    fun `izin - aksi yang ditolak 403 dikurangi dari perms`() {
        val e = dto("DIAJUKAN", IzinEskalasiDto(mayReview = true, mayDecide = true))
        assertEquals(IzinAksi(putuskan = true), e.keItem(setOf(AksiEskalasi.TINJAU)).izin)
        assertEquals(IzinAksi(), IzinAksi(tinjau = true).tanpa(setOf(AksiEskalasi.TINJAU)))
    }

    @Test
    fun `papan - kalimat jawaban dan dukungan sama dengan web`() {
        val items = mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), JSON_DAFTAR).items
            .map { it.keItem() }
        val papan = susunPapan(items, 2, SaringanEskalasi())
        assertEquals("2 eskalasi", papan.eyebrow)
        assertEquals("1 eskalasi menunggu keputusan.", papan.jawaban)
        assertEquals(
            "1 lewat SLA. 2 menunggu tindakan Anda. 1 sudah diputuskan dan menunggu ditutup.",
            papan.dukungan,
        )
        assertEquals(4, papan.kelompok.size)
        assertNull(papan.catatanHalaman)

        val tersaring = susunPapan(emptyList(), 0, SaringanEskalasi(status = StatusEskalasi.DITUTUP))
        assertEquals("Tidak ada eskalasi dengan saringan ini.", tersaring.jawaban)
        assertEquals("0 eskalasi tersaring", tersaring.eyebrow)
        assertEquals(1, tersaring.kelompok.size)

        val banyak = susunPapan(items, 1240, SaringanEskalasi(lewatSla = true))
        assertEquals("1.240 eskalasi cocok dengan saringan.", banyak.jawaban)
        assertEquals("Menampilkan 2 dari 1.240 eskalasi terbaru.", banyak.catatanHalaman)
    }

    @Test
    fun `papan - hanya halaman pertama termuat, hitungan disebut batas bawah (C2 R8)`() {
        val items = mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), JSON_DAFTAR).items
            .map { it.keItem() }
        val papan = susunPapan(items, 240, SaringanEskalasi())
        assertEquals("Sedikitnya 1 eskalasi menunggu keputusan.", papan.jawaban)
        assertEquals(
            "Sedikitnya 1 lewat SLA. Sedikitnya 2 menunggu tindakan Anda. Sedikitnya 1 sudah diputuskan dan menunggu ditutup.",
            papan.dukungan,
        )
        val tanpaMenunggu = susunPapan(items.filter { it.status != StatusEskalasi.DIAJUKAN }, 240, SaringanEskalasi())
        assertEquals("Tidak ada eskalasi menunggu keputusan di 1 eskalasi terbaru.", tanpaMenunggu.jawaban)
    }

    @Test
    fun `item - subjudul, sumber, alur`() {
        val e = mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), JSON_DAFTAR).items[0]
            .keItem()
        assertEquals("Butuh anggaran · 9 hari dari SLA 7", e.subjudul)
        assertEquals("Laporan harian proyek", e.sumber)
        assertEquals("BRH · Jawa Barat", e.kodeEntitas)
        val alur = tahapAlur(e)
        assertEquals(KeadaanTahap.TERHAMBAT, alur[0].keadaan)
        assertEquals("Lewat SLA", alur[0].meta)
        assertEquals("Rani Kusuma · 4 Okt 2026, 09.00", alur[0].sub)
        assertEquals(KeadaanTahap.BELUM, alur[3].keadaan)
        assertEquals(StatusEskalasi.DITUTUP, StatusEskalasi.dari("ANEH"))
    }

    @Test
    fun `waktu relatif - padanan formatRelative`() {
        val kini = Instant.parse("2026-10-13T10:00:00Z")
        assertEquals("Baru saja", waktuRelatif("2026-10-13T09:59:30Z", kini))
        assertEquals("5 menit lalu", waktuRelatif("2026-10-13T09:55:00Z", kini))
        assertEquals("3 jam lalu", waktuRelatif("2026-10-13T07:00:00Z", kini))
        assertEquals("Kemarin", waktuRelatif("2026-10-12T09:00:00Z", kini))
        assertEquals("4 hari lalu", waktuRelatif("2026-10-09T09:00:00Z", kini))
        assertEquals("1 Okt 2026", waktuRelatif("2026-10-01T09:00:00Z", kini))
        assertEquals("-", waktuRelatif(null, kini))
    }

    private fun dto(status: String, perms: IzinEskalasiDto?) = EskalasiDto(id = "e", status = status, perms = perms)

    companion object {
        /** Potret GET /api/escalations?page=1&pageSize=100 untuk Manajemen (rows + ageDays/isOverdue + perms). */
        val JSON_DAFTAR = """
            {"items":[
              {"id":"cmesc1","sourceType":"DAILY_REPORT","sourceId":"cmrpt9","entityId":"cment1",
               "raisedById":"u-pic","raisedAt":"2026-10-04T02:00:00.000Z",
               "summary":"Server SIM RS butuh penambahan memori sebelum integrasi BPJS.",
               "needed":"ANGGARAN","status":"DIAJUKAN","decidedById":null,"decidedAt":null,"decisionText":null,
               "slaDays":7,"createdAt":"2026-10-04T02:00:00.000Z","updatedAt":"2026-10-04T02:00:00.000Z",
               "entity":{"id":"cment1","name":"PT Bhakti Rahayu","code":"BRH","region":"Jawa Barat"},
               "raisedBy":{"id":"u-pic","name":"Rani Kusuma","email":"rani@contoh.id"},
               "decidedBy":null,"ageDays":9,"isOverdue":true,
               "perms":{"mayReview":true,"mayDecide":true,"mayClose":false}},
              {"id":"cmesc2","sourceType":"WEEKLY_ITEM","sourceId":"cmitem4","entityId":"cment2",
               "raisedById":"u-kadiv","raisedAt":"2026-10-11T03:00:00.000Z","summary":"Butuh dukungan tim jaringan.",
               "needed":"DUKUNGAN_LINTAS_FUNGSI","status":"DIPUTUSKAN","decidedById":"u-m",
               "decidedAt":"2026-10-12T04:00:00.000Z","decisionText":"Setujui penambahan memori.",
               "slaDays":7,"createdAt":"2026-10-11T03:00:00.000Z","updatedAt":"2026-10-12T04:00:00.000Z",
               "entity":{"id":"cment2","name":"PT Medika","code":"MDK","region":null},
               "raisedBy":{"id":"u-kadiv","name":"Budi Santoso","email":"budi@contoh.id"},
               "decidedBy":{"id":"u-m","name":"Sari Manajemen","email":"sari@contoh.id"},
               "ageDays":2,"isOverdue":false,
               "perms":{"mayReview":false,"mayDecide":false,"mayClose":true}}
            ],"total":2,"page":1,"pageSize":100}
        """.trimIndent()

        /** Server sebelum B3: tanpa kolom perms. */
        val JSON_DAFTAR_TANPA_PERMS = """
            {"items":[
              {"id":"cmesc1","sourceType":"DAILY_REPORT","sourceId":"cmrpt9","entityId":"cment1",
               "raisedById":"u-pic","raisedAt":"2026-10-04T02:00:00.000Z",
               "summary":"Server SIM RS butuh penambahan memori sebelum integrasi BPJS.",
               "needed":"ANGGARAN","status":"DIAJUKAN","decidedById":null,"decidedAt":null,"decisionText":null,
               "slaDays":7,"createdAt":"2026-10-04T02:00:00.000Z","updatedAt":"2026-10-04T02:00:00.000Z",
               "entity":{"id":"cment1","name":"PT Bhakti Rahayu","code":"BRH","region":"Jawa Barat"},
               "raisedBy":{"id":"u-pic","name":"Rani Kusuma","email":"rani@contoh.id"},
               "decidedBy":null,"ageDays":9,"isOverdue":true},
              {"id":"cmesc2","sourceType":"WEEKLY_ITEM","sourceId":"cmitem4","entityId":"cment2",
               "raisedById":"u-kadiv","raisedAt":"2026-10-11T03:00:00.000Z","summary":"Butuh dukungan tim jaringan.",
               "needed":"DUKUNGAN_LINTAS_FUNGSI","status":"DIPUTUSKAN","decidedById":"u-m",
               "decidedAt":"2026-10-12T04:00:00.000Z","decisionText":"Setujui penambahan memori.",
               "slaDays":7,"createdAt":"2026-10-11T03:00:00.000Z","updatedAt":"2026-10-12T04:00:00.000Z",
               "entity":{"id":"cment2","name":"PT Medika","code":"MDK","region":null},
               "raisedBy":{"id":"u-kadiv","name":"Budi Santoso","email":"budi@contoh.id"},
               "decidedBy":{"id":"u-m","name":"Sari Manajemen","email":"sari@contoh.id"},
               "ageDays":2,"isOverdue":false}
            ],"total":2,"page":1,"pageSize":100}
        """.trimIndent()

        /** Potret POST /api/escalations/actions sukses. */
        val JSON_AKSI = """
            {"ok":true,"escalation":{"id":"cmesc1","status":"DITINJAU","updatedAt":"2026-10-13T03:00:00.000Z"},
             "undoToken":"tiket-123"}
        """.trimIndent()
    }
}
