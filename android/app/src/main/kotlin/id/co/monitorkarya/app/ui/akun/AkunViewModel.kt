// Meja akun — versi Admin PT terbatas (T6-C9 Fase 2). Padanan web:
// src/components/views/companies-view.tsx (panel "Akun" + pencarian),
// src/components/companies/account-sheet.tsx (identitas, status, aksi), dan
// src/components/companies/activation-handoff.tsx (serah terima tautan
// aktivasi sekali pakai). Batas wewenang persis src/lib/rbac.ts
// (ADMIN_PT_MANAGED_ROLES: hanya ADMIN_PT/KEPALA_DIVISI/PIC_PROYEK —
// Direktur Entitas dan akun grup tetap milik Super Admin).
//
// Rute yang dipakai:
//   GET   /api/companies              — daftar akun PT sendiri. Ini satu-satunya
//        rute daftar: GET /api/companies/users hanya mengembalikan keanggotaan
//        divisi SATU akun (T6-C2). Respons membawa me, scope, manageableRoles,
//        dan users per perusahaan — sama seperti yang dipakai web.
//   POST  /api/companies/users        — tambah akun (wizard BUG-03, FormAkun.kt);
//        sandi awal acak dibuat klien, dikirim, lalu diserahkan sekali.
//   PATCH /api/companies/users        — isActive (aktif/nonaktif), password
//        (setel ulang; server memaksa pemiliknya mengganti saat masuk
//        berikutnya, F1-C), dan "Ubah data akun" (nama/username/email/
//        jabatan/telepon/posisi + tautan divisi/proyek).
//   GET   /api/companies/users/activation?id= — boleh menerbitkan tautan?
//   POST  /api/companies/users/activation     — terbitkan ulang tautan
//        aktivasi (24 jam, sekali pakai; 20/pengelola dan 5/akun per 15 menit).
//
// Keamanan (C3-T1): setel ulang membuat sandi acak, mengirimnya lewat PATCH,
// lalu menampilkannya SEKALI di sheet (salin bertanda sensitif) supaya Admin PT
// bisa menyerahkannya langsung — pola serah terima feature/entitas. Nilai hanya
// hidup di MEMORI ViewModel ([Rahasia], toString disamarkan), tidak masuk
// SavedStateHandle/Bundle/log, dan dibuang saat sheet ditutup atau akun lain
// dibuka. Tautan aktivasi diperlakukan sama.
// LURING (A1-LURING.md §6): semua aksi meja akun (aktif/nonaktif, setel ulang
// sandi, terbitkan aktivasi) TIDAK diantre — menyangkut keamanan akses dan
// tautan/sandi sekali tampil harus diterima seketika. Luring = galat + coba lagi.
package id.co.monitorkarya.app.ui.akun

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.app.BuildConfig
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.AkunApi
import id.co.monitorkarya.core.network.dto.AkunUbahRequest
import id.co.monitorkarya.core.network.dto.TerbitkanAktivasiRequest
import java.security.SecureRandom
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.GET

// ------------------------------------------------------------------
// Kontrak jaringan daftar akun (lokal zona ini)
// ------------------------------------------------------------------

/**
 * GET /api/companies — daftar akun meja ini. Kontrak daftar belum ada di
 * core/network (AkunApi T6-C2 hanya keanggotaan satu akun), jadi antarmuka
 * ini dideklarasikan lokal dan dibangun dari Retrofit tunggal AppModule —
 * pola yang sama dengan T5-B5 (LaporanViewModel). Pindahkan ke core/network
 * bila kontrak daftar akun resminya hadir (lihat docs/fase2/T6-C9-LAPORAN.md).
 */
interface MejaAkunListApi {

    @GET("api/companies")
    suspend fun meja(): Response<JsonObject>
}

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Satu baris akun (subset UserRow web, src/lib/accounts.ts). */
data class AkunBaris(
    val id: String,
    val nama: String,
    val username: String? = null,
    val email: String? = null,
    val peran: String,
    val jabatan: String? = null,
    val aktif: Boolean = true,
    /** false = belum pernah diatur -> menunggu aktivasi / wajib ganti sandi. */
    val punyaSandi: Boolean = true,
    val pernahMasukIso: String? = null,
    /** Telepon (phone) — dipakai formulir "Ubah data akun". */
    val telepon: String? = null,
    /** Divisi yang dipimpin (kepala divisi) / proyek yang dipegang (PIC). */
    val namaDivisiDipimpin: String? = null,
    val namaProyekDipegang: String? = null,
)

