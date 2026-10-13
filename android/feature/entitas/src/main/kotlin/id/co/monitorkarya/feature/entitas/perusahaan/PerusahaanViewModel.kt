// ViewModel tab Perusahaan & akun. Padanan web: companies-view.tsx (meja),
// company-sheet.tsx (rincian + pengaturan perusahaan), account-sheet.tsx
// (formulir akun), activation-handoff.tsx (tautan aktivasi), dan
// company-wizard.tsx (tambah perusahaan).
//
// Keamanan:
// - Kata sandi hanya hidup di MEMORI ViewModel selama sheet terbuka (agar
//   stabil saat rotasi/ganti tema), dibungkus [Rahasia] (toString disamarkan),
//   tidak pernah masuk SavedStateHandle/bundel tersimpan, dan dibuang saat
//   sheet/wizard ditutup. Tidak ada panggilan Log di berkas ini.
// - Tautan aktivasi (token di fragmen #token=) hanya disimpan di state sheet
//   akun yang terbuka dan dibuang saat sheet ditutup.
// - Batas wewenang dibaca dari jawaban server (scope, canManageCompanies,
//   manageableRoles); server tetap menjaga 403/409/422.
package id.co.monitorkarya.feature.entitas.perusahaan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.AkunBarisDto
import id.co.monitorkarya.feature.entitas.data.EntitasBaruDto
import id.co.monitorkarya.feature.entitas.data.Jawab
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PerusahaanApi
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import id.co.monitorkarya.feature.entitas.data.TambahAkunRequest
import id.co.monitorkarya.feature.entitas.data.TambahPerusahaanRequest
import id.co.monitorkarya.feature.entitas.data.TerbitkanAktivasiBody
import id.co.monitorkarya.feature.entitas.data.UbahAkunRequest
import id.co.monitorkarya.feature.entitas.data.UbahPerusahaanRequest
import id.co.monitorkarya.feature.entitas.data.panggil
import id.co.monitorkarya.feature.entitas.di.AsalServer
import id.co.monitorkarya.feature.entitas.ui.NotifUi
import id.co.monitorkarya.feature.entitas.ui.TeksUi
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Status meja. [ditolak] = 403 (peran tidak mengelola akun). */
sealed interface MejaUi {
    data object Memuat : MejaUi
    data class Galat(val pesan: String, val ditolak: Boolean = false) : MejaUi
    data class Siap(val meja: MejaPerusahaanResponse) : MejaUi
}

enum class Tampilan { PERUSAHAAN, AKUN, STRUKTUR }

/** Sheet perusahaan yang terbuka. */
data class SheetPerusahaanUi(
    val id: String,
    val tab: TabPerusahaan = TabPerusahaan.RINGKASAN,
    val sibuk: AksiPerusahaan? = null,
    val galat: String? = null,
)

enum class AksiPerusahaan { SIMPAN, STATUS, HAPUS }

/** Sheet akun: [idAkun] null = akun baru di [idPerusahaan] (null = tingkat grup). */
data class SheetAkunUi(
    val idAkun: String?,
    val idPerusahaan: String?,
    /** Keanggotaan divisi termuat; null = belum/gagal dimuat (kolom dikunci). */
    val anggotaDivisiAwal: String? = null,
    val anggotaDimuat: Boolean = false,
    /** GET activation: true = boleh menerbitkan; null = belum dicek. */
    val aktivasiTersedia: Boolean? = null,
    val tautan: TautanAktivasi? = null,
    val sibuk: AksiAkun? = null,
    val galat: String? = null,
    /** Akun baru berhasil dibuat; layar menampilkan serah terima kata sandi. */
    val dibuat: AkunDibuat? = null,
)

enum class AksiAkun { SIMPAN, STATUS, HAPUS, AKTIVASI }

/** Akun baru tercipta; [sandiAwal] = kata sandi yang BENAR-BENAR terkirim ke server. */
data class AkunDibuat(val nama: String, val username: String, val sandiAwal: Rahasia = Rahasia(""))

