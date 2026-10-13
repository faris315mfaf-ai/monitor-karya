// Application Monitor Karya — titik masuk Hilt + WorkManager (Rancangan §6).
// WorkManager diinisialisasi sesuai permintaan lewat Configuration.Provider
// dengan HiltWorkerFactory supaya @HiltWorker (SyncWorker, core:data) bisa
// menerima dependensi Hilt. Inisialisasi bawaan androidx.startup
// (WorkManagerInitializer) dihapus di AndroidManifest — tanpa itu WorkManager
// terbangun dengan pabrik bawaan dan SyncWorker gagal diinstansiasi.
package id.co.monitorkarya.app

import android.app.Application
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class MKApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) Log.DEBUG else Log.WARN)
            .build()
}
