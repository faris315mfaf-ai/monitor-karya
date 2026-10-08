// ViewModel sesi: satu-satunya pemegang status gerbang navigasi (Memuat →
// TanpaSesi / WajibGantiSandi / Siap). SesiUseCase (core.domain.usecase)
// di-construct di sini dengan lambda yang memanggil AuthApi langsung —
// domain tetap murni, pemetaan HTTP → hasil tetap di lapisan aplikasi.
package id.co.monitorkarya.app.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import id.co.monitorkarya.core.domain.usecase.HasilLogin
import id.co.monitorkarya.core.domain.usecase.HasilUbahSandi
import id.co.monitorkarya.core.domain.usecase.SesiUseCase
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.MkAuthStore
import id.co.monitorkarya.core.network.api.AuthApi
import id.co.monitorkarya.core.network.dto.GantiSandiRequest
import id.co.monitorkarya.core.network.dto.LoginRequest
import id.co.monitorkarya.core.network.dto.LoginUserDto
import id.co.monitorkarya.core.network.dto.MeUserDto
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** Status gerbang sesi yang dibaca MkNavHost. */
sealed interface SesiUiState {
    data object Memuat : SesiUiState
    data object TanpaSesi : SesiUiState
    data class WajibGantiSandi(val pengguna: PeranPengguna) : SesiUiState
    data class Siap(val pengguna: PeranPengguna) : SesiUiState
}