/**
 * Nilai rahasia (kata sandi) di memori. toString disamarkan agar tidak bocor
 * ke log/laporan crash lewat toString data class pembungkusnya.
 */
class Rahasia(val nilai: String) {
    override fun toString(): String = "Rahasia(***)"
    override fun equals(other: Any?): Boolean = other is Rahasia && other.nilai == nilai
    override fun hashCode(): Int = nilai.hashCode()
}

/** Satu akun pertama hasil wizard untuk serah terima (sandi = yang terkirim). */
data class SerahTerimaAkun(val nama: String, val peran: String, val username: String, val sandi: Rahasia)

/** Tautan aktivasi sekali pakai; hanya hidup di UI, tidak dicatat log. */
data class TautanAktivasi(val username: String, val url: String, val kedaluwarsaIso: String)

/** Isian formulir akun dari layar (kata sandi ikut sebagai argumen, tidak disimpan). */
data class FormAkun(
    /** id perusahaan; null = tingkat grup. */
    val idPerusahaan: String?,
    val peran: String,
    val nama: String,
    val username: String,
    val email: String,
    val jabatan: String,
    val telepon: String,
    /** "" = tidak diubah/belum ditentukan, [PILIH_BARU] = buat baru, selain itu id. */
    val divisiDipimpin: String = "",
    val divisiBaru: String = "",
    val proyekDipegang: String = "",
    val proyekBaru: String = "",
    /** Keanggotaan divisi pilihan; "" = tanpa divisi. */
    val anggotaDivisi: String = "",
)

const val PILIH_BARU = "__new__"

/** Wizard tambah perusahaan. */
data class WizardUi(
    val sibuk: Boolean = false,
    val galat: String? = null,
    val hasil: EntitasBaruDto? = null,
    /** Akun pertama yang benar-benar dikirim (diisi saat sukses; dibuang saat tutup). */
    val serahTerima: List<SerahTerimaAkun> = emptyList(),
)

/** Tindakan yang bisa diurungkan (PATCH isActive kebalikannya). */
sealed interface Urung {
    data class Akun(val id: String, val nama: String, val aktifSemula: Boolean) : Urung
    data class Perusahaan(val id: String, val nama: String, val aktifSemula: Boolean) : Urung
}