/** Divisi aktif PT (GET /api/companies companies[].divisions). */
data class DivisiPt(val id: String, val nama: String, val namaKepala: String? = null)

/** Proyek DIUSULKAN/AKTIF PT (companies[].projects). */
data class ProyekPt(val id: String, val nama: String, val namaPic: String? = null)

/** Meja akun PT sendiri beserta batas wewenang pemegangnya. */
data class MejaAkun(
    val namaPt: String,
    val idSaya: String,
    /** manageableRoles dari server; cadangannya ADMIN_PT_MANAGED_ROLES rbac.ts. */
    val peranKelola: Set<String>,
    val akun: List<AkunBaris>,
    /** Id PT meja ini — dikirim sebagai entityId saat menambah akun. */
    val idPt: String? = null,
    /** "PT" / "HOLDING". */
    val tipePt: String? = null,
    val divisi: List<DivisiPt> = emptyList(),
    val proyek: List<ProyekPt> = emptyList(),
) {

    /** Akun sendiri: tidak bisa dinonaktifkan dari sini (server juga menolak 409). */
    fun adalahSaya(akun: AkunBaris): Boolean = akun.id == idSaya

    /**
     * Guard meja terbatas: hanya posisi yang boleh dikelola admin PT yang
     * boleh disentuh; peran di luar itu (mis. Direktur Entitas) tampil baca-saja.
     */
    fun bisaKelola(akun: AkunBaris): Boolean = !adalahSaya(akun) && peranKelola.contains(akun.peran)
}

/** Chip saringan peran — hanya posisi yang boleh dikelola Admin PT. */
enum class SaringAkun(val peran: String?, val labelChip: String) {
    SEMUA(null, "Semua"),
    ADMIN_PT("ADMIN_PT", "Admin PT"),
    KEPALA_DIVISI("KEPALA_DIVISI", "Kepala divisi"),
    PIC_PROYEK("PIC_PROYEK", "PIC proyek"),
}

/** Jumlah akun per chip (dihitung dari meja penuh, bukan hasil saringan). */
data class JumlahAkun(
    val semua: Int = 0,
    val adminPt: Int = 0,
    val kepalaDivisi: Int = 0,
    val picProyek: Int = 0,
)

/**
 * Nilai rahasia (kata sandi) di memori. toString disamarkan agar tidak bocor
 * ke log/laporan crash lewat toString data class pembungkusnya.
 */
class Rahasia(val nilai: String) {
    override fun toString(): String = "Rahasia(***)"
    override fun equals(other: Any?): Boolean = other is Rahasia && other.nilai == nilai
    override fun hashCode(): Int = nilai.hashCode()
}

/** Sandi hasil setel ulang untuk diserahkan; [sandi] = yang BENAR-BENAR terkirim. */
data class SandiBaru(val idAkun: String, val username: String?, val sandi: Rahasia)

/** Tautan aktivasi sekali pakai hasil POST activation; hanya hidup di UI. */
data class TautanAktivasi(
    val username: String,
    val url: String,
    val kedaluwarsaIso: String,
)

/** Aksi yang sedang berjalan — menonaktifkan tombol di sheet. */
enum class AksiMeja { NONAKTIFKAN, AKTIFKAN, SETEL_ULANG_SANDI, TERBITKAN_AKTIVASI }

data class AksiBerjalan(val aksi: AksiMeja, val idAkun: String)

/** Snackbar satu-kali (id naik setiap pesan supaya LaunchedEffect terpicu). */
data class NotifAkun(val id: Long, val pesan: String)

/** Status UI layar: Memuat -> Siap(meja) atau Galat(pesan). */
sealed interface AkunUiState {
    data object Memuat : AkunUiState
    data class Siap(val meja: MejaAkun) : AkunUiState
    data class Galat(val pesan: String) : AkunUiState
}

