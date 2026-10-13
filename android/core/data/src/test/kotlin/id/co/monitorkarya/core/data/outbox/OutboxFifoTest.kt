package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kontrak A1 (offline-first): FIFO per kunci dependensi, backoff, batas 7
 * hari → GAGAL (bukan dihapus), 409/422 GAGAL final yang menahan penerus.
 */
class OutboxFifoTest {

    private var sekarang = 10_000_000_000L
    private val jam = { sekarang }

    private fun pesan(label: String, kunci: String?, dibuat: Long = sekarang) =
        OutboxEntity(jenis = "J", payloadJson = "{}", dibuatPada = dibuat, kunci = kunci, label = label)

    private fun dao(vararg p: OutboxEntity) = FakeOutboxDao().also { d -> runBlocking { p.forEach { d.tambah(it) } } }

    @Test
    fun gagalSementaraMenahanPenerusBerkunciSamaTetapiBukanKunciLain() = runBlocking {
        val d = dao(pesan("simpan-A", "mingguan:A"), pesan("serah-A", "mingguan:A"), pesan("simpan-B", "mingguan:B"))
        val dicoba = mutableListOf<String>()
        val r = OutboxProsesor(d, jam) { p ->
            dicoba += p.label!!
            if (p.label == "simpan-A") HasilKirim.GagalSementara("503") else HasilKirim.Sukses()
        }.prosesAntrean()

        // serah-A TIDAK boleh melompati simpan-A; kunci B tetap jalan.
        assertEquals(listOf("simpan-A", "simpan-B"), dicoba)
        assertEquals(1, r.ditahan)
        assertTrue(r.perluUlang)
        assertEquals(listOf("simpan-A", "serah-A"), d.baris.map { it.label })
        val simpanA = d.baris.first()
        assertEquals(OutboxEntity.STATUS_MENUNGGU, simpanA.status)
        assertEquals(sekarang + OutboxProsesor.JEDA_DASAR_MS, simpanA.berikutnyaPada)
    }

    @Test
    fun backoffDihormatiLaluUrutanDilanjutkanSetelahJatuhTempo() = runBlocking {
        val d = dao(pesan("simpan", "k"), pesan("serah", "k"))
        var gagal = true
        val dicoba = mutableListOf<String>()
        val prosesor = OutboxProsesor(d, jam) { p ->
            dicoba += p.label!!
            if (gagal) HasilKirim.GagalSementara("503") else HasilKirim.Sukses()
        }
        prosesor.prosesAntrean()
        gagal = false

        // Belum jatuh tempo: tidak ada yang dicoba, keduanya ditahan.
        sekarang += OutboxProsesor.JEDA_DASAR_MS - 1
        val r2 = prosesor.prosesAntrean()
        assertEquals(listOf("simpan"), dicoba)
        assertEquals(2, r2.ditahan)

        // Jatuh tempo: simpan lalu serah, urut.
        sekarang += 1
        prosesor.prosesAntrean()
        assertEquals(listOf("simpan", "simpan", "serah"), dicoba)
        assertTrue(d.baris.isEmpty())
    }

    @Test
    fun gagalFinalMenahanPenerusSampaiPenggunaBertindak() = runBlocking {
        val d = dao(pesan("simpan", "k"), pesan("serah", "k"))
        val dicoba = mutableListOf<String>()
        var tolak = true
        val prosesor = OutboxProsesor(d, jam) { p ->
            dicoba += p.label!!
            if (p.label == "simpan" && tolak) HasilKirim.GagalPermanen("Laporan sudah dibekukan.") else HasilKirim.Sukses()
        }
        prosesor.prosesAntrean()
        prosesor.prosesAntrean()
        // serah tidak pernah dikirim selama simpan GAGAL (server tidak "ditimpa").
        assertEquals(listOf("simpan"), dicoba)
        assertEquals(OutboxEntity.STATUS_GAGAL, d.baris[0].status)
        assertEquals("Laporan sudah dibekukan.", d.baris[0].pesanGalat)
        assertEquals(OutboxEntity.STATUS_MENUNGGU, d.baris[1].status)

        // Pengguna membuang pesan gagal → penerus jalan.
        d.hapus(d.baris[0].id)
        prosesor.prosesAntrean()
        assertEquals(listOf("simpan", "serah"), dicoba)
        assertTrue(d.baris.isEmpty())

        // Varian: ulangi setelah masalah diselesaikan (mis. buka kunci).
        val d2 = dao(pesan("simpan", "k"))
        val p2 = OutboxProsesor(d2, jam) { if (tolak) HasilKirim.GagalPermanen("409") else HasilKirim.Sukses() }
        p2.prosesAntrean()
        tolak = false
        d2.ulangi(d2.baris.single().id, sekarang)
        assertEquals(OutboxEntity.STATUS_MENUNGGU, d2.baris.single().status)
        p2.prosesAntrean()
        assertTrue(d2.baris.isEmpty())
    }

