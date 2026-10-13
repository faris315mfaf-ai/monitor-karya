// Penjadwal pekerjaan sinkron (A1-LURING.md §2). Dua pekerjaan bernama,
// semuanya bersyarat jaringan tersambung dan menjalankan SyncWorker yang sama
// (keduanya diserialkan KunciSinkron.kerja — tidak pernah memproses bersamaan):
//   - BERKALA  : tarik + kirim tiap 15 menit selama sesi aktif;
//   - SEKALI   : segera saat ada tulisan baru / jaringan kembali / sesi siap.
// Dipasang & dihentikan oleh MesinSinkron (dipanggil SesiViewModel), bukan oleh
// layar. WorkManager memakai HiltWorkerFactory dari MKApp (inisialisasi
// bawaan androidx.startup dimatikan di AndroidManifest).
package id.co.monitorkarya.core.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

object SyncScheduler {

    /** Nama unik pekerjaan sekali-jalan. */
    const val NAMA_PEKERJAAN = "mk-sinkron-saat-online"

    /** Nama unik pekerjaan berkala. */
    const val NAMA_BERKALA = "mk-sinkron-berkala"

    /** Interval tarik berkala (minimum WorkManager 15 menit). */
    const val INTERVAL_MENIT = 15L

    /**
     * Semua keputusan jadwal/batal dijalankan berurutan di satu utas (C5-T2):
     * baca keadaan → enqueue tidak bisa disela penjadwalan lain, dan batal
     * (keluar/ganti akun) selalu SETELAH penjadwalan yang sudah diminta.
     * Pekerjaan WorkManager (getWorkInfos().get()) tidak pernah di utas UI.
     */
    private val pelaksana: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "mk-jadwal-sinkron").apply { isDaemon = true }
    }

    private val syaratJaringan: Constraints
        get() = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

    /**
     * Kebijakan nama unik sekali-jalan tanpa kehilangan pemicu (C5-T2):
     * - ada pekerjaan MENUNGGU (ENQUEUED/BLOCKED) → KEEP: ia belum membaca
     *   antrean, jadi tulisan baru pasti ikut terambil;
     * - hanya ada yang SEDANG BERJALAN → APPEND_OR_REPLACE: satu putaran
     *   penerus dijadwalkan setelahnya (KEEP akan membuang pemicu ini bila
     *   tulisan masuk tepat setelah pemeriksaan terakhir pekerja);
     * - tidak ada / sudah selesai → KEEP (= antre baru).
     * Rantai paling panjang 2 (satu berjalan + satu menunggu).
     */
    fun kebijakanSekali(keadaan: List<WorkInfo.State>): ExistingWorkPolicy {
        val menunggu = keadaan.any { it == WorkInfo.State.ENQUEUED || it == WorkInfo.State.BLOCKED }
        val berjalan = keadaan.any { it == WorkInfo.State.RUNNING }
        return if (berjalan && !menunggu) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP
    }

    /**
     * Jadwalkan satu putaran sinkronisasi (outbox + tarik) saat jaringan
     * terhubung. Backoff eksponensial 30 detik untuk Result.retry SyncWorker.
     * Aman dipanggil berulang dan dari utas mana pun (lihat [kebijakanSekali]).
     */
    fun jadwalkanSekaliSaatOnline(context: Context) {
        val app = context.applicationContext
        pelaksana.execute {
            runCatching {
                val wm = WorkManager.getInstance(app)
                val keadaan = wm.getWorkInfosForUniqueWork(NAMA_PEKERJAAN).get().map { it.state }
                val permintaan = OneTimeWorkRequestBuilder<SyncWorker>()
                    .setConstraints(syaratJaringan)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
                wm.enqueueUniqueWork(NAMA_PEKERJAAN, kebijakanSekali(keadaan), permintaan).result.get()
            }
        }
    }

    /** Pasang tarik berkala selama sesi aktif (KEEP: tidak menggeser jadwal yang ada). */
    fun jadwalkanBerkala(context: Context) {
        val app = context.applicationContext
        pelaksana.execute {
            runCatching {
                val permintaan = PeriodicWorkRequestBuilder<SyncWorker>(INTERVAL_MENIT, TimeUnit.MINUTES)
                    .setConstraints(syaratJaringan)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
                WorkManager.getInstance(app)
                    .enqueueUniquePeriodicWork(NAMA_BERKALA, ExistingPeriodicWorkPolicy.KEEP, permintaan)
                    .result.get()
            }
        }
    }

    /**
     * Hentikan semua pekerjaan sinkron (keluar / sesi berakhir). Future selesai
     * setelah WorkManager mencatat pembatalan (pekerja yang berjalan sudah
     * diberi sinyal berhenti) — MesinSinkron menunggunya lalu menunggu
     * KunciSinkron.kerja dilepas.
     */
    fun batalkanSemua(context: Context): Future<*> {
        val app = context.applicationContext
        return pelaksana.submit {
            runCatching {
                val wm = WorkManager.getInstance(app)
                val a = wm.cancelUniqueWork(NAMA_PEKERJAAN)
                val b = wm.cancelUniqueWork(NAMA_BERKALA)
                a.result.get()
                b.result.get()
            }
        }
    }
}
