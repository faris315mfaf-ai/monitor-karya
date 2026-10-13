// ViewModel sesi: satu-satunya pemegang status gerbang navigasi (Memuat →
// TanpaSesi / WajibGantiSandi / Siap). SesiUseCase (core.domain.usecase)
// di-construct di sini dengan lambda yang memanggil AuthApi langsung —
// domain tetap murni, pemetaan HTTP → hasil tetap di lapisan aplikasi.
//
// Offline-first (A1-LURING.md §1–2): mulai dingin memakai tri-state
// HasilSaya; luring + cookie + profil tersimpan = masuk shell bertanda luring
// lalu divalidasi ulang saat jaringan kembali (401 nyata → layar masuk).
// Sesi siap menyalakan MesinSinkron; keluar menghentikan & membersihkan Room
// + outbox; sesi berakhir (401) hanya menjeda (antrean milik pengguna sama).
//
// C3-T3: transisi ke Siap memakai [transisiSiap] — pembersihan data akun lama
// SELESAI dulu, baru status Siap terbit. Semua transisi berjalan di bawah satu
// Mutex supaya dua transisi (mis. muat() + validasi ulang) tidak saling silang.
// C3-S5: pembersihan ikut mengosongkan cache gambar Coil (foto bukti PT lain).
// C3-R5: peristiwa BERAKHIR (401 dari POST logout) diabaikan selama keluar().
// C5-T3: uid sesi aktif (MkPrefs.uidSesi) = satu-satunya pemilik antrean yang
// boleh dikirim pekerja. Dikosongkan + pekerja lama dihentikan dan DITUNGGU di
// awal masuk() (sebelum cookie akun baru tersimpan oleh authApi.login), pada
// setiap status non-Siap, dan saat keluar; diisi tepat sebelum Siap terbit.
package id.co.monitorkarya.app.vm

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.annotation.ExperimentalCoilApi
import coil.imageLoader
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.data.sync.ConnectivityObserver
import id.co.monitorkarya.core.data.sync.MesinSinkron
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import id.co.monitorkarya.core.domain.usecase.GalatSesi
import id.co.monitorkarya.core.domain.usecase.HasilLogin
import id.co.monitorkarya.core.domain.usecase.HasilSaya
import id.co.monitorkarya.core.domain.usecase.KeputusanMulai
import id.co.monitorkarya.core.domain.usecase.HasilUbahSandi
import id.co.monitorkarya.core.domain.usecase.SesiUseCase
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.MkAuthStore
import id.co.monitorkarya.core.network.MkProfilStore
import id.co.monitorkarya.core.network.PeristiwaSesi
import id.co.monitorkarya.core.network.api.AuthApi
import id.co.monitorkarya.core.network.dto.GantiSandiRequest
import id.co.monitorkarya.core.network.dto.LoginRequest
import id.co.monitorkarya.core.network.dto.LoginUserDto
import id.co.monitorkarya.core.network.dto.MeUserDto
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import retrofit2.HttpException

/** Status gerbang sesi yang dibaca MkNavHost. */
sealed interface SesiUiState {
    data object Memuat : SesiUiState
    data object TanpaSesi : SesiUiState
    data class WajibGantiSandi(val pengguna: PeranPengguna) : SesiUiState
    /**
     * Shell aktif. [luring] = mulai dingin tanpa jaringan memakai profil
     * tersimpan (sesi belum dikonfirmasi server); kembali false setelah
     * validasi ulang daring berhasil.
     */
    data class Siap(val pengguna: PeranPengguna, val luring: Boolean = false) : SesiUiState
}

