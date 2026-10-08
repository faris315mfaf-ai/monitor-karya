package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxDao
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.network.ApiError
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kontrak pemroses antrean outbox Fase 1 (tes oleh agen T5-B9). Prinsip yang
 * diuji (RANCANGAN-ANDROID-NATIVE.md §4): hasil server final — 409 beku/
 * terkunci dan 422 menggagalkan pesan secara permanen; kegagalan jaringan
 * menaikkan percobaan dan pesan tetap MENUNGGU; sukses menghapus pesan.
 *
 * Keputusan kirim memakai [HasilKirim] (zona data, sudah mendarat): repositori
 * membungkus panggilan Retrofit lewat `tulisApi` — IOException menjadi
 * [HasilKirim.Luring], HTTP 409/422 lewat `ApiError.dari` lalu
 * [HasilKirim.dari] menjadi [HasilKirim.GagalPermanen].
 *
 * Kontrak kelas yang diharapkan di paket ini (pemilik: agen sinkronisasi/
 * zona `:core:data`; catatan lihat `android/docs/FASE1.md` §3):
 *
 * ```kotlin
 * class OutboxProsesor(
 *     private val dao: OutboxDao,
 *     private val kirim: suspend (OutboxEntity) -> HasilKirim,
 * ) {
 *     suspend fun prosesAntrean() // semua MENUNGGU, urut id naik
 * }
 * ```
 *
 * Aturan per hasil [HasilKirim]:
 * - [HasilKirim.Sukses] → tandai BERHASIL lalu hapus (`hapusBerhasil`);
 * - [HasilKirim.GagalPermanen] → GAGAL permanen, `pesanGalat` diisi, baris
 *   TIDAK dihapus (perlu ditindak pengguna);
 * - [HasilKirim.Luring] / [HasilKirim.GagalSementara] → percobaan naik,
 *   status tetap MENUNGGU.
 *
 * Tanpa Room sungguhan: DAO dipalsukan di memori, eksekutor lambda.
 * `OutboxProsesor` belum ditulis siapa pun saat berkas ini disusun — tes ini
 * spesifikasi eksekusinya. `runBlocking` dipakai karena
 * `kotlinx-coroutines-test` belum deklaratif di testImplementation modul ini
 * (catatan audit T5-B9). Bagian `HasilKirim.dari` menguji kode yang sudah ada.
 */
class OutboxProsesTest {

    /** OutboxDao berbasis MutableList — cukup untuk aturan antrean. */
    private class FakeOutboxDao : OutboxDao {
        val baris = mutableListOf<OutboxEntity>()

        private fun snapshotMenunggu(): List<OutboxEntity> =
            baris.filter { it.status == OutboxEntity.STATUS_MENUNGGU }.sortedBy { it.id }

        override suspend fun simpan(satu: OutboxEntity): Long {
            val id = if (satu.id == 0L) (baris.maxOfOrNull { it.id } ?: 0L) + 1 else satu.id
            val baru = satu.copy(id = id)
            baris.removeAll { it.id == id }
            baris.add(baru)
            return id
        }

        override fun antrian(): Flow<List<OutboxEntity>> = flowOf(snapshotMenunggu())

        override suspend fun tandai(id: Long, status: String, pesan: String?, percobaan: Int) {
            val i = baris.indexOfFirst { it.id == id }
            if (i >= 0) baris[i] = baris[i].copy(status = status, pesanGalat = pesan, percobaan = percobaan)
        }

        override suspend fun hapusBerhasil() {
            baris.removeAll { it.status == OutboxEntity.STATUS_BERHASIL }
        }

        override suspend fun hapusKedaluwarsa(sebelum: Long) {
            baris.removeAll { it.dibuatPada < sebelum }
        }

        override fun jumlahMenunggu(): Flow<Int> = flowOf(snapshotMenunggu().size)
    }

    private fun pesanBaru(jenis: String = "KIRIM_LAPORAN", payloadJson: String = "{}"): OutboxEntity =
        OutboxEntity(jenis = jenis, payloadJson = payloadJson, dibuatPada = 1_000L)

    private fun daoDengan(vararg pesan: OutboxEntity): FakeOutboxDao {
        val dao = FakeOutboxDao()
        runBlocking { pesan.forEach { dao.simpan(it) } }
        return dao
    }

    // ------------------------------------------- HasilKirim.dari (kode ada)

    @Test
    fun hasilKirimDariGalatTerverifikasi() {
        // 409 beku → permanen; 422 → permanen; jaringan → luring; 5xx → sementara.
        val beku = HasilKirim.dari(
            ApiError.Konflik(
                pesan = "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.",
                locked = true,
                frozen = "FORWARDED",
                reportId = "rep-77",
            ),
        )
        assertTrue(beku is HasilKirim.GagalPermanen)
        assertEquals(
            "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.",
            (beku as HasilKirim.GagalPermanen).pesan,
        )

        assertTrue(
            HasilKirim.dari(ApiError.Validasi(pesan = "Status dan capaian hari ini wajib diisi.")) is
                HasilKirim.GagalPermanen,
        )
        assertTrue(HasilKirim.dari(ApiError.Jaringan(pesan = "…")) is HasilKirim.Luring)
        assertTrue(HasilKirim.dari(ApiError.Server(pesan = "…")) is HasilKirim.GagalSementara)
    }

    // ------------------------------------------- OutboxProsesor (spesifikasi)

