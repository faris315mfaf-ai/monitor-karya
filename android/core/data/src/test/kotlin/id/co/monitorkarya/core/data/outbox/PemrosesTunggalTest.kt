package id.co.monitorkarya.core.data.outbox

import androidx.work.ExistingWorkPolicy
import androidx.work.WorkInfo
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.sync.SyncScheduler
import id.co.monitorkarya.core.data.sync.bersihkanAkun
import id.co.monitorkarya.core.data.sync.pemilikSah
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * C5 — TINGGI T2 (tepat satu pemroses + klaim baris), T3 (uid pemilik +
 * pembersihan akun menunggu pekerja), T4 (kunci potret per uid/tanggal), dan
 * RENDAH R1/R4.
 */
class PemrosesTunggalTest {

    private fun pesan(label: String, kunci: String? = null, pemilik: String? = "u-a") = OutboxEntity(
        jenis = "UJI",
        payloadJson = "{}",
        dibuatPada = 1_000L,
        kunci = kunci,
        label = label,
        kunciIdempotensi = "k-$label",
        pemilikUid = pemilik,
    )

    // ------------------------------------------------------------------ T2

    @Test
    fun duaPemrosesBersamaanMengirimSetiapPesanTepatSekali() = runBlocking {
        val dao = FakeOutboxDao()
        repeat(6) { dao.tambah(pesan("p$it", kunci = if (it % 2 == 0) "mingguan:d:W41" else null)) }
        val terkirim = java.util.Collections.synchronizedList(mutableListOf<String>())
        val berjalan = AtomicInteger(0)
        val puncak = AtomicInteger(0)
        val kunci = Mutex()
        fun pemroses() = OutboxProsesor(dao, jam = { 2_000L }, kunciProses = kunci) { p ->
            puncak.accumulateAndGet(berjalan.incrementAndGet(), ::maxOf)
            delay(5)
            terkirim += p.label!!
            berjalan.decrementAndGet()
            HasilKirim.Sukses()
        }
        // Pekerja sekali-jalan + berkala jatuh tempo bersamaan (dua instance, utas nyata).
        listOf(
            async(Dispatchers.Default) { pemroses().prosesAntrean() },
            async(Dispatchers.Default) { pemroses().prosesAntrean() },
        ).awaitAll()

        assertEquals((0 until 6).map { "p$it" }.sorted(), terkirim.sorted())
        assertEquals("tidak pernah ada dua kiriman bersamaan", 1, puncak.get())
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun barisYangDibuangSetelahDibacaTidakDikirimKarenaKlaimGagal() = runBlocking {
        val dao = FakeOutboxDao()
        val id = dao.tambah(pesan("a"))
        var dikirim = 0
        val prosesor = OutboxProsesor(
            dao,
            jam = { 2_000L },
            kunciProses = Mutex(),
            // Pengguna membuang pesan tepat di antara baca ulang dan kirim.
            bolehKirim = { dao.hapusBilaBelumDicoba(id); true },
        ) { dikirim++; HasilKirim.Sukses() }
        val r = prosesor.prosesAntrean()
        assertEquals(0, dikirim)
        assertEquals(0, r.terkirim)
    }

    @Test
    fun klaimYatimDipulihkanSebagaiKirimanAmbigu() = runBlocking {
        val dao = FakeOutboxDao()
        val id = dao.tambah(pesan("a"))
        assertEquals(1, dao.klaim(id)) // proses mati di tengah kiriman sebelumnya
        assertEquals(0, dao.klaim(id)) // klaim kedua ditolak
        val dicoba = mutableListOf<Int>()
        OutboxProsesor(dao, jam = { 2_000L }, kunciProses = Mutex()) { p -> dicoba += p.percobaan; HasilKirim.Sukses() }
            .prosesAntrean()
        // Dipulihkan dengan percobaan +1 (ambigu → HAPUS 404 dianggap selesai), lalu terkirim.
        assertEquals(listOf(1), dicoba)
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun pekerjaDihentikanDiTengahKirimanMelepasKlaim() = runBlocking {
        val dao = FakeOutboxDao()
        dao.tambah(pesan("a"))
        val mulai = CompletableDeferred<Unit>()
        val job = launch(Dispatchers.Default) {
            OutboxProsesor(dao, jam = { 2_000L }, kunciProses = Mutex()) {
                mulai.complete(Unit)
                delay(60_000)
                HasilKirim.Sukses()
            }.prosesAntrean()
        }
        mulai.await()
        assertEquals(OutboxEntity.STATUS_MENGIRIM, dao.baris.single().status)
        job.cancelAndJoin()
        val b = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_MENUNGGU, b.status)
        assertEquals(1, b.percobaan)
    }

    @Test
    fun kebijakanNamaUnikTidakMembuangPemicuSaatPekerjaBerjalan() {
        assertEquals(ExistingWorkPolicy.KEEP, SyncScheduler.kebijakanSekali(emptyList()))
        assertEquals(ExistingWorkPolicy.KEEP, SyncScheduler.kebijakanSekali(listOf(WorkInfo.State.SUCCEEDED)))
        assertEquals(ExistingWorkPolicy.KEEP, SyncScheduler.kebijakanSekali(listOf(WorkInfo.State.ENQUEUED)))
        // Sedang berjalan saja → satu putaran penerus disambung (bukan dibuang).
        assertEquals(ExistingWorkPolicy.APPEND_OR_REPLACE, SyncScheduler.kebijakanSekali(listOf(WorkInfo.State.RUNNING)))
        // Sudah ada penerus menunggu → cukup (rantai maksimum 2).
        assertEquals(
            ExistingWorkPolicy.KEEP,
            SyncScheduler.kebijakanSekali(listOf(WorkInfo.State.RUNNING, WorkInfo.State.BLOCKED)),
        )
    }

    // ------------------------------------------------------------------ T3

    @Test
    fun pemilikHarusSamaDenganUidSesiAktif() {
        assertTrue(pemilikSah("u-a", "u-a"))
        assertFalse(pemilikSah("u-a", "u-b"))
        assertFalse("tanpa sesi aktif tidak ada yang dikirim", pemilikSah("u-a", null))
        assertFalse("baris tanpa pemilik ditahan sampai diadopsi", pemilikSah(null, "u-a"))
    }

    @Test
    fun antreanAkunLamaTidakTerkirimDenganSesiAkunBaru() = runBlocking {
        val dao = FakeOutboxDao()
        dao.tambah(pesan("a1", kunci = "laporan:p:1", pemilik = "u-a"))
        dao.tambah(pesan("b1", kunci = "laporan:p:1", pemilik = "u-b")) // tertahan di belakang a1 (FIFO)
        dao.tambah(pesan("b2", pemilik = "u-b"))
        val terkirim = mutableListOf<String>()
        var uidAktif: String? = "u-b"
        val prosesor = OutboxProsesor(
            dao,
            jam = { 2_000L },
            kunciProses = Mutex(),
            bolehKirim = { p -> pemilikSah(p.pemilikUid, uidAktif) },
        ) { p -> terkirim += p.label!!; HasilKirim.Sukses() }

        val r = prosesor.prosesAntrean()
        assertEquals(listOf("b2"), terkirim)
        assertEquals(2, r.bukanPemilik)
        assertFalse("pesan orang lain tidak memicu retry", r.perluUlang)
        assertTrue(dao.baris.all { it.status == OutboxEntity.STATUS_MENUNGGU && it.percobaan == 0 })

        // Sesi dikosongkan (awal proses masuk akun lain): tidak ada yang dikirim.
        uidAktif = null
        dao.tambah(pesan("b3", pemilik = "u-b"))
        prosesor.prosesAntrean()
        assertEquals(listOf("b2"), terkirim)
    }

    @Test
    fun adopsiHanyaMengisiBarisTanpaPemilik() = runBlocking {
        val dao = FakeOutboxDao()
        dao.tambah(pesan("lama", pemilik = null))
        dao.tambah(pesan("baru", pemilik = "u-x"))
        dao.adopsiTanpaPemilik("u-a")
        assertEquals(listOf("u-a", "u-x"), dao.baris.map { it.pemilikUid })
    }

    @Test
    fun pembersihanAkunMenungguPekerjaLamaLaluMengosongkanSelagiMemegangKunci() = runBlocking {
        val kunci = Mutex()
        val jejak = java.util.Collections.synchronizedList(mutableListOf<String>())
        val pekerjaMulai = CompletableDeferred<Unit>()
        val lepaskan = CompletableDeferred<Unit>()
        val pekerja = launch(Dispatchers.Default) {
            kunci.withLock {
                pekerjaMulai.complete(Unit)
                lepaskan.await()
                jejak += "pekerja-selesai"
            }
        }
        pekerjaMulai.await()
        val bersih = async(Dispatchers.Default) {
            bersihkanAkun(
                batalkan = { jejak += "batal"; lepaskan.complete(Unit) },
                kunci = kunci,
                kosongkanDb = { assertTrue("kunci dipegang selama pengosongan", kunci.isLocked); jejak += "kosongkan-db" },
                hapusBerkas = { jejak += "hapus-berkas" },
                setelUlang = { jejak += "setel-ulang" },
            )
        }
        bersih.await()
        pekerja.join()
        assertEquals(listOf("batal", "pekerja-selesai", "kosongkan-db", "hapus-berkas", "setel-ulang"), jejak)
        assertFalse(kunci.isLocked)
    }

    @Test
    fun pembersihanTetapJalanBilaPekerjaLamaMacet() = runBlocking {
        val kunci = Mutex()
        kunci.lock() // pekerja macet tidak pernah melepas
        val jejak = mutableListOf<String>()
        bersihkanAkun(
            batalkan = { jejak += "batal" },
            kunci = kunci,
            kosongkanDb = { jejak += "kosongkan-db" },
            hapusBerkas = { jejak += "hapus-berkas" },
            setelUlang = { jejak += "setel-ulang" },
            batasTungguMs = 50,
        )
        assertEquals(listOf("batal", "kosongkan-db", "hapus-berkas", "setel-ulang"), jejak)
        assertTrue("kunci milik pekerja tidak dilepas pembersih", kunci.isLocked)
        yield()
    }

    // ------------------------------------------------------------------ T4

    @Test
    fun kunciPotretDipisahPerUidDanTanggal() {
        val kemarin = CacheLayar.kunciPengguna("u-a", CacheLayar.mejaLaporan("2026-10-12"))
        val hariIni = CacheLayar.kunciPengguna("u-a", CacheLayar.mejaLaporan("2026-10-13"))
        val akunLain = CacheLayar.kunciPengguna("u-b", CacheLayar.mejaLaporan("2026-10-13"))
        assertNotEquals(kemarin, hariIni)
        assertNotEquals(hariIni, akunLain)
        assertNotEquals(
            CacheLayar.kunciPengguna("u-a", CacheLayar.mejaKerjaPic("2026-10-12")),
            CacheLayar.kunciPengguna("u-a", CacheLayar.mejaKerjaPic("2026-10-13")),
        )
        assertNotEquals(CacheLayar.agendaMejaKerja("p", "2026-10-12"), CacheLayar.agendaMejaKerja("p", "2026-10-13"))
        assertTrue("tidak ada lagi kunci 'hari-ini' tanpa tanggal", "hari-ini" !in hariIni)
    }

    // ------------------------------------------------------------------ R1 / R4

    @Test
    fun pesanDiBelakangGagalFinalTidakMemicuRetry() = runBlocking {
        val dao = FakeOutboxDao()
        dao.tambah(pesan("a", kunci = "k").copy(status = OutboxEntity.STATUS_GAGAL))
        dao.tambah(pesan("b", kunci = "k"))
        val r = OutboxProsesor(dao, jam = { 2_000L }, kunciProses = Mutex()) { HasilKirim.Sukses() }.prosesAntrean()
        assertEquals(1, r.tertahanGagal)
        assertEquals(0, r.ditahan)
        assertFalse(r.perluUlang)
    }

    @Test
    fun kedaluwarsaSetelahKirimanTerputusMemperingatkanKemungkinanGanda() = runBlocking {
        val dao = FakeOutboxDao()
        dao.tambah(pesan("bersih"))
        val ambigu = dao.tambah(pesan("ambigu"))
        dao.perbarui(ambigu, OutboxEntity.STATUS_MENUNGGU, "luring", 2, 0)
        val jauh = 1_000L + OutboxProsesor.MASA_ANTRE_MS + 1
        OutboxProsesor(dao, jam = { jauh }, kunciProses = Mutex()) { HasilKirim.Sukses() }.prosesAntrean()
        val (a, b) = dao.baris
        assertEquals(OutboxProsesor.PESAN_KEDALUWARSA, a.pesanGalat)
        assertEquals(OutboxProsesor.PESAN_KEDALUWARSA_AMBIGU, b.pesanGalat)
    }
}