@HiltViewModel
class SesiViewModel @Inject constructor(
    authApi: AuthApi,
    private val authStore: MkAuthStore,
    private val prefs: MkPrefs,
    peristiwaSesi: SesiPeristiwaBus,
    private val profilStore: MkProfilStore,
    private val mesin: MesinSinkron,
    konektivitas: ConnectivityObserver,
    @param:ApplicationContext private val konteks: Context,
) : ViewModel() {

    /** Satu transisi status sekaligus (C3-T3). */
    private val kunciTransisi = Mutex()

    /** Keluar eksplisit sedang berjalan: 401 dari POST logout bukan "sesi berakhir" (C3-R5). */
    @Volatile
    private var sedangKeluar: Boolean = false

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
            if (res.isSuccessful) {
                true
            } else {
                // 422 ("Kata sandi saat ini salah." / kebijakan), 429 (terlalu banyak
                // percobaan), 401 (sesi habis), 503: pesan server sudah ramah dan
                // spesifik — tampilkan, jangan ratakan jadi "tidak dapat menghubungi server".
                throw GalatSesi(ApiError.dari(HttpException(res)).pesanTampil())
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
        viewModelScope.launch {
            peristiwaSesi.alur.collect { peristiwa ->
                when (peristiwa) {
                    // Sesi dicabut/kedaluwarsa di tengah pemakaian (mis. kata sandi diganti di web):
                    // kembali ke layar masuk, bukan membiarkan tiap layar menampilkan galat buntu.
                    PeristiwaSesi.BERAKHIR -> {
                        val sedangMasuk = _status.value is SesiUiState.Siap || _status.value is SesiUiState.WajibGantiSandi
                        if (sedangMasuk && !sedangKeluar) {
                            _pesanGalat.value = PESAN_SESI_BERAKHIR
                            sesiBerakhir()
                        }
                    }
                    // Admin menyetel ulang akun saat aplikasi terbuka: /api/auth/me melaporkan
                    // mustChangePassword sehingga gerbang menuju layar ganti sandi.
                    PeristiwaSesi.WAJIB_GANTI_SANDI ->
                        if (_status.value is SesiUiState.Siap) muat()
                }
            }
        }
        // Validasi ulang sesi luring begitu jaringan ada; selama server masih
        // tak terjangkau, coba lagi tiap menit (dibatalkan bila status berubah).
        viewModelScope.launch {
            combine(konektivitas.daring, _status) { daring, s -> daring && s is SesiUiState.Siap && s.luring }
                .distinctUntilChanged()
                .collectLatest { perlu ->
                    while (perlu && validasiUlang() is HasilSaya.TakTerjangkau) delay(JEDA_VALIDASI_MS)
                }
        }
    }

    /** Muat sesi tersimpan (dipanggil saat mulai dingin). */
    fun muat() {
        viewModelScope.launch {
            _status.value = SesiUiState.Memuat
            val hasil = sesi.muatSaya()
            val (adaCookie, profil) = withContext(Dispatchers.IO) { (authStore.header() != null) to profilStore.baca() }
            when (val k = SesiUseCase.putuskanMulai(hasil, adaCookie, profil)) {
                is KeputusanMulai.Masuk -> ubahStatus(
                    if (!k.luring && wajibGantiSandiTerakhir) {
                        SesiUiState.WajibGantiSandi(k.pengguna)
                    } else {
                        SesiUiState.Siap(k.pengguna, luring = k.luring)
                    },
                )
                is KeputusanMulai.KeLogin -> {
                    // 401 nyata: profil tersimpan tidak lagi mewakili sesi mana pun.
                    if (hasil is HasilSaya.TidakSah) hapusProfil()
                    k.pesan?.let { _pesanGalat.value = it }
                    ubahStatus(SesiUiState.TanpaSesi)
                }
            }
        }
    }

    /**
     * Konfirmasi sesi luring ke server. Sah → shell daring; 401 → layar masuk
     * (antrean dipertahankan untuk pengguna yang sama); tak terjangkau → tetap.
     */
    private suspend fun validasiUlang(): HasilSaya {
        val hasil = sesi.muatSaya()
        if (_status.value !is SesiUiState.Siap) return hasil
        when (hasil) {
            is HasilSaya.Sah -> ubahStatus(
                if (wajibGantiSandiTerakhir) {
                    SesiUiState.WajibGantiSandi(hasil.pengguna)
                } else {
                    SesiUiState.Siap(hasil.pengguna, luring = false)
                },
            )
            HasilSaya.TidakSah -> {
                _pesanGalat.value = PESAN_SESI_BERAKHIR
                sesiBerakhir()
            }
            is HasilSaya.TakTerjangkau -> Unit
        }
        return hasil
    }

    /** Sesi dicabut server (bukan keluar): ke layar masuk, sinkron dijeda, antrean disimpan. */
    private fun sesiBerakhir() {
        mesin.jeda()
        viewModelScope.launch {
            withContext(NonCancellable) { prefs.setUidSesi(null) }
            hapusProfil()
        }
        _status.value = SesiUiState.TanpaSesi
    }

    private suspend fun hapusProfil() {
        withContext(Dispatchers.IO) { profilStore.hapus() }
    }

    fun masuk(identifier: String, sandi: String) {
        if (_sibuk.value) return
        viewModelScope.launch {
            _sibuk.value = true
            _pesanGalat.value = null
            try {
                // C5-T3: cookie akun baru tersimpan DI DALAM authApi.login — sebelum
                // itu tidak boleh ada pekerja antrean lama yang hidup atau yang
                // menganggap sesi lama masih aktif.
                siapkanMasuk(lupakanSesi = { prefs.setUidSesi(null) }, hentikanPekerja = mesin::jedaDanTunggu)
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
                            val pengguna = (sesi.muatSaya() as? HasilSaya.Sah)?.pengguna
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
                        val pengguna = (sesi.muatSaya() as? HasilSaya.Sah)?.pengguna
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
        _sibuk.value = true
        sedangKeluar = true
        viewModelScope.launch {
            try {
                sesi.keluar()
            } finally {
                // Keluar eksplisit: hentikan sinkron, kosongkan Room + outbox
                // (tulisan tak boleh terkirim dengan sesi pengguna lain) + cache
                // gambar, hapus profil — SEMUA selesai sebelum layar masuk tampil.
                // uidTerakhir sengaja dipertahankan untuk praisi layar masuk
                // (dan supaya akun lain yang masuk berikutnya tetap memicu pembersihan
                // bila pembersihan di sini gagal).
                kunciTransisi.withLock {
                    withContext(NonCancellable) {
                        prosesKeluar(
                            lupakanSesi = { prefs.setUidSesi(null) },
                            bersihkan = ::bersihkanDataAkun,
                            hapusProfil = ::hapusProfil,
                            terbitkanTanpaSesi = {
                                _pesanGalat.value = null
                                terapkanStatus(SesiUiState.TanpaSesi)
                            },
                        )
                    }
                }
                _sibuk.value = false
                sedangKeluar = false
            }
        }
    }

    /**
     * Ubah status gerbang. Untuk Siap: pembersihan akun lama (bila uid
     * berganti) DITUNGGU dulu, baru status terbit (C3-T3). Gagal membersihkan
     * = tetap di layar masuk dengan pesan; data akun lama tidak pernah tampil
     * untuk akun baru.
     */
    private suspend fun ubahStatus(baru: SesiUiState) {
        // NonCancellable: pemanggil bisa batal tepat saat status terbit (mis.
        // collectLatest validasi ulang bereaksi pada status barunya sendiri);
        // pembersihan dan langkah sesudah terbit tidak boleh terpotong di tengah.
        kunciTransisi.withLock { withContext(NonCancellable) { terapkanStatus(baru) } }
    }

    private suspend fun terapkanStatus(baru: SesiUiState) {
        val siap = baru as? SesiUiState.Siap
        if (siap == null) {
            // C5-T3: tanpa shell aktif tidak ada antrean yang boleh terkirim
            // (TanpaSesi dari mulai dingin 401, WajibGantiSandi akun mana pun).
            mesin.jeda()
            prefs.setUidSesi(null)
            _status.value = baru
            return
        }
        val pengguna = siap.pengguna
        val terbit = transisiSiap(
            uidBaru = pengguna.id,
            uidLama = prefs.uidTerakhir.first(),
            bersihkan = ::bersihkanDataAkun,
            catatUid = {
                prefs.setUidTerakhir(it)
                // Setelah pembersihan, sebelum Siap terbit: layar pertama sudah
                // menyimpan/membaca potret di bawah uid ini.
                prefs.setUidSesi(it)
            },
            terbitkan = { _status.value = siap },
        )
        if (!terbit) {
            mesin.jeda()
            prefs.setUidSesi(null)
            _pesanGalat.value = PESAN_BERSIH_GAGAL
            _status.value = SesiUiState.TanpaSesi
            return
        }
        // Baris antrean pra-Room v6 (tanpa pemilik) milik pengguna yang sama.
        mesin.adopsiAntrean(pengguna.id)
        prefs.setPernahMasuk(true)
        // Hanya profil yang dikonfirmasi server yang disimpan untuk mulai dingin luring.
        if (!siap.luring) withContext(Dispatchers.IO) { profilStore.simpan(pengguna) }
        mesin.mulai()
    }

    /**
     * Data akun di perangkat: Room + outbox + berkas antrean (MesinSinkron) dan
     * cache gambar Coil (foto bukti bertanda tangan milik PT akun lama, C3-S5).
     */
    @OptIn(ExperimentalCoilApi::class)
    private suspend fun bersihkanDataAkun() {
        mesin.hentikanDanBersihkan()
        val pemuat = konteks.imageLoader
        pemuat.memoryCache?.clear()
        withContext(Dispatchers.IO) { pemuat.diskCache?.clear() }
    }

    private companion object {
        const val PESAN_SESI_BERAKHIR = "Sesi Anda telah berakhir. Silakan masuk kembali."
        const val PESAN_BERSIH_GAGAL =
            "Data akun sebelumnya belum bisa dibersihkan dari perangkat ini. Coba masuk lagi."
        const val JEDA_VALIDASI_MS = 60_000L
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
