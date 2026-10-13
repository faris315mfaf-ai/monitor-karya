// Jembatan peristiwa sesi dari lapisan jaringan ke SesiViewModel: interceptor OkHttp
// (thread latar) melapor sesi dicabut/wajib ganti sandi; SesiViewModel mengubah
// status gerbang navigasi. Singleton agar OkHttpClient dan ViewModel berbagi satu arus.
package id.co.monitorkarya.app.vm

import id.co.monitorkarya.core.network.PeristiwaSesi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

@Singleton
class SesiPeristiwaBus @Inject constructor() {

    private val _alur = MutableSharedFlow<PeristiwaSesi>(extraBufferCapacity = KAPASITAS)

    /** Peristiwa sesi terdeteksi jaringan; pelanggan hanya menerima yang terjadi sesudah berlangganan. */
    val alur: SharedFlow<PeristiwaSesi> = _alur.asSharedFlow()

    /** Aman dipanggil dari thread mana pun; tidak pernah menangguhkan. */
    fun lapor(peristiwa: PeristiwaSesi) {
        _alur.tryEmit(peristiwa)
    }

    private companion object {
        const val KAPASITAS = 8
    }
}
