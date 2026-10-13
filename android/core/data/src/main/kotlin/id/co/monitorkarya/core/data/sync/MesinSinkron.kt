// Pengendali siklus hidup sinkron (A1-LURING.md §2): satu tempat yang
// menyalakan/mematikan WorkManager + pengamat jaringan mengikuti sesi.
//   mulai()                 — sesi siap (daring atau mulai dingin luring)
//   jeda()                  — sesi berakhir (401) tanpa keluar: data & antrean
//                             disimpan untuk pengguna yang sama
//   jedaDanTunggu()         — (C5-T3) sebelum masuk akun lain: batalkan DAN
//                             tunggu pekerja lama benar-benar berhenti
//   hentikanDanBersihkan()  — keluar eksplisit / ganti pengguna: batalkan +
//                             tunggu pekerja, lalu kosongkan Room (cache layar,
//                             peta id, outbox) + berkas bukti antre + stempel
//                             sinkron SELAGI memegang KunciSinkron.kerja
package id.co.monitorkarya.core.data.sync

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.outbox.BerkasAntre
import id.co.monitorkarya.core.data.prefs.MkPrefs
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

@Singleton
class MesinSinkron @Inject constructor(
    @ApplicationContext private val context: Context,
    private val konektivitas: ConnectivityObserver,
    private val db: MkDatabase,
    private val prefs: MkPrefs,
) {
    private val cakupan = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Volatile
    private var pengamat: Job? = null

    /**
     * Nyalakan sinkron: tarik berkala 15 menit + satu putaran segera, lalu
     * amati jaringan — setiap transisi luring → daring menjadwalkan satu
     * putaran (kirim antrean + segarkan data). Idempoten.
     */
    @Synchronized
    fun mulai() {
        SyncScheduler.jadwalkanBerkala(context)
        SyncScheduler.jadwalkanSekaliSaatOnline(context)
        if (pengamat?.isActive == true) return
        pengamat = cakupan.launch {
            var sebelumnya: Boolean? = null
            konektivitas.daring.collect { daring ->
                if (daring && sebelumnya == false) SyncScheduler.jadwalkanSekaliSaatOnline(context)
                sebelumnya = daring
            }
        }
    }

    /** Hentikan pekerjaan & pengamat, data tetap (sesi berakhir, pengguna sama akan masuk lagi). */
    fun jeda() {
        jedaDanBatalkan()
    }

    @Synchronized
    private fun jedaDanBatalkan(): Future<*> {
        pengamat?.cancel()
        pengamat = null
        return SyncScheduler.batalkanSemua(context)
    }

    /**
     * C5-T3: jeda lalu TUNGGU sampai pekerja yang sedang berjalan berhenti
     * (pembatalan WorkManager tercatat + KunciSinkron.kerja dilepas). Dipanggil
     * sebelum cookie akun lain dipasang — tidak ada kiriman antrean lama yang
     * sedang terbang saat sesi berganti.
     */
    suspend fun jedaDanTunggu() {
        tungguBatal(jedaDanBatalkan())
        withTimeoutOrNull(BATAS_TUNGGU_MS) { KunciSinkron.kerja.lock() }?.let { KunciSinkron.kerja.unlock() }
    }

    /**
     * Baris antrean tanpa pemilik (pra-Room v6) diadopsi [uid]. Aman dipanggil
     * setelah transisi Siap: bila uid berganti, antrean akun lama sudah
     * dikosongkan lebih dulu, jadi baris null yang tersisa milik [uid].
     */
    suspend fun adopsiAntrean(uid: String) {
        withContext(Dispatchers.IO) { runCatching { db.outboxDao().adopsiTanpaPemilik(uid) } }
    }

    /**
     * Keluar eksplisit atau akun berganti: hentikan + tunggu pekerja, lalu
     * kosongkan seluruh Room — proyek, laporan, mingguan, penerimaan,
     * cache_layar (potret layar), peta_id_lokal DAN outbox — serta berkas bukti
     * antrean: tulisan pengguna A tidak boleh terkirim dengan sesi pengguna B.
     * Layar keluar memperingatkan bila PenandaLuring.status.menungguKirim > 0.
     */
    suspend fun hentikanDanBersihkan() {
        bersihkanAkun(
            batalkan = { tungguBatal(jedaDanBatalkan()) },
            kunci = KunciSinkron.kerja,
            kosongkanDb = { withContext(Dispatchers.IO) { db.clearAllTables() } },
            // B2: berkas bukti antrean milik pengguna lama ikut dibuang.
            hapusBerkas = { withContext(Dispatchers.IO) { BerkasAntre(context).hapusSemua() } },
            setelUlang = { prefs.setTerakhirSinkron(0L) },
        )
    }

    private suspend fun tungguBatal(f: Future<*>) {
        withContext(Dispatchers.IO) { runCatching { f.get(BATAS_TUNGGU_MS, TimeUnit.MILLISECONDS) } }
    }

    internal companion object {
        /** Batas menunggu pekerja lama berhenti; lewat batas tetap lanjut (penjaga uid tetap berlaku). */
        const val BATAS_TUNGGU_MS = 15_000L
    }
}

/**
 * Urutan pembersihan akun (C5-T3, teruji JVM): batalkan pekerjaan → tunggu
 * pekerja melepas [kunci] → SELAGI memegang [kunci] kosongkan basis data dan
 * berkas antrean → setel ulang stempel. Pekerja yang dijadwalkan sesudahnya
 * menunggu [kunci] lalu mendapati antrean kosong. Bila pekerja lama tidak
 * berhenti dalam [batasTungguMs], pembersihan tetap jalan (lebih aman daripada
 * menyisakan data akun lama); penjaga uid pemilik tetap menahan kirimannya.
 */
internal suspend fun bersihkanAkun(
    batalkan: suspend () -> Unit,
    kunci: Mutex,
    kosongkanDb: suspend () -> Unit,
    hapusBerkas: suspend () -> Unit,
    setelUlang: suspend () -> Unit,
    batasTungguMs: Long = MesinSinkron.BATAS_TUNGGU_MS,
) {
    batalkan()
    val terkunci = withTimeoutOrNull(batasTungguMs) { kunci.lock() } != null
    try {
        kosongkanDb()
        hapusBerkas()
    } finally {
        if (terkunci) kunci.unlock()
    }
    setelUlang()
}
