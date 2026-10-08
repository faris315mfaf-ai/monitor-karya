// Penjadwal pekerjaan sinkron (FASE1.md §3): satu OneTimeWorkRequest dengan
// batasan jaringan supaya antrean outbox terantar segera setelah perangkat
// kembali daring — dipanggil SesiViewModel begitu sesi siap, dan aman dipanggil
// ulang (KEEP: pekerjaan bernama yang sudah menganggur tidak ditumpuk).
//
// Catatan integrasi :app — kontrak FASE1.md menulis paket "app.sync", tetapi
// SesiViewModel memanggil fungsi ini dengan tanda tangan yang sama; setelah
// pindah impor ke core.data.sync (atau dibuat pembungkus tipis di :app),
// pasang HiltWorkerFactory pada MKApp.workManagerConfiguration dan hapus
// androidx.startup WorkManagerInitializer dari manifest supaya @HiltWorker
// terbangun lewat pabrik Hilt.
package id.co.monitorkarya.core.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object SyncScheduler {

    /** Nama unik pekerjaan sinkron — dipakai KEEP supaya idempoten. */
    const val NAMA_PEKERJAAN = "mk-sinkron-saat-online"

    /**
     * Jadwalkan satu putaran sinkronisasi (outbox + tarik) saat jaringan
     * terhubung. Backoff eksponensial 30 detik untuk Result.retry SyncWorker.
     * Aman dipanggil berulang: pekerjaan bernama yang sama masih menunggu
     * batasan tidak dijadwalkan dua kali (ExistingWorkPolicy.KEEP).
     */
    fun jadwalkanSekaliSaatOnline(context: Context) {
        val permintaan = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(NAMA_PEKERJAAN, ExistingWorkPolicy.KEEP, permintaan)
    }
}