/** Isi sheet satu akun, dikumpulkan ViewModel supaya layar tinggal menggambar. */
data class SheetAkun(
    val akun: AkunBaris,
    val bisaKelola: Boolean,
    val adalahSaya: Boolean,
    val namaPt: String,
    /** GET activation?id= — true = boleh menerbitkan; null = belum dicek. */
    val aktivasiTersedia: Boolean? = null,
    val tautan: TautanAktivasi? = null,
    /** Sandi hasil setel ulang — tampil sekali sampai sheet ditutup (C3-T1). */
    val sandiBaru: SandiBaru? = null,
    val galat: String? = null,
    val aksi: AksiBerjalan? = null,
)

/** Label peran (ROLE_LABELS src/lib/constants.ts). */
internal fun labelPeran(peran: String): String = when (peran) {
    "ADMIN_PT" -> "Admin PT"
    "KEPALA_DIVISI" -> "Kepala divisi"
    "PIC_PROYEK" -> "Manager / PIC proyek"
    "DIREKTUR_ENTITAS" -> "Direktur entitas"
    "DIREKTUR_SDM_GA" -> "Direksi holding (SDM & GA)"
    "MANAJEMEN" -> "Manajemen"
    "TI" -> "Tim TI"
    "SUPERADMIN" -> "Super Admin"
    "AUDITOR" -> "Auditor"
    else -> peran
}

/**
 * Nama posisi pada pesan "di luar jangkauan" (roleOutOfReachMessage
 * src/lib/account-desk.ts): Direktur Entitas disebut "Direktur Perusahaan".
 */
internal fun labelPosisiLuarJangkauan(peran: String): String =
    if (peran == "DIREKTUR_ENTITAS") "Direktur Perusahaan" else labelPeran(peran)