@HiltViewModel
class PerusahaanViewModel @Inject constructor(
    private val api: PerusahaanApi,
    private val asal: AsalServer,
) : ViewModel() {

    private val _meja = MutableStateFlow<MejaUi>(MejaUi.Memuat)
    val meja: StateFlow<MejaUi> = _meja.asStateFlow()

    private val _tampilan = MutableStateFlow(Tampilan.PERUSAHAAN)
    val tampilan: StateFlow<Tampilan> = _tampilan.asStateFlow()

    private val _cari = MutableStateFlow("")
    val cari: StateFlow<String> = _cari.asStateFlow()

    private val _saringPerusahaan = MutableStateFlow(SaringPerusahaan.SEMUA)
    val saringPerusahaan: StateFlow<SaringPerusahaan> = _saringPerusahaan.asStateFlow()

    private val _urut = MutableStateFlow(UrutPerusahaan.NAMA)
    val urut: StateFlow<UrutPerusahaan> = _urut.asStateFlow()

    private val _saringAkun = MutableStateFlow(SaringAkun.SEMUA)
    val saringAkun: StateFlow<SaringAkun> = _saringAkun.asStateFlow()

    private val _tempat = MutableStateFlow(TEMPAT_SEMUA)
    val tempat: StateFlow<String> = _tempat.asStateFlow()

    private val _peranSaring = MutableStateFlow<String?>(null)
    val peranSaring: StateFlow<String?> = _peranSaring.asStateFlow()

    private val _sheetPerusahaan = MutableStateFlow<SheetPerusahaanUi?>(null)
    val sheetPerusahaan: StateFlow<SheetPerusahaanUi?> = _sheetPerusahaan.asStateFlow()

    private val _sheetAkun = MutableStateFlow<SheetAkunUi?>(null)
    val sheetAkun: StateFlow<SheetAkunUi?> = _sheetAkun.asStateFlow()

    private val _wizard = MutableStateFlow<WizardUi?>(null)
    val wizard: StateFlow<WizardUi?> = _wizard.asStateFlow()

    private val _notif = MutableStateFlow<NotifUi?>(null)
    val notif: StateFlow<NotifUi?> = _notif.asStateFlow()

    /** Tindakan terakhir yang masih bisa diurungkan lewat snackbar. */
    private var urungTertunda: Urung? = null
    private var jobSheetAkun: Job? = null
    private var hitungNotif = 0L

    /**
     * Isian formulir akun/wizard (state Compose) yang dipegang ViewModel agar
     * bertahan saat Activity dibuat ulang (rotasi, tema, ukuran huruf) tanpa
     * masuk bundel tersimpan. Dibuang saat sheet ditutup/dibuka ulang.
     */
    private var formAkunAktif: Pair<String, StatusFormAkun>? = null
    private var formWizardAktif: StatusWizard? = null

    init {
        muat()
    }

    // ------------------------------------------------------------------
    // Memuat & saringan
    // ------------------------------------------------------------------

    fun muat() {
        viewModelScope.launch {
            _meja.value = MejaUi.Memuat
            muatDiam()
        }
    }

    /** Tarik meja tanpa kembali ke Memuat (dipakai usai aksi). */
    private suspend fun muatDiam() {
        when (val j = panggil { api.meja() }) {
            is Jawab.Ok -> _meja.value = MejaUi.Siap(j.data)
            is Jawab.Gagal -> if (_meja.value !is MejaUi.Siap || j.kode == KODE_DITOLAK) {
                _meja.value = MejaUi.Galat(j.pesan, ditolak = j.kode == KODE_DITOLAK)
            } else {
                kirimNotif(TeksUi.Mentah(j.pesan))
            }
        }
    }

    fun setTampilan(t: Tampilan) {
        _tampilan.value = t
    }

    fun setCari(teks: String) {
        _cari.value = teks
    }

    fun setSaringPerusahaan(s: SaringPerusahaan) {
        _saringPerusahaan.value = s
    }

    fun setUrut(u: UrutPerusahaan) {
        _urut.value = u
    }

    fun setSaringAkun(s: SaringAkun) {
        _saringAkun.value = s
    }

    fun setTempat(t: String) {
        _tempat.value = t
    }

    fun setPeranSaring(p: String?) {
        _peranSaring.value = p
    }

    fun notifTampil() {
        _notif.value = null
    }

    private fun mejaSiap(): MejaPerusahaanResponse? = (_meja.value as? MejaUi.Siap)?.meja

    private fun kirimNotif(teks: TeksUi, urung: Urung? = null) {
        urungTertunda = urung
        hitungNotif += 1
        _notif.value = NotifUi(id = hitungNotif, teks = teks, bisaUrung = urung != null)
    }

    // ------------------------------------------------------------------
    // Sheet perusahaan
    // ------------------------------------------------------------------

    fun bukaPerusahaan(id: String, tab: TabPerusahaan = TabPerusahaan.RINGKASAN) {
        _sheetPerusahaan.value = SheetPerusahaanUi(id = id, tab = tab)
    }

    fun setTabPerusahaan(tab: TabPerusahaan) {
        _sheetPerusahaan.update { it?.copy(tab = tab) }
    }

    fun tutupPerusahaan() {
        _sheetPerusahaan.value = null
        pindahkanUrungKeLayar()
    }

    /**
     * E2E-3 B7: Urungkan yang masih berlaku saat sheet ditutup dipancarkan ulang
     * (id baru) supaya snackbar layar utama — yang tadinya tertutup sheet modal —
     * tampil penuh dari awal, bukan hilang bersama sheet.
     */
    private fun pindahkanUrungKeLayar() {
        val n = _notif.value ?: return
        if (!n.bisaUrung || urungTertunda == null) return
        hitungNotif += 1
        _notif.value = n.copy(id = hitungNotif)
    }

    /** Simpan identitas perusahaan (Super Admin). Kolom kosong = dikosongkan (sama dengan web). */
    fun simpanPerusahaan(id: String, nama: String, alamat: String, telepon: String, email: String, situs: String) {
        val s = _sheetPerusahaan.value ?: return
        if (s.sibuk != null) return
        viewModelScope.launch {
            _sheetPerusahaan.update { it?.copy(sibuk = AksiPerusahaan.SIMPAN, galat = null) }
            val j = panggil {
                api.ubahPerusahaan(
                    UbahPerusahaanRequest(
                        id = id,
                        name = nama.trim(),
                        address = alamat.trim(),
                        phone = telepon.trim(),
                        email = email.trim(),
                        website = situs.trim(),
                    ),
                )
            }
            when (j) {
                is Jawab.Ok -> {
                    muatDiam()
                    kirimNotif(TeksUi.Res(R.string.ent_perusahaan_identitas_tersimpan))
                }
                is Jawab.Gagal -> _sheetPerusahaan.update { it?.copy(galat = j.pesan) }
            }
            _sheetPerusahaan.update { it?.copy(sibuk = null) }
        }
    }

    /** Aktif/nonaktif perusahaan langsung, dengan Urungkan (tanpa dialog). */
    fun setAktifPerusahaan(c: PerusahaanDto, aktif: Boolean) {
        if (_sheetPerusahaan.value?.sibuk != null) return
        viewModelScope.launch {
            _sheetPerusahaan.update { it?.copy(sibuk = AksiPerusahaan.STATUS, galat = null) }
            when (val j = panggil { api.ubahPerusahaan(UbahPerusahaanRequest(id = c.id, isActive = aktif)) }) {
                is Jawab.Ok -> {
                    muatDiam()
                    kirimNotif(
                        TeksUi.Res(if (aktif) R.string.ent_perusahaan_diaktifkan else R.string.ent_perusahaan_dinonaktifkan, listOf(c.name)),
                        Urung.Perusahaan(c.id, c.name, aktifSemula = !aktif),
                    )
                }
                is Jawab.Gagal -> _sheetPerusahaan.update { it?.copy(galat = j.pesan) }
            }
            _sheetPerusahaan.update { it?.copy(sibuk = null) }
        }
    }

    /** Hapus perusahaan (layar sudah mengonfirmasi). 409 = punya anak/riwayat. */
    fun hapusPerusahaan(c: PerusahaanDto) {
        if (_sheetPerusahaan.value?.sibuk != null) return
        viewModelScope.launch {
            _sheetPerusahaan.update { it?.copy(sibuk = AksiPerusahaan.HAPUS, galat = null) }
            when (val j = panggil { api.hapusPerusahaan(c.id) }) {
                is Jawab.Ok -> {
                    _sheetPerusahaan.value = null
                    muatDiam()
                    kirimNotif(TeksUi.Res(R.string.ent_perusahaan_dihapus, listOf(c.name)))
                }
                is Jawab.Gagal -> _sheetPerusahaan.update { it?.copy(sibuk = null, galat = j.pesan) }
            }
        }
    }

    // ------------------------------------------------------------------
    // Sheet akun
    // ------------------------------------------------------------------

    /** Buka sheet akun; [idAkun] null = akun baru. */
    fun bukaAkun(idAkun: String?, idPerusahaan: String?) {
        jobSheetAkun?.cancel()
        formAkunAktif = null
        _sheetAkun.value = SheetAkunUi(idAkun = idAkun, idPerusahaan = idPerusahaan, anggotaDimuat = idAkun == null)
        val m = mejaSiap() ?: return
        val akun = idAkun?.let { id -> semuaAkun(m).firstOrNull { it.id == id } } ?: return
        jobSheetAkun = viewModelScope.launch {
            // Keanggotaan divisi (F2-ADMIN) dimuat terpisah; gagal = kolom dikunci.
            val anggota = panggil { api.keanggotaan(akun.id) }
            if (anggota is Jawab.Ok) {
                _sheetAkun.update {
                    it?.takeIf { s -> s.idAkun == akun.id }?.copy(
                        anggotaDimuat = true,
                        anggotaDivisiAwal = anggota.data.memberDivisionId,
                    ) ?: it
                }
            }
            // Kelayakan aktivasi hanya untuk akun yang boleh disentuh selain diri sendiri.
            if (bisaSentuh(akun, m.me, m.manageableRoles)) {
                val bisa = panggil { api.kelayakanAktivasi(akun.id) }
                val tersedia = bisa is Jawab.Ok && bisa.data.canActivate
                _sheetAkun.update { it?.takeIf { s -> s.idAkun == akun.id }?.copy(aktivasiTersedia = tersedia) ?: it }
            } else {
                _sheetAkun.update { it?.takeIf { s -> s.idAkun == akun.id }?.copy(aktivasiTersedia = false) ?: it }
            }
        }
    }

    /** Tutup sheet akun; tautan aktivasi ikut dibuang. */
    fun tutupAkun() {
        jobSheetAkun?.cancel()
        formAkunAktif = null
        _sheetAkun.value = null
        pindahkanUrungKeLayar()
    }

    /** Formulir akun untuk [kunci] (akun:perusahaan); dibuat sekali selama sheet terbuka. */
    internal fun formAkun(kunci: String, buat: () -> StatusFormAkun): StatusFormAkun {
        formAkunAktif?.takeIf { it.first == kunci }?.let { return it.second }
        return buat().also { formAkunAktif = kunci to it }
    }

    /** Isian wizard; dibuat sekali selama wizard terbuka. */
    internal fun formWizard(buat: () -> StatusWizard): StatusWizard =
        formWizardAktif ?: buat().also { formWizardAktif = it }

    /**
     * Simpan formulir akun. [sandi] kosong = tidak diubah (edit) atau dibuat
     * server (baru). Nilai sandi hanya masuk ke badan permintaan.
     */
    fun simpanAkun(form: FormAkun, sandi: String, kunciPerusahaan: Boolean) {
        val s = _sheetAkun.value ?: return
        if (s.sibuk != null) return
        val m = mejaSiap() ?: return
        val perusahaan = form.idPerusahaan?.let { id -> m.companies.firstOrNull { it.id == id } }
        val tautan = tautanPosisi(form, perusahaan)
        viewModelScope.launch {
            _sheetAkun.update { it?.copy(sibuk = AksiAkun.SIMPAN, galat = null) }
            val idAkun = s.idAkun
            if (idAkun != null) {
                val anggota = if (perusahaan != null && s.anggotaDimuat && form.anggotaDivisi != s.anggotaDivisiAwal.orEmpty()) {
                    form.anggotaDivisi
                } else {
                    null
                }
                val emailSemula = semuaAkun(m).firstOrNull { it.id == idAkun }?.email
                val req = UbahAkunRequest(
                    id = idAkun,
                    name = form.nama.trim(),
                    username = form.username.trim().lowercase(),
                    email = emailUntukUbah(form.email, emailSemula),
                    title = form.jabatan.trim(),
                    phone = form.telepon.trim(),
                    role = form.peran,
                    // Meja terbatas tidak mengirim penempatan; "" = tingkat grup.
                    entityId = if (kunciPerusahaan) null else (perusahaan?.id ?: ""),
                    password = sandi.ifBlank { null },
                    divisionId = tautan.divisionId,
                    divisionName = tautan.divisionName,
                    projectId = tautan.projectId,
                    projectName = tautan.projectName,
                    memberDivisionId = anggota,
                )
                when (val j = panggil { api.ubahAkun(req) }) {
                    is Jawab.Ok -> {
                        _sheetAkun.value = null
                        muatDiam()
                        kirimNotif(
                            TeksUi.Res(
                                if (sandi.isNotBlank()) R.string.ent_akun_tersimpan_sandi else R.string.ent_akun_tersimpan,
                                listOf(form.nama.trim()),
                            ),
                        )
                    }
                    is Jawab.Gagal -> _sheetAkun.update { it?.copy(sibuk = null, galat = j.pesan) }
                }
            } else {
                val req = TambahAkunRequest(
                    entityId = perusahaan?.id,
                    name = form.nama.trim(),
                    username = form.username.trim().lowercase(),
                    role = form.peran,
                    email = form.email.trim().lowercase().ifBlank { null },
                    password = sandi.ifBlank { null },
                    title = form.jabatan.trim().ifBlank { null },
                    phone = form.telepon.trim().ifBlank { null },
                    divisionId = tautan.divisionId,
                    divisionName = tautan.divisionName,
                    projectId = tautan.projectId,
                    projectName = tautan.projectName,
                    memberDivisionId = form.anggotaDivisi.ifBlank { null }.takeIf { perusahaan != null },
                )
                when (val j = panggil { api.tambahAkun(req) }) {
                    is Jawab.Ok -> {
                        val akun = j.data.account
                        _sheetAkun.update {
                            it?.copy(
                                sibuk = null,
                                dibuat = AkunDibuat(
                                    nama = akun?.name ?: form.nama.trim(),
                                    username = akun?.username ?: form.username.trim().lowercase(),
                                    // Sandi yang terkirim, bukan isian formulir (bisa dibuat ulang).
                                    sandiAwal = Rahasia(sandi),
                                ),
                            )
                        }
                        muatDiam()
                    }
                    is Jawab.Gagal -> _sheetAkun.update { it?.copy(sibuk = null, galat = j.pesan) }
                }
            }
        }
    }

    /** Aktif/nonaktif akun langsung dengan Urungkan (tanpa dialog; server jaga 409). */
    fun setAktifAkun(akun: AkunBarisDto, aktif: Boolean) {
        if (_sheetAkun.value?.sibuk != null) return
        viewModelScope.launch {
            _sheetAkun.update { it?.copy(sibuk = AksiAkun.STATUS, galat = null) }
            when (val j = panggil { api.ubahAkun(UbahAkunRequest(id = akun.id, isActive = aktif)) }) {
                is Jawab.Ok -> {
                    muatDiam()
                    kirimNotif(
                        TeksUi.Res(if (aktif) R.string.ent_akun_diaktifkan else R.string.ent_akun_dinonaktifkan, listOf(akun.name)),
                        Urung.Akun(akun.id, akun.name, aktifSemula = !aktif),
                    )
                }
                is Jawab.Gagal -> _sheetAkun.update { it?.copy(galat = j.pesan) }
            }
            _sheetAkun.update { it?.copy(sibuk = null) }
        }
    }

    /** Hapus akun (layar sudah mengonfirmasi). 409 = akun sendiri/Super Admin terakhir/punya riwayat. */
    fun hapusAkun(akun: AkunBarisDto) {
        if (_sheetAkun.value?.sibuk != null) return
        viewModelScope.launch {
            _sheetAkun.update { it?.copy(sibuk = AksiAkun.HAPUS, galat = null) }
            when (val j = panggil { api.hapusAkun(akun.id) }) {
                is Jawab.Ok -> {
                    _sheetAkun.value = null
                    muatDiam()
                    kirimNotif(TeksUi.Res(R.string.ent_akun_dihapus, listOf(akun.name)))
                }
                is Jawab.Gagal -> _sheetAkun.update { it?.copy(sibuk = null, galat = j.pesan) }
            }
        }
    }

    /** Terbitkan ulang tautan aktivasi (24 jam, sekali pakai). Tidak dicatat log. */
    fun terbitkanAktivasi(akun: AkunBarisDto) {
        if (_sheetAkun.value?.sibuk != null) return
        viewModelScope.launch {
            _sheetAkun.update { it?.copy(sibuk = AksiAkun.AKTIVASI, galat = null, tautan = null) }
            when (val j = panggil { api.terbitkanAktivasi(TerbitkanAktivasiBody(userId = akun.id)) }) {
                is Jawab.Ok -> {
                    val a = j.data.activation
                    _sheetAkun.update {
                        if (a == null || a.path.isBlank()) {
                            it?.copy(galat = PESAN_AKTIVASI_KOSONG)
                        } else {
                            it?.takeIf { s -> s.idAkun == akun.id }?.copy(
                                tautan = TautanAktivasi(
                                    username = a.username.ifBlank { akun.username ?: akun.name },
                                    url = asal.url + a.path,
                                    kedaluwarsaIso = a.expiresAt,
                                ),
                            ) ?: it
                        }
                    }
                }
                is Jawab.Gagal -> _sheetAkun.update { it?.copy(galat = j.pesan) }
            }
            _sheetAkun.update { it?.copy(sibuk = null) }
        }
    }

    // ------------------------------------------------------------------
    // Wizard
    // ------------------------------------------------------------------

    fun bukaWizard() {
        formWizardAktif = null
        _wizard.value = WizardUi()
    }

    fun tutupWizard() {
        formWizardAktif = null
        _wizard.value = null
    }

    /** Kirim wizard; berhasil = WizardUi.hasil terisi (layar menampilkan serah terima). */
    fun kirimWizard(req: TambahPerusahaanRequest) {
        val w = _wizard.value ?: return
        if (w.sibuk) return
        viewModelScope.launch {
            _wizard.update { it?.copy(sibuk = true, galat = null) }
            when (val j = panggil { api.tambahPerusahaan(req) }) {
                is Jawab.Ok -> {
                    _wizard.update {
                        it?.copy(
                            sibuk = false,
                            hasil = j.data.entity ?: EntitasBaruDto(id = "", name = req.name),
                            serahTerima = req.positions.map { p ->
                                SerahTerimaAkun(p.name, p.role, p.username, Rahasia(p.password.orEmpty()))
                            },
                        )
                    }
                    muatDiam()
                }
                is Jawab.Gagal -> _wizard.update { it?.copy(sibuk = false, galat = j.pesan) }
            }
        }
    }

    // ------------------------------------------------------------------
    // Urungkan
    // ------------------------------------------------------------------

    /** Balikkan tindakan aktif/nonaktif terakhir. */
    fun urungkan() {
        val u = urungTertunda ?: return
        urungTertunda = null
        viewModelScope.launch {
            val j = when (u) {
                is Urung.Akun -> panggil { api.ubahAkun(UbahAkunRequest(id = u.id, isActive = u.aktifSemula)) }
                is Urung.Perusahaan -> panggil { api.ubahPerusahaan(UbahPerusahaanRequest(id = u.id, isActive = u.aktifSemula)) }
            }
            when (j) {
                is Jawab.Ok -> {
                    muatDiam()
                    val nama = when (u) {
                        is Urung.Akun -> u.nama
                        is Urung.Perusahaan -> u.nama
                    }
                    kirimNotif(TeksUi.Res(R.string.ent_umum_diurungkan, listOf(nama)))
                }
                is Jawab.Gagal -> kirimNotif(TeksUi.Mentah(j.pesan))
            }
        }
    }

    private data class TautanPosisi(
        val divisionId: String? = null,
        val divisionName: String? = null,
        val projectId: String? = null,
        val projectName: String? = null,
    )

    /** Tautan divisi/proyek (hanya bila ditempatkan di perusahaan, padanan `link` web). */
    private fun tautanPosisi(form: FormAkun, perusahaan: PerusahaanDto?): TautanPosisi {
        if (perusahaan == null) return TautanPosisi()
        val kadiv = form.peran == "KEPALA_DIVISI"
        val pic = form.peran == "PIC_PROYEK"
        return TautanPosisi(
            divisionId = form.divisiDipimpin.takeIf { kadiv && it.isNotBlank() && it != PILIH_BARU },
            divisionName = form.divisiBaru.trim().takeIf { kadiv && form.divisiDipimpin == PILIH_BARU && it.isNotBlank() },
            projectId = form.proyekDipegang.takeIf { pic && it.isNotBlank() && it != PILIH_BARU },
            projectName = form.proyekBaru.trim().takeIf { pic && form.proyekDipegang == PILIH_BARU && it.isNotBlank() },
        )
    }

    private companion object {
        const val KODE_DITOLAK = 403
        const val PESAN_AKTIVASI_KOSONG = "Tautan belum diterbitkan. Coba lagi."
    }
}
