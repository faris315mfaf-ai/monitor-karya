// Application Monitor Karya — titik masuk Hilt + WorkManager (Rancangan §6).
// Fase 0: sinkronisasi latar (outbox) belum dibangun, jadi WorkManager hanya
// didaftarkan dengan konfigurasi bawaan sebagai placeholder.
package id.co.monitorkarya.app

import android.app.Application
import android.util.Log
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class MKApp : Application(), Configuration.Provider {

    /**
     * Konfigurasi bawaan (placeholder Fase 0): tanpa WorkerFactory khusus.
     * Saat worker sinkronisasi dibuat (fase offline), sisipkan
     * HiltWorkerFactory di sini dan tambahkan meta-data penghapus
     * androidx.startup WorkManagerInitializer di manifest.
     */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) Log.DEBUG else Log.WARN)
            .build()
}