@HiltViewModel
class SesiViewModel @Inject constructor(
    authApi: AuthApi,
    private val authStore: MkAuthStore,
    private val prefs: MkPrefs,
) : ViewModel() {

    /** /api/auth/me memuat mustChangePassword, tetapi kontrak saya() A7 hanya
     *  mengembalikan PeranPengguna — bendera itu dititipkan lewat sini. */
    @Volatile
    private var wajibGantiSandiTerakhir: Boolean = false

    private val sesi: SesiUseCase = SesiUseCase(
        login = { identifier, sandi ->
            val res = authApi.login(LoginRequest(identifier, sandi))
            if (!res.isSuccessful) {
                val galat = ApiError.dari(HttpException(res))
                if (galat is ApiError.WajibGantiSandi) {
                    HasilLogin.Gagal(pesan = galat.pesanTampil(), wajibGantiSandi = true)
                } else {
                    HasilLogin.Gagal(pesan = galat.pesanTampil())
                }
            } else {
                val isi = res.body()
                // LoginResponse tidak memuat scopeEntityId — lengkapi lewat
                // /api/auth/me dengan cookie yang baru saja diterima.
                val pengguna = runCatching { authApi.saya().body()?.user?.kePengguna() }
                    .getOrNull()
                    ?: isi?.user?.kePengguna()
                    ?: throw IllegalStateException("Respons masuk tanpa pengguna.")
                HasilLogin.Sukses(pengguna = pengguna, wajibGantiSandi = isi?.mustChangePassword == true)
            }
        },
        saya = {
            val res = authApi.saya()
            when {
                res.isSuccessful -> res.body()?.user?.let { u ->
                    wajibGantiSandiTerakhir = u.mustChangePassword
                    u.kePengguna()
                }
                res.code() == 401 -> null
                else -> throw HttpException(res)
            }
        },
        gantiSandi = { kini, baru ->
            val res = authApi.gantiSandi(GantiSandiRequest(kini, baru))
            when {
                res.isSuccessful -> true
                res.code() == 422 -> false // sandi lama tidak cocok / kebijakan
                else -> throw HttpException(res)
            }
        },
        keluarSesi = {
            // A5: walau pencabutan sesi server gagal, sisi klien tetap hapus.
            runCatching { authApi.keluar() }
            authStore.hapus()
        },
    )

    private val _status = MutableStateFlow<SesiUiState>(SesiUiState.Memuat)
    val status: StateFlow<SesiUiState> = _status.asStateFlow()

    /** Sedang ada panggilan jaringan (tombol layar masuk nonaktif). */
    private val _sibuk = MutableStateFlow(false)
    val sibuk: StateFlow<Boolean> = _sibuk.asStateFlow()

    /** Pesan galat terakhir untuk formulir aktif; null bila bersih. */
    private val _pesanGalat = MutableStateFlow<String?>(null)
    val pesanGalat: StateFlow<String?> = _pesanGalat.asStateFlow()

    init {
        muat()
    }

    /** Muat sesi tersimpan (dipanggil saat mulai dingin). */
    fun muat() {
        viewModelScope.launch {
            _status.value = SesiUiState.Memuat
            val pengguna = sesi.muatSaya()
            ubahStatus(
                when {
                    pengguna == null -> SesiUiState.TanpaSesi
                    wajibGantiSandiTerakhir -> SesiUiState.WajibGantiSandi(pengguna)
                    else -> SesiUiState.Siap(pengguna)
                },
            )
        }
    }

    fun masuk(identifier: String, sandi: String) {
        if (_sibuk.value) return
        viewModelScope.launch {
            _sibuk.value = true
            _pesanGalat.value = null
            try {
                when (val hasil = sesi.masuk(identifier, sandi)) {
                    is HasilLogin.Sukses ->
                        ubahStatus(
                            if (hasil.wajibGantiSandi) {
                                SesiUiState.WajibGantiSandi(hasil.pengguna)
                            } else {
                                SesiUiState.Siap(hasil.pengguna)
                            },
                        )
                    is HasilLogin.Gagal ->
                        if (hasil.wajibGantiSandi) {
                            // Kredensial benar tetapi server memaksa ganti sandi:
                            // ambil profil dari sesi yang sudah terpasang.
                            val pengguna = sesi.muatSaya()
                            if (pengguna != null) {
                                ubahStatus(SesiUiState.WajibGantiSandi(pengguna))
                            } else {
                                _pesanGalat.value = hasil.pesan
                            }
                        } else {
                            _pesanGalat.value = hasil.pesan
                        }
                }
            } finally {
                _sibuk.value = false
            }
        }
    }

    fun gantiSandi(kini: String, baru: String) {
        if (_sibuk.value) return
        viewModelScope.launch {
            _sibuk.value = true
            _pesanGalat.value = null
            try {
                when (val hasil = sesi.ubahSandi(kini, baru)) {
                    is HasilUbahSandi.Sukses -> {
                        // Server mengganti cookie sesi setelah sandi berubah —
                        // muat ulang profil, jatuh kembali ke pengguna lama bila gagal.
                        val pengguna = sesi.muatSaya()
                            ?: (_status.value as? SesiUiState.WajibGantiSandi)?.pengguna
                        if (pengguna != null) ubahStatus(SesiUiState.Siap(pengguna))
                    }
                    is HasilUbahSandi.Gagal -> _pesanGalat.value = hasil.pesan
                }
            } finally {
                _sibuk.value = false
            }
        }
    }

    fun keluar() {
        if (_sibuk.value) return
        viewModelScope.launch {
            _sibuk.value = true
            try {
                sesi.keluar()
            } finally {
                _sibuk.value = false
                _pesanGalat.value = null
                // uidTerakhir sengaja dipertahankan untuk praisi layar masuk.
                ubahStatus(SesiUiState.TanpaSesi)
            }
        }
    }

    private fun ubahStatus(baru: SesiUiState) {
        _status.value = baru
        val pengguna = (baru as? SesiUiState.Siap)?.pengguna ?: return
        viewModelScope.launch {
            prefs.setUidTerakhir(pengguna.id)
            prefs.setPernahMasuk(true)
        }
    }

    private fun MeUserDto.kePengguna(): PeranPengguna = PeranPengguna(
        id = id,
        nama = name,
        email = email,
        // Peran tak dikenal (server lebih baru dari aplikasi) jatuh ke Auditor:
        // baca-saja, tidak bisa menulis apa pun — degradasi paling aman.
        peran = Peran.entries.firstOrNull { it.name == role } ?: Peran.AUDITOR,
        scopeEntitasId = scopeEntityId,
    )

    private fun LoginUserDto.kePengguna(): PeranPengguna = PeranPengguna(
        id = id,
        nama = name,
        email = email,
        peran = Peran.entries.firstOrNull { it.name == role } ?: Peran.AUDITOR,
        // DTO login tidak memuat scope entitas; dilengkapi /api/auth/me setelahnya.
        scopeEntitasId = null,
    )
}