    @Test
    fun luringTidakMemberiBackoffTetapiMenahanKunci() = runBlocking {
        val d = dao(pesan("a1", "a"), pesan("a2", "a"))
        val dicoba = mutableListOf<String>()
        val r = OutboxProsesor(d, jam) { p -> dicoba += p.label!!; HasilKirim.Luring }.prosesAntrean()
        assertEquals(listOf("a1"), dicoba)
        assertEquals(1, r.luring)
        assertEquals(0L, d.baris[0].berikutnyaPada)
        assertEquals(OutboxProsesor.PESAN_LURING, d.baris[0].pesanGalat)
    }

    @Test
    fun kedaluwarsaTujuhHariJadiGagalTampilBukanDihapus() = runBlocking {
        val tua = sekarang - OutboxProsesor.MASA_ANTRE_MS - 1
        val d = dao(pesan("lama", "k", dibuat = tua), pesan("baru", "k"))
        val dicoba = mutableListOf<String>()
        OutboxProsesor(d, jam) { p -> dicoba += p.label!!; HasilKirim.Sukses() }.prosesAntrean()
        // Yang lama tidak dikirim, menjadi GAGAL dengan pesan; penerus berkunci sama ditahan.
        assertTrue(dicoba.isEmpty())
        assertEquals(OutboxEntity.STATUS_GAGAL, d.baris[0].status)
        assertEquals(OutboxProsesor.PESAN_KEDALUWARSA, d.baris[0].pesanGalat)
        assertEquals(OutboxEntity.STATUS_MENUNGGU, d.baris[1].status)
    }

    @Test
    fun gagalSangatLamaDibersihkan() = runBlocking {
        val d = FakeOutboxDao()
        d.tambah(
            pesan("x", null, dibuat = sekarang - OutboxProsesor.MASA_SIMPAN_GAGAL_MS - 1)
                .copy(status = OutboxEntity.STATUS_GAGAL),
        )
        OutboxProsesor(d, jam) { HasilKirim.Sukses() }.prosesAntrean()
        assertTrue(d.baris.isEmpty())
    }

    @Test
    fun pesanTanpaKunciTidakSalingMenahan() = runBlocking {
        val d = dao(pesan("a", null), pesan("b", null))
        val dicoba = mutableListOf<String>()
        OutboxProsesor(d, jam) { p ->
            dicoba += p.label!!
            if (p.label == "a") HasilKirim.GagalPermanen("422") else HasilKirim.Sukses()
        }.prosesAntrean()
        assertEquals(listOf("a", "b"), dicoba)
    }

    @Test
    fun jedaBackoffEksponensialBerbatas() {
        assertEquals(30_000L, OutboxProsesor.jedaBackoff(1))
        assertEquals(60_000L, OutboxProsesor.jedaBackoff(2))
        assertEquals(120_000L, OutboxProsesor.jedaBackoff(3))
        assertEquals(OutboxProsesor.JEDA_MAKS_MS, OutboxProsesor.jedaBackoff(50))
        assertFalse(OutboxProsesor.Ringkasan().perluUlang)
    }

    @Test
    fun ringkasanMencatatIdTerbesarPotret() = runBlocking {
        val d = dao(pesan("a", null), pesan("b", null))
        val r = OutboxProsesor(d, jam) { HasilKirim.Sukses() }.prosesAntrean()
        assertEquals(2L, r.idTerbesar)
        assertEquals(2, r.terkirim)
    }
}
