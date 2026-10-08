// Pengamatan konektivitas jaringan (Rancangan §4): Flow<Boolean> yang memancar
// status daring saat ini lalu setiap perubahan, dibangun callbackFlow supaya
// callback ConnectivityManager terlepas otomatis saat kolektor berhenti
// (awaitClose). UI memakai ini untuk badge "luring" dan memicu penjadwalan
// ulang SyncScheduler saat jaringan kembali.
package id.co.monitorkarya.core.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Pengamat status daring perangkat. [daring] memancar nilai saat ini ketika
 * dikoleksi, lalu setiap kali jaringan (non)tersedia; nilai berulang
 * dideduplikasi [distinctUntilChanged].
 */
@Singleton
class ConnectivityObserver @Inject constructor(@ApplicationContext context: Context) {

    private val appContext = context.applicationContext

    /** true bila ada jaringan aktif dengan internet tervalidasi. */
    val daring: Flow<Boolean> = callbackFlow {
        val manager = appContext.getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(jaringan: Network) {
                trySend(true)
            }

            override fun onLost(jaringan: Network) {
                // Satu jaringan bisa hilang saat yang lain masih terpasang.
                trySend(saatIniDaring(manager))
            }
        }
        trySend(saatIniDaring(manager))
        manager?.registerNetworkCallback(permintaanJaringan, callback)
        awaitClose { manager?.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()

    private val permintaanJaringan: NetworkRequest =
        NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

    private fun saatIniDaring(manager: ConnectivityManager?): Boolean {
        val jaringan = manager?.activeNetwork ?: return false
        val kapabilitas = manager.getNetworkCapabilities(jaringan) ?: return false
        return kapabilitas.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            kapabilitas.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
