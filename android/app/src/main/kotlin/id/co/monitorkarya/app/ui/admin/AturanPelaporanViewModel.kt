// ViewModel panel "Aturan pelaporan" Statistik Admin PT (BUG-02).
// GET/PUT /api/admin/report-settings. Tulis DARING saja: pengaturan berlaku
// seketika ke semua gerbang (dailyGate, kunci mingguan) sehingga antrean luring
// yang terkirim belakangan bisa menimpa keputusan lebih baru — luring = pesan.
package id.co.monitorkarya.app.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.MkProfilStore
import id.co.monitorkarya.core.network.api.ReportSettingsApi
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import retrofit2.Retrofit

/** Penyedia ReportSettingsApi dari Retrofit tunggal AppModule (berkas milik panel ini). */
@Module
@InstallIn(SingletonComponent::class)
object AturanPelaporanModule {
    @Provides
    @Singleton
    fun reportSettingsApi(retrofit: Retrofit): ReportSettingsApi = retrofit.create(ReportSettingsApi::class.java)
}

/** Status kartu: Memuat → Siap / Galat. */
sealed interface AturanUiState {
    data object Memuat : AturanUiState
    data class Siap(val aturan: AturanPelaporan, val entityId: String?) : AturanUiState
    data class Galat(val pesan: String) : AturanUiState
}

/** Umpan balik satu-kali (snackbar). */
data class NotifikasiAturan(val id: Long, val pesan: String, val galat: Boolean)

const val PESAN_LURING_ATURAN = "Anda sedang luring. Aturan pelaporan hanya bisa diubah saat daring."
private const val PESAN_GAGAL_MUAT = "Aturan pelaporan belum termuat."
private const val PESAN_TANPA_PT = "PT akun Anda tidak dikenali. Masuk ulang lalu coba lagi."

@HiltViewModel
class AturanPelaporanViewModel @Inject constructor(
    private val api: ReportSettingsApi,
    private val profilStore: MkProfilStore,
) : ViewModel() {

    private val _state = MutableStateFlow<AturanUiState>(AturanUiState.Memuat)
    val state: StateFlow<AturanUiState> = _state.asStateFlow()

    private val _menyimpan = MutableStateFlow(false)

    /** Satu simpanan sekali jalan — klik beruntun memakai data basi dan saling menimpa. */
    val menyimpan: StateFlow<Boolean> = _menyimpan.asStateFlow()

    private val _galatSimpan = MutableStateFlow<String?>(null)

    /** Galat simpan terakhir — tetap tampil di kartu sampai aksi berikutnya. */
    val galatSimpan: StateFlow<String?> = _galatSimpan.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiAturan?>(null)
    val notifikasi: StateFlow<NotifikasiAturan?> = _notifikasi.asStateFlow()

    private val _versiTersimpan = MutableStateFlow(0)

    /** Bertambah tiap simpanan sukses — layar memuat ulang kepatuhan (kunci/tenggat ikut berubah). */
    val versiTersimpan: StateFlow<Int> = _versiTersimpan.asStateFlow()

    init {
        muat()
    }

    fun muat() {
        viewModelScope.launch {
            _state.value = AturanUiState.Memuat
            _galatSimpan.value = null
            _state.value = try {
                val scope = withContext(Dispatchers.IO) { runCatching { profilStore.baca()?.scopeEntitasId }.getOrNull() }
                val res = api.ambil(scope)
                if (res.isSuccessful) {
                    val dto = res.body()?.settings
                    AturanUiState.Siap(aturan = petaAturan(dto), entityId = scope ?: dto?.entityId)
                } else {
                    AturanUiState.Galat(ApiError.dari(HttpException(res)).pesanTampil().ifBlank { PESAN_GAGAL_MUAT })
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                AturanUiState.Galat(ApiError.dari(e).pesanTampil())
            }
        }
    }

    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /** Simpan satu perubahan; [luring] dari pemantau konektivitas layar. */
    fun simpan(perubahan: PerubahanAturan, luring: Boolean) {
        val siap = _state.value as? AturanUiState.Siap ?: return
        if (_menyimpan.value) return
        if (luring) {
            gagal(PESAN_LURING_ATURAN)
            return
        }
        val entityId = siap.entityId
        if (entityId.isNullOrBlank()) {
            gagal(PESAN_TANPA_PT)
            return
        }
        viewModelScope.launch {
            _menyimpan.value = true
            _galatSimpan.value = null
            try {
                val res = api.simpan(badanSimpan(entityId, perubahan))
                if (res.isSuccessful) {
                    val dto = res.body()?.settings
                    val baru = dto?.let(::petaAturan) ?: siap.aturan.terapkan(perubahan)
                    val kini = _state.value as? AturanUiState.Siap ?: siap
                    _state.value = kini.copy(aturan = baru)
                    _notifikasi.value = NotifikasiAturan(System.nanoTime(), pesanTersimpan(perubahan), galat = false)
                    _versiTersimpan.value += 1
                } else {
                    gagal(ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                gagal(PESAN_LURING_ATURAN)
            } catch (e: Exception) {
                gagal(ApiError.dari(e).pesanTampil())
            } finally {
                _menyimpan.value = false
            }
        }
    }

    private fun gagal(pesan: String) {
        _galatSimpan.value = pesan
        _notifikasi.value = NotifikasiAturan(System.nanoTime(), pesan, galat = true)
    }
}
