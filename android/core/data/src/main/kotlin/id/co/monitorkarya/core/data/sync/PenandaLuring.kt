// Penanda luring bersama untuk semua layar (A1-LURING.md §5): satu Flow yang
// menggabungkan status jaringan, waktu sinkron terakhir, dan jumlah antrean.
// Composable siap pakai ada di app/ui/luring (BannerLuring, StatusAntrean).
package id.co.monitorkarya.core.data.sync

import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.prefs.MkPrefs
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged

/** Potret penanda luring untuk UI. */
data class StatusLuring(
    /** Jaringan ber-internet tervalidasi tersedia. */
    val daring: Boolean = true,
    /** Epoch millis sinkron penuh terakhir yang berhasil; null bila belum pernah. */
    val terakhirSinkronMs: Long? = null,
    /** Jumlah tulisan "Menunggu kirim". */
    val menungguKirim: Int = 0,
    /** Jumlah tulisan "Gagal kirim" (perlu tindakan pengguna). */
    val gagalKirim: Int = 0,
) {
    val luring: Boolean get() = !daring
}

@Singleton
class PenandaLuring @Inject constructor(
    konektivitas: ConnectivityObserver,
    prefs: MkPrefs,
    db: MkDatabase,
) {
    private val dao = db.outboxDao()

    /** Status gabungan; memancar nilai awal segera setelah dikoleksi. */
    val status: Flow<StatusLuring> = combine(
        konektivitas.daring,
        prefs.terakhirSinkron,
        dao.jumlahMenunggu(),
        dao.jumlahGagal(),
    ) { daring, sinkron, menunggu, gagal ->
        StatusLuring(
            daring = daring,
            terakhirSinkronMs = sinkron.takeIf { it > 0L },
            menungguKirim = menunggu,
            gagalKirim = gagal,
        )
    }.distinctUntilChanged()
}