    @Test
    fun suksesMenghapusPesanDariAntrean() = runBlocking {
        val dao = daoDengan(pesanBaru())
        val diproses = mutableListOf<Long>()
        val prosesor = OutboxProsesor(dao) { pesan ->
            diproses.add(pesan.id)
            HasilKirim.Sukses()
        }
        prosesor.prosesAntrean()
        // Berhasil = ditandai BERHASIL lalu dihapus (OutboxDao.hapusBerhasil).
        assertTrue("pesan sukses harus hilang dari antrean", dao.baris.isEmpty())
        assertEquals(listOf(1L), diproses)
    }

    @Test
    fun konflik409MenggagalkanPesanSecaraPermanen() = runBlocking {
        val dao = daoDengan(pesanBaru())
        val prosesor = OutboxProsesor(dao) {
            HasilKirim.dari(
                ApiError.Konflik(
                    pesan = "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.",
                    locked = true,
                    frozen = "FORWARDED",
                    reportId = "rep-77",
                ),
            )
        }
        prosesor.prosesAntrean()
        val baris = dao.baris.single()
        assertEquals("GAGAL permanen: keputusan server final", OutboxEntity.STATUS_GAGAL, baris.status)
        assertEquals(
            "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.",
            baris.pesanGalat,
        )
        assertEquals(1, baris.percobaan)
        // Memproses ulang tidak mengubah nasib pesan yang sudah GAGAL.
        prosesor.prosesAntrean()
        assertEquals(OutboxEntity.STATUS_GAGAL, dao.baris.single().status)
    }

    @Test
    fun luringMenaikkanPercobaanDanTetapMenunggu() = runBlocking {
        // IOException ditangkap tulisApi → HasilKirim.Luring; antrean mencoba lagi.
        val dao = daoDengan(pesanBaru())
        val prosesor = OutboxProsesor(dao) { HasilKirim.Luring }
        prosesor.prosesAntrean()
        val baris = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_MENUNGGU, baris.status)
        assertEquals(1, baris.percobaan)

        // Percobaan kedua (jaringan masih putus): naik lagi, tetap MENUNGGU.
        prosesor.prosesAntrean()
        val baris2 = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_MENUNGGU, baris2.status)
        assertEquals(2, baris2.percobaan)

        // Jaringan kembali: pesan terkirim dan antrean kosong.
        val prosesorBaik = OutboxProsesor(dao) { HasilKirim.Sukses() }
        prosesorBaik.prosesAntrean()
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun gagalSementaraMenaikkanPercobaanDanTetapMenunggu() = runBlocking {
        // 5xx / 429 / sesi habis: boleh dicoba lagi, jangan gagalkan permanen.
        val dao = daoDengan(pesanBaru())
        val prosesor = OutboxProsesor(dao) {
            HasilKirim.dari(ApiError.Server(pesan = "Server sedang bermasalah. Coba lagi nanti."))
        }
        prosesor.prosesAntrean()
        val baris = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_MENUNGGU, baris.status)
        assertEquals(1, baris.percobaan)
        assertTrue(!baris.pesanGalat.isNullOrEmpty())
    }

    @Test
    fun validasi422MenggagalkanPesanSecaraPermanen() = runBlocking {
        val dao = daoDengan(pesanBaru())
        val prosesor = OutboxProsesor(dao) {
            HasilKirim.dari(ApiError.Validasi(pesan = "Status dan capaian hari ini wajib diisi."))
        }
        prosesor.prosesAntrean()
        val baris = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_GAGAL, baris.status)
        assertEquals("Status dan capaian hari ini wajib diisi.", baris.pesanGalat)
    }

    @Test
    fun antreanDiprosesUrutIdNaik() = runBlocking {
        val dao = daoDengan(pesanBaru("KIRIM_LAPORAN"), pesanBaru("TAMBAH_TUGAS"), pesanBaru("UNGGAH_BUKTI"))
        val urutan = mutableListOf<String>()
        val prosesor = OutboxProsesor(dao) { pesan ->
            urutan.add(pesan.jenis)
            HasilKirim.Sukses()
        }
        prosesor.prosesAntrean()
        // FIFO: id kecil dikirim lebih dulu, semua dicoba dalam satu putaran.
        assertEquals(listOf("KIRIM_LAPORAN", "TAMBAH_TUGAS", "UNGGAH_BUKTI"), urutan)
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun kegagalanSatuPesanTidakMenghentikanPutaran() = runBlocking {
        val dao = daoDengan(
            pesanBaru("KIRIM_LAPORAN"),
            pesanBaru("UNGGAH_BUKTI"),
            pesanBaru("TAMBAH_TUGAS"),
        )
        val terkirim = mutableListOf<String>()
        val prosesor = OutboxProsesor(dao) { pesan ->
            if (pesan.jenis == "UNGGAH_BUKTI") {
                HasilKirim.Luring
            } else {
                terkirim.add(pesan.jenis)
                HasilKirim.Sukses()
            }
        }
        prosesor.prosesAntrean()
        // Dua pesan lain tetap diproses walau satu gagal jaringan.
        assertEquals(listOf("KIRIM_LAPORAN", "TAMBAH_TUGAS"), terkirim)
        val tersisa = dao.baris.single()
        assertEquals("UNGGAH_BUKTI", tersisa.jenis)
        assertEquals(OutboxEntity.STATUS_MENUNGGU, tersisa.status)
        assertEquals(1, tersisa.percobaan)
    }
}