/** Peran yang boleh dikelola meja terbatas (ADMIN_PT_MANAGED_ROLES rbac.ts). */
private val PERAN_KELOLA_CADANGAN = setOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK")

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class AkunViewModel @Inject constructor(
    retrofit: Retrofit,
) : ViewModel() {

    // AkunApi T6-C2 dari Retrofit tunggal (AppModule belum menyediakannya;
    // dibuat di sini supaya tidak menambah binding Hilt yang bisa bertabrakan
    // dengan layar meja akun lain — lihat laporan).
    private val api: AkunApi = retrofit.create(AkunApi::class.java)
    private val listApi: MejaAkunListApi = retrofit.create(MejaAkunListApi::class.java)

    private val _state = MutableStateFlow<AkunUiState>(AkunUiState.Memuat)

    /** Status layar daftar akun. */
    val state: StateFlow<AkunUiState> = _state.asStateFlow()

    private val _cari = MutableStateFlow("")

    /** Isian kolom pencarian (nama, username, email, jabatan, peran). */
    val cari: StateFlow<String> = _cari.asStateFlow()

    private val _saring = MutableStateFlow(SaringAkun.SEMUA)

    /** Chip saringan peran yang aktif. */
    val saring: StateFlow<SaringAkun> = _saring.asStateFlow()

    /** Baris yang tampil setelah saringan peran + pencarian. */
    val baris: StateFlow<List<AkunBaris>> = combine(state, cari, saring) { s, c, f ->
        val meja = (s as? AkunUiState.Siap)?.meja
        if (meja == null) {
            emptyList()
        } else {
            val jarum = c.trim().lowercase()
            meja.akun
                .filter { f.peran == null || it.peran == f.peran }
                .filter { jarum.isEmpty() || cocokPencarian(it, jarum) }
                .sortedBy { it.nama.lowercase() }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Jumlah per chip dari meja penuh (angka selalu tampil, termasuk 0). */
    val jumlah: StateFlow<JumlahAkun> = state.map { s ->
        val akun = (s as? AkunUiState.Siap)?.meja?.akun.orEmpty()
        JumlahAkun(
            semua = akun.size,
            adminPt = akun.count { it.peran == "ADMIN_PT" },
            kepalaDivisi = akun.count { it.peran == "KEPALA_DIVISI" },
            picProyek = akun.count { it.peran == "PIC_PROYEK" },
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), JumlahAkun())

    private val _terpilih = MutableStateFlow<String?>(null)

    private val _ekstra = MutableStateFlow(SheetEkstra())

    /** Isi sheet akun yang terbuka; null = daftar. */
    val sheet: StateFlow<SheetAkun?> = combine(_terpilih, state, _ekstra) { id, s, e ->
        val meja = (s as? AkunUiState.Siap)?.meja
        val akun = meja?.akun?.firstOrNull { it.id == id }
        if (id == null || meja == null || akun == null) {
            null
        } else {
            SheetAkun(
                akun = akun,
                bisaKelola = meja.bisaKelola(akun),
                adalahSaya = meja.adalahSaya(akun),
                namaPt = meja.namaPt,
                aktivasiTersedia = e.aktivasiTersedia,
                tautan = e.tautan,
                sandiBaru = e.sandiBaru?.takeIf { it.idAkun == akun.id },
                galat = e.galat,
                aksi = e.aksi,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _notifikasi = MutableStateFlow<NotifAkun?>(null)

    /** Snackbar satu-kali hasil aksi (aktifkan/nonaktifkan/setel ulang sandi). */
    val notifikasi: StateFlow<NotifAkun?> = _notifikasi.asStateFlow()

    private val _menyegarkan = MutableStateFlow(false)

    /** Tarik-untuk-muat-ulang sedang berjalan (daftar tetap tampil). */
    val menyegarkan: StateFlow<Boolean> = _menyegarkan.asStateFlow()

    /**
     * Wizard tambah/ubah akun (BUG-03). State Compose di memori ViewModel —
     * isian langsung sinkron dengan medan teks, bertahan saat rotasi, dan
     * sandi awal tidak pernah masuk Bundle/SavedStateHandle/log. null = tertutup.
     */
    var wizard by mutableStateOf<WizardAkunUi?>(null)
        private set

    /** Pemuatan daftar yang sedang berjalan (cegah muat ganda saat layar tampil). */
    private var jobMuat: Job? = null

    /** Permintaan buat/ubah akun yang sedang berjalan (wizard baru ditahan sampai selesai). */
    private var jobKirim: Job? = null

    init {
        muat()
    }

    /** Menarik meja akun; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        jobMuat = viewModelScope.launch {
            _state.value = AkunUiState.Memuat
            muatInternal()
        }
    }

    fun ulang() = muat()

    /**
     * BUG-12: dipanggil setiap kali Meja akun tampil lagi (ViewModel terikat
     * entri NavHost tab, jadi init tidak terulang). Bila daftar sudah ada,
     * muat ulang diam-diam tanpa kerangka; galat muat ulang diam tidak
     * menghapus daftar yang sudah tampil.
     */
    fun saatTampil() {
        if (jobMuat?.isActive == true) return
        if (_state.value is AkunUiState.Siap) {
            jobMuat = viewModelScope.launch { segarkanDiam() }
        } else {
            muat()
        }
    }

    /** Tarik-untuk-muat-ulang: daftar tetap tampil; galat lewat snackbar. */
    fun segarkan() {
        if (_menyegarkan.value) return
        if (_state.value !is AkunUiState.Siap) {
            muat()
            return
        }
        _menyegarkan.value = true
        jobMuat = viewModelScope.launch {
            try {
                segarkanDiam()?.let { galat -> _notifikasi.value = NotifAkun(System.nanoTime(), galat) }
            } finally {
                _menyegarkan.value = false
            }
        }
    }

    fun setCari(teks: String) {
        _cari.value = teks
    }

    fun setSaring(saring: SaringAkun) {
        _saring.value = saring
    }

    /** Membuka/menutup sheet satu akun; id null menutup. */
    fun pilih(id: String?) {
        _terpilih.value = id
        _ekstra.value = SheetEkstra()
        if (id != null) {
            val meja = (_state.value as? AkunUiState.Siap)?.meja ?: return
            val akun = meja.akun.firstOrNull { it.id == id } ?: return
            // Kelayakan aktivasi hanya relevan untuk akun yang boleh dikelola.
            if (meja.bisaKelola(akun)) cekAktivasi(id)
        }
    }

    /** Snackbar sudah tampil — bersihkan agar tidak berulang. */
    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /**
     * Aktifkan/nonaktifkan akun (PATCH isActive). Konfirmasi dialog untuk
     * menonaktifkan ditangani layar sebelum memanggil ini; server tetap
     * menjaga 409 (akun sendiri, Super Admin terakhir).
     */
    fun setAktif(akun: AkunBaris, aktif: Boolean) {
        if (_ekstra.value.aksi != null) return
        viewModelScope.launch {
            _ekstra.update {
                it.copy(
                    aksi = AksiBerjalan(if (aktif) AksiMeja.AKTIFKAN else AksiMeja.NONAKTIFKAN, akun.id),
                    galat = null,
                )
            }
            try {
                val res = api.ubah(AkunUbahRequest(id = akun.id, isActive = aktif))
                if (res.isSuccessful) {
                    muatInternal()
                    _notifikasi.value = NotifAkun(
                        id = System.nanoTime(),
                        pesan = "Akun ${akun.nama} ${if (aktif) "diaktifkan" else "dinonaktifkan"}.",
                    )
                    segarkanAktivasi(akun)
                } else {
                    _ekstra.update { it.copy(galat = ApiError.dari(HttpException(res)).pesanTampil()) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ekstra.update { it.copy(galat = ApiError.dari(e).pesanTampil()) }
            } finally {
                _ekstra.update { it.copy(aksi = null) }
            }
        }
    }

    /**
     * Setel ulang kata sandi (PATCH password) — DESTRUKTIF: sandi lama berhenti
     * berlaku, jadi layar WAJIB meminta konfirmasi sebelum memanggil ini.
     * Sandi acak dibuat lokal, dikirim, lalu ditampilkan sekali di sheet
     * ([SheetAkun.sandiBaru]) untuk diserahkan; tanpa itu pemegang akun yang
     * sudah pernah masuk terkunci (server tidak menerbitkan aktivasi untuknya).
     */
    fun setelUlangSandi(akun: AkunBaris) {
        // Pagar klik ganda: ditandai sinkron sebelum launch.
        if (_ekstra.value.aksi != null) return
        _ekstra.update {
            it.copy(aksi = AksiBerjalan(AksiMeja.SETEL_ULANG_SANDI, akun.id), galat = null, sandiBaru = null)
        }
        viewModelScope.launch {
            try {
                val sandi = Rahasia(sandiAcak())
                val res = api.ubah(AkunUbahRequest(id = akun.id, password = sandi.nilai))
                if (res.isSuccessful) {
                    // Sheet bisa sudah ditutup/berpindah akun selama permintaan
                    // berjalan: sandi hanya disimpan untuk sheet akun yang sama.
                    if (_terpilih.value == akun.id) {
                        _ekstra.update { it.copy(sandiBaru = SandiBaru(akun.id, akun.username, sandi)) }
                    }
                    muatInternal()
                    segarkanAktivasi(akun)
                    _notifikasi.value = NotifAkun(
                        id = System.nanoTime(),
                        pesan = "Kata sandi ${akun.nama} diatur ulang. Salin lalu sampaikan langsung ke pemegang akun.",
                    )
                } else {
                    _ekstra.update { it.copy(galat = ApiError.dari(HttpException(res)).pesanTampil()) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ekstra.update { it.copy(galat = ApiError.dari(e).pesanTampil()) }
            } finally {
                _ekstra.update { it.copy(aksi = null) }
            }
        }
    }

    /**
     * Terbitkan ulang tautan aktivasi (POST activation). Tautan lama berhenti
     * berlaku; yang baru tampil di sheet ("Kirim tautan ke pengguna") untuk
     * disalin — tidak dicatat log apa pun.
     */
    fun terbitkanAktivasi(akun: AkunBaris) {
        if (_ekstra.value.aksi != null) return
        viewModelScope.launch {
            _ekstra.update { it.copy(aksi = AksiBerjalan(AksiMeja.TERBITKAN_AKTIVASI, akun.id), galat = null) }
            try {
                val res = api.terbitkanAktivasi(TerbitkanAktivasiRequest(userId = akun.id))
                val aktivasi = res.body()?.activation
                if (res.isSuccessful && aktivasi != null) {
                    _ekstra.update {
                        it.copy(
                            tautan = TautanAktivasi(
                                username = aktivasi.username,
                                url = urlAktivasi(aktivasi.path),
                                kedaluwarsaIso = aktivasi.expiresAt,
                            ),
                        )
                    }
                } else {
                    _ekstra.update { it.copy(galat = ApiError.dari(HttpException(res)).pesanTampil()) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ekstra.update { it.copy(galat = ApiError.dari(e).pesanTampil()) }
            } finally {
                _ekstra.update { it.copy(aksi = null) }
            }
        }
    }

    // ------------------------------------------------------------------
    // Wizard tambah akun / ubah data akun (BUG-03)
    // ------------------------------------------------------------------

    private fun mejaSiap(): MejaAkun? = (_state.value as? AkunUiState.Siap)?.meja

    /** Buka wizard "Tambah akun"; sandi awal acak dibuat SEKALI di sini. */
    fun bukaTambahAkun() {
        val meja = mejaSiap() ?: return
        if (wizard != null || jobKirim?.isActive == true) return
        pilih(null)
        wizard = WizardAkunUi(
            form = FormAkun(peran = posisiBoleh(meja.peranKelola).firstOrNull()?.peran.orEmpty()),
            sandi = Rahasia(sandiAcak()),
        )
    }

    /** Buka wizard "Ubah data akun" untuk akun yang boleh dikelola. */
    fun bukaUbahAkun(akun: AkunBaris) {
        val meja = mejaSiap() ?: return
        if (wizard != null || jobKirim?.isActive == true || !meja.bisaKelola(akun)) return
        pilih(null)
        wizard = WizardAkunUi(form = formDariAkun(akun))
    }

    /** Ubah isian; galat server lama dibuang karena isian sudah berubah. */
    fun ubahFormAkun(ubah: (FormAkun) -> FormAkun) {
        val w = wizard ?: return
        if (w.sibuk || w.hasil != null) return
        val baru = ubah(w.form)
        if (baru != w.form) wizard = w.copy(form = baru, galat = null)
    }

    fun lanjutWizard() {
        val w = wizard ?: return
        val meja = mejaSiap() ?: return
        if (w.sibuk || w.hasil != null) return
        wizard = w.copy(form = lanjut(w.form, meja.peranKelola))
    }

    fun kembaliWizard() {
        val w = wizard ?: return
        if (w.sibuk || w.hasil != null) return
        wizard = w.copy(form = kembali(w.form))
    }

    /**
     * Tutup wizard. Bila permintaan buat akun masih berjalan, hasilnya tetap
     * ditampilkan saat selesai (sheet dibuka lagi) supaya sandi awal tidak hilang.
     */
    fun tutupWizard() {
        wizard = null
    }

    /**
     * Kirim wizard (POST tambah / PATCH ubah). Hanya daring: [luring] = true
     * langsung ditolak dengan pesan — tidak ada antrean (A1-LURING.md §6).
     */
    fun kirimWizard(luring: Boolean) {
        val w = wizard ?: return
        val meja = mejaSiap() ?: return
        if (w.sibuk || w.hasil != null) return
        val salah = langkahSalahPertama(w.form, meja.peranKelola)
        if (salah != null) {
            wizard = w.copy(form = w.form.copy(langkah = salah, dicoba = w.form.dicoba + salah))
            return
        }
        if (luring) {
            wizard = w.copy(galat = PESAN_AKUN_LURING)
            return
        }
        when (w.form.mode) {
            ModeFormAkun.BARU -> kirimBaru(w, meja)
            ModeFormAkun.UBAH -> kirimUbah(w, meja)
        }
    }

    private fun kirimBaru(w: WizardAkunUi, meja: MejaAkun) {
        val sandi = w.sandi ?: Rahasia(sandiAcak())
        val req = keRequestBaru(w.form, sandi.nilai, meja.idPt)
        wizard = w.copy(sibuk = true, galat = null, sandi = sandi)
        jobKirim = viewModelScope.launch {
            try {
                val res = api.tambah(req)
                val akun = res.body()?.account
                if (res.isSuccessful) {
                    val hasil = HasilAkunBaru(
                        idAkun = akun?.id.orEmpty(),
                        nama = akun?.name ?: req.name,
                        username = akun?.username ?: req.username.orEmpty(),
                        peran = akun?.role ?: req.role,
                        sandi = sandi,
                    )
                    // Ditampilkan walau sheet sempat ditutup selama proses.
                    _terpilih.value = null
                    wizard = WizardAkunUi(form = w.form, sandi = sandi, hasil = hasil)
                    muatInternal()
                } else {
                    gagalKirim(ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                gagalKirim(pesanGalatKirimAkun(e))
            }
        }
    }

    private fun kirimUbah(w: WizardAkunUi, meja: MejaAkun) {
        val asal = meja.akun.firstOrNull { it.id == w.form.idAkun }
        if (asal == null) {
            wizard = w.copy(galat = "Akun tidak ditemukan. Muat ulang daftar akun.")
            return
        }
        val req = keRequestUbah(w.form, asal)
        if (!adaPerubahan(req)) {
            wizard = w.copy(galat = "Belum ada perubahan untuk disimpan.")
            return
        }
        wizard = w.copy(sibuk = true, galat = null)
        jobKirim = viewModelScope.launch {
            try {
                val res = api.ubah(req)
                if (res.isSuccessful) {
                    if (wizard?.form?.idAkun == asal.id) wizard = null
                    muatInternal()
                    _notifikasi.value = NotifAkun(
                        id = System.nanoTime(),
                        pesan = "Data akun ${w.form.nama.trim().ifEmpty { asal.nama }} tersimpan.",
                    )
                } else {
                    gagalKirim(ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                gagalKirim(pesanGalatKirimAkun(e))
            }
        }
    }

    /** Galat kirim: tampil di dekat tombol aksi, wizard pindah ke langkah yang perlu dibetulkan. */
    private fun gagalKirim(pesan: String) {
        val w = wizard
        if (w == null) {
            // Sheet sudah ditutup selama proses: galat tetap disampaikan.
            _notifikasi.value = NotifAkun(System.nanoTime(), pesan)
            return
        }
        val ke = langkahUntukGalatServer(pesan) ?: w.form.langkah
        wizard = w.copy(sibuk = false, galat = pesan, form = w.form.copy(langkah = ke))
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    /** Keadaan sheet di luar akun (digabung supaya combine tetap 3 arus). */
    private data class SheetEkstra(
        val aktivasiTersedia: Boolean? = null,
        val tautan: TautanAktivasi? = null,
        val sandiBaru: SandiBaru? = null,
        val galat: String? = null,
        val aksi: AksiBerjalan? = null,
    )

    /** Menarik meja tanpa mengubah status ke Memuat (dipakai usai aksi). */
    private suspend fun muatInternal() {
        _state.value = try {
            val res = listApi.meja()
            if (res.isSuccessful) {
                parseMeja(res.body() ?: JsonObject(emptyMap()))
            } else {
                AkunUiState.Galat(ApiError.dari(HttpException(res)).pesanTampil())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            AkunUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    /** Muat ulang tanpa mengganti daftar bila gagal; mengembalikan pesan galat atau null. */
    private suspend fun segarkanDiam(): String? = try {
        val res = listApi.meja()
        if (res.isSuccessful) {
            val hasil = parseMeja(res.body() ?: JsonObject(emptyMap()))
            if (hasil is AkunUiState.Siap) {
                _state.value = hasil
                null
            } else {
                (hasil as? AkunUiState.Galat)?.pesan
            }
        } else {
            ApiError.dari(HttpException(res)).pesanTampil()
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        ApiError.dari(e).pesanTampil()
    }

    /** Cek kelayakan aktivasi untuk sheet yang masih terbuka pada akun ini. */
    private suspend fun segarkanAktivasi(akun: AkunBaris) {
        if (_terpilih.value == akun.id) {
            _ekstra.update { it.copy(aktivasiTersedia = cekAktivasiSuspen(akun.id)) }
        }
    }

    /** GET activation?id= di latar; 200 = boleh menerbitkan, galat apa pun = tidak. */
    private fun cekAktivasi(id: String) {
        viewModelScope.launch {
            _ekstra.update { it.copy(aktivasiTersedia = null) }
            val bisa = cekAktivasiSuspen(id)
            if (_terpilih.value == id) _ekstra.update { it.copy(aktivasiTersedia = bisa) }
        }
    }

    private suspend fun cekAktivasiSuspen(id: String): Boolean = try {
        api.ketersediaanAktivasi(id).isSuccessful
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    /** URL penuh tautan: origin = BASE_URL (berakhiran "/") + path dari server. */
    private fun urlAktivasi(path: String): String = BuildConfig.BASE_URL.trimEnd('/') + path

}

/** Alfabet sandi acak tanpa huruf/angka mudah tertukar (generatePassword web). */
internal const val ALFABET_SANDI = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

internal const val PANJANG_SANDI_ACAK = 14

/**
 * Sandi acak 14 karakter dari [ALFABET_SANDI] — sama dengan generatePassword
 * web (src/lib/password-policy.ts, minimal 8).
 */
internal fun sandiAcak(acak: SecureRandom = SecureRandom()): String =
    buildString { repeat(PANJANG_SANDI_ACAK) { append(ALFABET_SANDI[acak.nextInt(ALFABET_SANDI.length)]) } }

// ------------------------------------------------------------------
// Pencarian
// ------------------------------------------------------------------

private fun cocokPencarian(akun: AkunBaris, jarum: String): Boolean =
    listOf(akun.nama, akun.username, akun.email, akun.jabatan, labelPeran(akun.peran))
        .any { it != null && it.lowercase().contains(jarum) }

// ------------------------------------------------------------------
// Parsing GET /api/companies (defensif — field opsional, bentuk lama tetap jalan)
// ------------------------------------------------------------------

internal fun parseMeja(root: JsonObject): AkunUiState {
    // companies wajib ada di respons sah; tanpa itu anggap badan rusak.
    val perusahaan = root.larik("companies")
    if (root["companies"] == null) return AkunUiState.Galat("Meja akun belum termuat. Coba lagi.")
    val ptPertama = perusahaan.firstNotNullOfOrNull { it.objek() }
    val namaPt = perusahaan
        .firstNotNullOfOrNull { it.objek()?.teks("name") }
        ?: "perusahaan Anda"
    val akun = perusahaan.flatMap { perusahaanRow ->
        (perusahaanRow.objek()?.larik("users") ?: emptyList()).mapNotNull { baris ->
            baris.objek()?.let(::parseAkun)
        }
    }
    // holdingUsers (akun tanpa perusahaan) milik meja penuh Super Admin;
    // untuk meja terbatas tidak ditampilkan — padanan scope=ENTITY web.
    return AkunUiState.Siap(
        MejaAkun(
            namaPt = namaPt,
            idSaya = root.teks("me").orEmpty(),
            peranKelola = (root["manageableRoles"] as? JsonArray)
                ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                ?.toSet()
                ?.takeIf { it.isNotEmpty() }
                ?: PERAN_KELOLA_CADANGAN,
            akun = akun,
            idPt = ptPertama?.teks("id"),
            tipePt = ptPertama?.teks("type"),
            divisi = ptPertama?.larik("divisions").orEmpty().mapNotNull { el ->
                val d = el.objek() ?: return@mapNotNull null
                val id = d.teks("id") ?: return@mapNotNull null
                DivisiPt(id = id, nama = d.teks("name") ?: id, namaKepala = d.teks("headName"))
            },
            proyek = ptPertama?.larik("projects").orEmpty().mapNotNull { el ->
                val p = el.objek() ?: return@mapNotNull null
                val id = p.teks("id") ?: return@mapNotNull null
                ProyekPt(id = id, nama = p.teks("name") ?: id, namaPic = p.teks("picName"))
            },
        ),
    )
}

private fun parseAkun(u: JsonObject): AkunBaris = AkunBaris(
    id = u.teks("id").orEmpty(),
    nama = u.teks("name").orEmpty(),
    username = u.teks("username"),
    email = u.teks("email"),
    peran = u.teks("role").orEmpty(),
    jabatan = u.teks("title"),
    aktif = u.flag("isActive") ?: true,
    punyaSandi = u.flag("hasPassword") ?: true,
    pernahMasukIso = u.teks("lastLoginAt"),
    telepon = u.teks("phone"),
    namaDivisiDipimpin = u.teks("divisionName"),
    namaProyekDipegang = u.teks("projectName"),
)

private fun JsonObject.larik(kunci: String): List<JsonElement> = (this[kunci] as? JsonArray) ?: emptyList()

private fun JsonElement.objek(): JsonObject? = this as? JsonObject

private fun JsonObject.teks(kunci: String): String? =
    (this[kunci] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() && it != "null" }

private fun JsonObject.flag(kunci: String): Boolean? = (this[kunci] as? JsonPrimitive)?.booleanOrNull
