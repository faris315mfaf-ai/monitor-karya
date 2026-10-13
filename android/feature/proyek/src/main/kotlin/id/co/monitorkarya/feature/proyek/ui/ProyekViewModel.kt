// ViewModel tab Proyek — paritas projects-view.tsx (daftar, antrean persetujuan,
// detail, formulir ajukan/ubah, ajukan ulang, hapus/arsip, Urungkan) plus
// bagian detail dari layar PIC/pemantau web: tahapan (pic/stages.tsx),
// usul tenggat, riwayat laporan (oversight/company-reports.tsx), output, dan
// eskalasi terkait. Semua izin datang dari server (permissions per proyek,
// canEdit tahapan, canDecide usulan, opsi formulir) — tidak ditebak di klien.
package id.co.monitorkarya.feature.proyek.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.ConnectivityObserver
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.MkProfilStore
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.proyek.data.AjukanUlangRequest
import id.co.monitorkarya.feature.proyek.data.AksiUsulanRequest
import id.co.monitorkarya.feature.proyek.data.DaftarProyekDto
import id.co.monitorkarya.feature.proyek.data.GalatHapusDto
import id.co.monitorkarya.feature.proyek.data.Hasil
import id.co.monitorkarya.feature.proyek.data.KeputusanRequest
import id.co.monitorkarya.feature.proyek.data.ProyekApi
import id.co.monitorkarya.feature.proyek.data.ProyekBaruRequest
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.data.TahapBaruRequest
import id.co.monitorkarya.feature.proyek.data.TahapDto
import id.co.monitorkarya.feature.proyek.data.UbahProyekRequest
import id.co.monitorkarya.feature.proyek.data.UbahStatusRequest
import id.co.monitorkarya.feature.proyek.data.UbahTahapRequest
import id.co.monitorkarya.feature.proyek.data.UrungkanRequest
import id.co.monitorkarya.feature.proyek.data.UrutanTahapRequest
import id.co.monitorkarya.feature.proyek.data.UsulTenggatRequest
import id.co.monitorkarya.feature.proyek.data.UsulanTenggatDto
import id.co.monitorkarya.feature.proyek.data.panggil
import id.co.monitorkarya.feature.proyek.domain.ZONA_WIB
import id.co.monitorkarya.feature.proyek.domain.dariKunci
import id.co.monitorkarya.feature.proyek.domain.kunciTanggal
import id.co.monitorkarya.feature.proyek.domain.labelPenyetuju
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Ukuran halaman daftar (web 12; ponsel memuat lanjutan dengan "Muat lagi"). */
internal const val UKURAN_HALAMAN = 20

/** Jeda ketik sebelum pencarian dikirim. */
internal const val JEDA_CARI_MS = 350L

/** Laporan yang diambil untuk riwayat (semuanya ditampilkan). */
internal const val LAPORAN_DIAMBIL = 10

/** Batas panjang medan sama dengan pemotongan server (C2 R6). */
internal const val BATAS_NAMA = 4000
internal const val BATAS_PENJELASAN = 4000
internal const val BATAS_TUJUAN = 2000
internal const val BATAS_CATATAN_KEPUTUSAN = 500
internal const val BATAS_CATATAN_USULAN = 1000

/** Pesan bila server menjawab 200 tetapi proyek tetap Ditolak (C2 K1). */
internal const val PESAN_AJUKAN_ULANG_TAK_TERCATAT = "Pengajuan ulang belum tercatat di server. Muat ulang lalu coba lagi."

/** Pesan bila simpan formulir ditekan lagi selagi simpan sebelumnya berjalan (C2 S2). */
internal const val PESAN_SIMPAN_BERJALAN = "Penyimpanan sebelumnya masih dikirim. Tunggu sebentar."

@HiltViewModel
class ProyekViewModel @Inject constructor(
    private val api: ProyekApi,
    private val profil: MkProfilStore,
    /** Potret luring halaman pertama daftar (B6); null di tes JVM tanpa Room. */
    private val cache: CacheLayar? = null,
    /** Pengamat jaringan (B6/N1); null di tes JVM. */
    private val konektivitas: ConnectivityObserver? = null,
) : ViewModel() {

    private val _daftar = MutableStateFlow(DaftarUi())
    val daftar: StateFlow<DaftarUi> = _daftar.asStateFlow()

    private val _detail = MutableStateFlow<DetailUi?>(null)
    val detail: StateFlow<DetailUi?> = _detail.asStateFlow()

    private val _form = MutableStateFlow<FormUi?>(null)
    val form: StateFlow<FormUi?> = _form.asStateFlow()

    private val _notifikasi = MutableStateFlow<Notifikasi?>(null)
    val notifikasi: StateFlow<Notifikasi?> = _notifikasi.asStateFlow()

    private var muatJob: Job? = null
    private var muatLagiJob: Job? = null
    private var cariJob: Job? = null
    private var opsiJob: Job? = null
    private var detailJob: Job? = null
    private var izinJob: Job? = null
    private var simpanJob: Job? = null
    private var simpanTahapJob: Job? = null

    /** Penanda permintaan daftar terbaru; respons lama dibuang. */
    private var nomorMuat = 0

    /** Nomor sesi formulir terakhir yang dibuka. */
    private var nomorForm = 0L

    /** Izin ajukan sudah pasti (200 atau 403); galat jaringan/5xx diulang (C2 S4). */
    private var izinAjukanPasti = false

    /** Aksi Sheet detail yang masih berjalan per id proyek (dibawa saat Sheet dibuka ulang). */
    private val aksiBerjalan = mutableMapOf<String, String>()

    /** Id akun ini dari profil sesi (C2 R1); null = belum/tidak diketahui. */
    private var penggunaId: String? = null

    init {
        viewModelScope.launch {
            penggunaId = withContext(Dispatchers.IO) { runCatching { profil.baca()?.id }.getOrNull() }
            _detail.update { it?.copy(penggunaId = penggunaId) }
        }
        muatDaftar()
    }

    /* -------------------------------------------------------------- */
    /* Daftar & saringan                                               */
    /* -------------------------------------------------------------- */

    fun pilihSiklus(siklus: String) {
        if (siklus == _daftar.value.saringan.siklus) return
        _daftar.update { it.copy(saringan = it.saringan.copy(siklus = siklus)) }
        muatDaftar()
    }

    fun pilihFase(fase: String?) {
        if (fase == _daftar.value.saringan.fase) return
        _daftar.update { it.copy(saringan = it.saringan.copy(fase = fase)) }
        muatDaftar()
    }

    /** Teks cari diperbarui segera; permintaan dikirim setelah jeda ketik. */
    fun ubahCari(teks: String) {
        _daftar.update { it.copy(saringan = it.saringan.copy(cari = teks)) }
        cariJob?.cancel()
        cariJob = viewModelScope.launch {
            delay(JEDA_CARI_MS)
            muatDaftar()
        }
    }

    fun hapusSaringan() {
        cariJob?.cancel()
        _daftar.update { it.copy(saringan = it.saringan.copy(cari = "", fase = null)) }
        muatDaftar()
    }

    /**
     * B6/N1: layar tersembunyi (tab lain) tidak ikut disusun ulang MKShell saat
     * daring kembali. Saat transisi luring → daring, isi yang berasal dari
     * potret Room atau galat dimuat ulang sendiri, jadi penanda "data
     * tersimpan" tidak tertinggal setelah tersambung lagi.
     */
    init {
        amatiDaring()
    }

    private fun amatiDaring() {
        val k = konektivitas ?: return
        viewModelScope.launch {
            k.daring.distinctUntilChanged().drop(1).filter { it }.collect {
                if (_daftar.value.let { d -> d.tersimpanPada != null || d.muat == Muat.GALAT }) muatDaftar()
            }
        }
    }

    /** Muat ulang halaman pertama. Daftar lama tetap tampil (diredupkan) bila ada. */
    fun muatDaftar() {
        muatJob?.cancel()
        // "Muat lagi" yang masih berjalan milik daftar lama: batalkan agar
        // halamannya tidak ditempel di belakang halaman 1 yang baru (C2 S3).
        muatLagiJob?.cancel()
        val nomor = ++nomorMuat
        _daftar.update {
            if (it.muat == Muat.SIAP) {
                it.copy(menyegarkan = true, galat = null, memuatLagi = false)
            } else {
                it.copy(muat = Muat.MEMUAT, galat = null, memuatLagi = false)
            }
        }
        muatJob = viewModelScope.launch { tarikHalaman(nomor, halaman = 1, tambah = false) }
        if (!izinAjukanPasti && izinJob?.isActive != true) periksaBolehAjukan()
    }

    fun muatLagi() {
        val d = _daftar.value
        // Selama menyegarkan, nomor halaman belum pasti: tolak (C2 S3).
        if (d.memuatLagi || d.menyegarkan || !d.adaLagi || d.muat != Muat.SIAP) return
        val nomor = nomorMuat
        _daftar.update { it.copy(memuatLagi = true) }
        muatLagiJob = viewModelScope.launch { tarikHalaman(nomor, halaman = d.halaman + 1, tambah = true) }
    }

    private suspend fun tarikHalaman(nomor: Int, halaman: Int, tambah: Boolean) {
        val s = _daftar.value.saringan
        val h = panggil {
            api.daftar(
                halaman = halaman,
                ukuran = UKURAN_HALAMAN,
                siklus = s.siklus,
                tahap = s.fase,
                cari = s.cari.trim().takeIf { it.isNotEmpty() },
            )
        }
        if (nomor != nomorMuat) return
        // B6: halaman pertama disimpan ke Room; server tak terjangkau → potret hari ini (saringan sama).
        val kunci = kunciPotretDaftar(s)
        if (!tambah && h is Hasil.Ok && h.data != null) cache?.simpan(kunci, DaftarProyekDto.serializer(), h.data)
        val potret = if (!tambah && h is Hasil.Gagal && h.galat is ApiError.Jaringan) {
            cache?.ambil(kunci, DaftarProyekDto.serializer())
        } else {
            null
        }
        if (nomor != nomorMuat) return
        if (potret != null) {
            val isi = potret.nilai
            _daftar.update { d ->
                d.copy(
                    muat = Muat.SIAP,
                    galat = null,
                    items = isi.items,
                    total = isi.total,
                    halaman = 1,
                    ringkasan = isi.summary,
                    menyegarkan = false,
                    memuatLagi = false,
                    tersimpanPada = potret.disimpanPada,
                )
            }
            return
        }
        when (h) {
            is Hasil.Ok -> {
                val isi = h.data
                _daftar.update { d ->
                    val baru = isi?.items.orEmpty()
                    val gabung = if (tambah) (d.items + baru).distinctBy { it.id } else baru
                    d.copy(
                        muat = Muat.SIAP,
                        galat = null,
                        items = gabung,
                        total = isi?.total ?: gabung.size,
                        halaman = if (tambah) halaman else 1,
                        ringkasan = isi?.summary ?: d.ringkasan.takeIf { tambah },
                        menyegarkan = false,
                        memuatLagi = false,
                        tersimpanPada = if (tambah) d.tersimpanPada else null,
                    )
                }
            }
            is Hasil.Gagal -> if (tambah) {
                _daftar.update { it.copy(memuatLagi = false) }
                kirim(h.pesan)
            } else {
                // Daftar lama yang masih tampil diganti galat: data basi tidak boleh
                // terlihat seolah hasil saringan baru.
                _daftar.update {
                    it.copy(muat = Muat.GALAT, galat = h.pesan, menyegarkan = false, memuatLagi = false, tersimpanPada = null)
                }
            }
        }
    }

    /**
     * Izin mengajukan berasal dari server: GET ?options=1 menolak (403) peran yang
     * tidak boleh mengajukan maupun mengelola proyek. Hanya 200/403 yang pasti;
     * galat jaringan/5xx diperiksa ulang pada muat daftar berikutnya ("Coba lagi",
     * tarik segar) agar tombol Ajukan tidak hilang permanen (C2 S4).
     */
    private fun periksaBolehAjukan() {
        izinJob = viewModelScope.launch {
            when (val h = panggil { api.opsi() }) {
                is Hasil.Ok -> {
                    izinAjukanPasti = true
                    _daftar.update { it.copy(bolehAjukan = true) }
                }
                is Hasil.Gagal -> if (h.kode == 403) {
                    izinAjukanPasti = true
                    _daftar.update { it.copy(bolehAjukan = false) }
                }
            }
        }
    }

    /** Setujui di tempat dari antrean (catatan kosong), dengan Urungkan. */
    fun setujuiCepat(p: ProyekDto) {
        if (_daftar.value.setujuiCepat != null) return
        _daftar.update { it.copy(setujuiCepat = p.id) }
        viewModelScope.launch {
            val h = panggil { api.putuskan(KeputusanRequest(p.id, "DISETUJUI", "")) }
            _daftar.update { it.copy(setujuiCepat = null) }
            when (h) {
                is Hasil.Ok -> {
                    kirim("${p.name} disetujui sebagai ${labelPenyetuju(p.pendingRole)}.", h.data?.undoToken?.let { AksiUrungkan.Tiket(it) })
                    muatDaftar()
                }
                is Hasil.Gagal -> {
                    kirim(h.pesan)
                    // Sudah diputuskan pihak lain: antrean basi dimuat ulang (C2 R3).
                    if (h.kode == 409) muatDaftar()
                }
            }
        }
    }

    /* -------------------------------------------------------------- */
    /* Detail                                                          */
    /* -------------------------------------------------------------- */

    /** Buka Sheet detail; [keputusan] "DITOLAK" langsung ke isian alasan (tombol Tolak antrean). */
    fun bukaDetail(p: ProyekDto, keputusan: String? = null) {
        _detail.value = DetailUi(
            proyek = p,
            keputusan = keputusan?.takeIf { p.permissions.approve },
            // Aksi yang masih berjalan untuk proyek ini tetap mengunci tombol (cegah kirim ganda).
            sibuk = aksiBerjalan[p.id],
            penggunaId = penggunaId,
        )
        muatBagianDetail(p)
    }

    /**
     * Sheet boleh selalu ditutup (ModalBottomSheet sudah tersembunyi sebelum
     * onDismissRequest; menahannya meninggalkan modal tak terlihat). Aksi yang
     * berjalan tetap selesai dan hasilnya dilaporkan lewat snackbar (C2 S1).
     */
    fun tutupDetail() {
        detailJob?.cancel()
        _detail.value = null
    }

    /** Tutup Sheet hanya bila masih menampilkan proyek [id]. */
    private fun tutupDetailUntuk(id: String) {
        if (_detail.value?.proyek?.id == id) tutupDetail()
    }

    private fun ubahDetail(f: (DetailUi) -> DetailUi) = _detail.update { it?.let(f) }

    private fun mulaiAksi(id: String, label: String) {
        aksiBerjalan[id] = label
        ubahDetailUntuk(id) { it.copy(sibuk = label, galat = null) }
    }

    private fun selesaiAksi(id: String) {
        aksiBerjalan.remove(id)
        ubahDetailUntuk(id) { it.copy(sibuk = null) }
    }

    /** Galat aksi ke Sheet proyek asal bila masih terbuka; selain itu ke snackbar. */
    private fun galatDetail(id: String, pesan: String) {
        if (_detail.value?.proyek?.id == id) ubahDetailUntuk(id) { it.copy(sibuk = null, galat = pesan) } else kirim(pesan)
    }

    /** 409: keadaan berubah di pihak lain — daftar dan proyek di Sheet ditarik ulang (C2 R3). */
    private suspend fun segarkanSetelahKonflik(id: String) {
        muatDaftar()
        segarkanProyekDetail(id)
    }

    /** Tahapan, usulan, laporan, output, dan eskalasi dimuat paralel dan terpisah. */
    private fun muatBagianDetail(p: ProyekDto) {
        detailJob?.cancel()
        val berjalan = p.lifecycle != "DIUSULKAN" && p.lifecycle != "DITOLAK"
        if (!berjalan) return
        detailJob = viewModelScope.launch {
            val tahap = async { muatTahapan(p.id) }
            val usulan = async { muatUsulan(p.id) }
            val keluaran = async {
                val h = panggil { api.output(p.id) }
                ubahDetailUntuk(p.id) { it.copy(output = h.keBagian { d -> d }) }
            }
            val laporan = async { muatLaporan(p.id) }
            val eskalasi = async { muatEskalasi(p.id) }
            tahap.await()
            usulan.await()
            keluaran.await()
            laporan.await()
            eskalasi.await()
        }
    }

    private fun ubahDetailUntuk(id: String, f: (DetailUi) -> DetailUi) =
        _detail.update { d -> if (d?.proyek?.id == id) f(d) else d }

    private suspend fun muatTahapan(id: String) {
        val h = panggil { api.tahapan(id) }
        ubahDetailUntuk(id) { it.copy(tahapan = h.keBagian { d -> d }) }
    }

    private suspend fun muatUsulan(id: String) {
        val h = panggil { api.usulanTenggat(id) }
        ubahDetailUntuk(id) { it.copy(usulan = h.keBagian { d -> d }) }
    }

    private suspend fun muatLaporan(id: String) {
        val h = panggil { api.riwayatLaporan(id, LAPORAN_DIAMBIL) }
        ubahDetailUntuk(id) { it.copy(laporan = h.keBagian { d -> d.items }) }
    }

    /**
     * Eskalasi terkait langsung dari server (`?projectId=`, B3): bersumber dari
     * laporan harian mana pun atau task proyek ini — tidak lagi dicocokkan klien
     * ke 30 laporan terakhir. Gagal di sini tidak menjatuhkan riwayat laporan.
     */
    private suspend fun muatEskalasi(id: String) {
        val h = panggil { api.eskalasi(id) }
        ubahDetailUntuk(id) { it.copy(eskalasi = h.keBagian { d -> d.items }) }
    }

    /** Ambil ulang satu proyek (izin bisa berubah setelah aksi) tanpa menutup Sheet. */
    private suspend fun segarkanProyekDetail(id: String) {
        val h = panggil { api.daftar(halaman = 1, ukuran = 1, siklus = "ALL", id = id) }
        val p = (h as? Hasil.Ok)?.data?.items?.firstOrNull { it.id == id } ?: return
        ubahDetailUntuk(id) { it.copy(proyek = p) }
    }

    fun mulaiKeputusan(keputusan: String) = ubahDetail {
        if (it.proyek.permissions.approve) it.copy(keputusan = keputusan, galat = null) else it
    }

    fun batalKeputusan() = ubahDetail { it.copy(keputusan = null, catatan = "", galat = null) }

    fun ubahCatatan(teks: String) = ubahDetail { it.copy(catatan = teks.take(BATAS_CATATAN_KEPUTUSAN)) }

    /** POST /api/projects/approve. Tolak wajib alasan ≥ 5 huruf (juga dicek server, 422). */
    fun kirimKeputusan() {
        val d = _detail.value ?: return
        val keputusan = d.keputusan ?: return
        if (d.sibuk != null) return
        if (keputusan == "DITOLAK" && d.catatan.trim().length < 5) {
            ubahDetail { it.copy(galat = "Tulis alasan penolakan minimal 5 karakter.") }
            return
        }
        val p = d.proyek
        mulaiAksi(p.id, "decide")
        viewModelScope.launch {
            val h = panggil { api.putuskan(KeputusanRequest(p.id, keputusan, d.catatan.trim())) }
            selesaiAksi(p.id)
            when (h) {
                is Hasil.Ok -> {
                    tutupDetailUntuk(p.id)
                    val pesan = if (keputusan == "DISETUJUI") "${p.name} disetujui." else "${p.name} ditolak."
                    kirim(pesan, h.data?.undoToken?.let { AksiUrungkan.Tiket(it) })
                    muatDaftar()
                }
                is Hasil.Gagal -> {
                    galatDetail(p.id, h.pesan)
                    if (h.kode == 409) segarkanSetelahKonflik(p.id)
                }
            }
        }
    }

    /** PATCH { id, resubmit: true } — bisa diurungkan, jadi tanpa konfirmasi. */
    fun ajukanUlang() {
        val d = _detail.value ?: return
        if (d.sibuk != null || !d.proyek.permissions.resubmit) return
        val p = d.proyek
        mulaiAksi(p.id, "resubmit")
        viewModelScope.launch {
            val h = panggil { api.ajukanUlang(AjukanUlangRequest(p.id)) }
            selesaiAksi(p.id)
            when (h) {
                // Server lama/PATCH kosong menjawab 200 dengan proyek tetap Ditolak:
                // jangan laporkan sukses palsu (C2 K1).
                is Hasil.Ok -> if (h.data?.project?.lifecycle == "DITOLAK") {
                    galatDetail(p.id, PESAN_AJUKAN_ULANG_TAK_TERCATAT)
                    segarkanSetelahKonflik(p.id)
                } else {
                    tutupDetailUntuk(p.id)
                    kirim("${p.name} diajukan ulang.", h.data?.undoToken?.let { AksiUrungkan.Tiket(it) })
                    muatDaftar()
                }
                is Hasil.Gagal -> {
                    galatDetail(p.id, h.pesan)
                    if (h.kode == 409) segarkanSetelahKonflik(p.id)
                }
            }
        }
    }

    /** Hapus selalu dikonfirmasi (tidak bisa diurungkan). */
    fun mintaHapus() = ubahDetail { if (it.proyek.permissions.manage) it.copy(konfirmasi = Konfirmasi.HapusProyek) else it }

    fun batalKonfirmasi() = ubahDetail { it.copy(konfirmasi = null) }

    fun setujuKonfirmasi() {
        val d = _detail.value ?: return
        when (val k = d.konfirmasi) {
            Konfirmasi.HapusProyek -> hapusProyek(d.proyek)
            // Id asal dibawa konfirmasi, bukan proyek yang kebetulan sedang terbuka (C2 S1).
            is Konfirmasi.ArsipkanProyek -> arsipkanProyek(k.proyek)
            is Konfirmasi.HapusTahap -> hapusTahap(k.tahap)
            null -> Unit
        }
    }

    private fun hapusProyek(p: ProyekDto) {
        if (aksiBerjalan.containsKey(p.id)) return
        ubahDetailUntuk(p.id) { it.copy(konfirmasi = null) }
        mulaiAksi(p.id, "delete")
        viewModelScope.launch {
            val h = panggil { api.hapus(p.id) }
            selesaiAksi(p.id)
            when (h) {
                is Hasil.Ok -> {
                    tutupDetailUntuk(p.id)
                    kirim("${p.name} dihapus.")
                    muatDaftar()
                }
                is Hasil.Gagal -> {
                    // Proyek yang sudah punya data tidak dihapus; tawarkan pengarsipan —
                    // hanya di Sheet proyek asal. Bila Sheet sudah ditutup/berganti,
                    // pesan server (berisi saran arsip) tampil di snackbar.
                    val badan = h.badan?.let { runCatching { mkJson.decodeFromString(GalatHapusDto.serializer(), it) }.getOrNull() }
                    if (h.kode == 409 && badan?.canArchive == true && _detail.value?.proyek?.id == p.id) {
                        ubahDetailUntuk(p.id) { it.copy(konfirmasi = Konfirmasi.ArsipkanProyek(h.pesan, p)) }
                    } else {
                        galatDetail(p.id, h.pesan)
                    }
                }
            }
        }
    }

    private fun arsipkanProyek(p: ProyekDto) {
        if (aksiBerjalan.containsKey(p.id)) return
        ubahDetailUntuk(p.id) { it.copy(konfirmasi = null) }
        mulaiAksi(p.id, "delete")
        viewModelScope.launch {
            val h = panggil { api.ubahStatus(UbahStatusRequest(p.id, "DIARSIPKAN")) }
            selesaiAksi(p.id)
            when (h) {
                is Hasil.Ok -> {
                    tutupDetailUntuk(p.id)
                    kirim("${p.name} diarsipkan.", h.data?.undoToken?.let { AksiUrungkan.Tiket(it) })
                    muatDaftar()
                }
                is Hasil.Gagal -> galatDetail(p.id, h.pesan)
            }
        }
    }

    /* -------------------------------------------------------------- */
    /* Tahapan                                                         */
    /* -------------------------------------------------------------- */

    fun bukaEditorTahap() = ubahDetail {
        if (it.tahapan.dataAtauNull()?.canEdit == true) it.copy(editorTahap = EditorTahapUi()) else it
    }

    fun tutupEditorTahap() = ubahDetail { it.copy(editorTahap = null) }

    fun ubahDrafTahap(f: (DrafTahap) -> DrafTahap) = ubahDetail { d ->
        d.editorTahap?.let { e -> d.copy(editorTahap = e.copy(draf = f(e.draf), galat = null)) } ?: d
    }

    fun pilihTahapUntukDiubah(t: TahapDto) = ubahDrafTahap {
        DrafTahap(t.id, t.name, kunciTanggal(t.startDate), kunciTanggal(t.dueDate), t.status, t.note.orEmpty())
    }

    fun batalUbahTahap() = ubahDrafTahap { DrafTahap() }

    fun simpanTahap() {
        val d = _detail.value ?: return
        val e = d.editorTahap ?: return
        if (e.sibuk || simpanTahapJob?.isActive == true) return
        val f = e.draf
        val salah = when {
            f.nama.trim().length < 2 -> "Nama tahap minimal 2 huruf"
            dariKunci(f.mulai) != null && dariKunci(f.selesai) != null &&
                dariKunci(f.selesai)!!.isBefore(dariKunci(f.mulai)) -> "Tanggal selesai tidak boleh sebelum tanggal mulai"
            f.status == "TERTAHAN" && f.catatan.isBlank() -> "Tulis alasan tahap tertahan"
            else -> null
        }
        if (salah != null) {
            ubahDetail { it.copy(editorTahap = e.copy(galat = salah)) }
            return
        }
        val projectId = d.proyek.id
        ubahDetail { it.copy(editorTahap = e.copy(sibuk = true, galat = null)) }
        simpanTahapJob = viewModelScope.launch {
            val h = if (f.id != null) {
                panggil {
                    api.ubahTahap(UbahTahapRequest(f.id, f.nama.trim(), f.mulai.ifBlank { null }, f.selesai.ifBlank { null }, f.status, f.catatan.trim()))
                }
            } else {
                panggil {
                    api.tambahTahap(TahapBaruRequest(projectId, f.nama.trim(), f.mulai.ifBlank { null }, f.selesai.ifBlank { null }, f.status, f.catatan.trim()))
                }
            }
            when (h) {
                is Hasil.Ok -> {
                    ubahDetailUntuk(projectId) { it.copy(editorTahap = it.editorTahap?.copy(draf = DrafTahap(), sibuk = false)) }
                    kirim(if (f.id != null) "Tahap diperbarui." else "Tahap ditambahkan.")
                    muatTahapan(projectId)
                }
                is Hasil.Gagal -> if (editorTerbuka(projectId)) {
                    ubahDetailUntuk(projectId) { it.copy(editorTahap = it.editorTahap?.copy(sibuk = false, galat = h.pesan)) }
                } else {
                    kirim(h.pesan)
                }
            }
        }
    }

    private fun editorTerbuka(projectId: String): Boolean =
        _detail.value?.let { it.proyek.id == projectId && it.editorTahap != null } == true

    /** Naik/turun satu posisi; urutan lengkap dikirim (PATCH). Satu PATCH sekaligus (C2 R4). */
    fun pindahTahap(indeks: Int, arah: Int) {
        val d = _detail.value ?: return
        if (d.sibukUrut) return
        val items = d.tahapan.dataAtauNull()?.items ?: return
        val j = indeks + arah
        if (indeks !in items.indices || j !in items.indices) return
        val urutan = items.map { it.id }.toMutableList()
        urutan[indeks] = urutan[j].also { urutan[j] = urutan[indeks] }
        val projectId = d.proyek.id
        ubahDetailUntuk(projectId) { it.copy(sibukUrut = true) }
        viewModelScope.launch {
            when (val h = panggil { api.urutkanTahap(UrutanTahapRequest(projectId, urutan)) }) {
                is Hasil.Ok -> muatTahapan(projectId)
                is Hasil.Gagal -> {
                    kirim(h.pesan)
                    // Urutan basi (422/409): tarik urutan terbaru.
                    muatTahapan(projectId)
                }
            }
            ubahDetailUntuk(projectId) { it.copy(sibukUrut = false) }
        }
    }

    fun mintaHapusTahap(t: TahapDto) = ubahDetail { it.copy(konfirmasi = Konfirmasi.HapusTahap(t)) }

    private fun hapusTahap(t: TahapDto) {
        val projectId = _detail.value?.proyek?.id ?: return
        ubahDetail { it.copy(konfirmasi = null) }
        viewModelScope.launch {
            when (val h = panggil { api.hapusTahap(t.id) }) {
                is Hasil.Ok -> {
                    ubahDetailUntuk(projectId) { d ->
                        val e = d.editorTahap
                        if (e != null && e.draf.id == t.id) d.copy(editorTahap = e.copy(draf = DrafTahap())) else d
                    }
                    kirim("Tahap dihapus.")
                    muatTahapan(projectId)
                }
                is Hasil.Gagal -> kirim(h.pesan)
            }
        }
    }

    /* -------------------------------------------------------------- */
    /* Usulan tenggat                                                  */
    /* -------------------------------------------------------------- */

    fun bukaUsulTenggat() = ubahDetail {
        if (it.tahapan.dataAtauNull()?.canEdit == true && it.usulanTerbuka == null) it.copy(usulTenggat = UsulTenggatUi()) else it
    }

    fun tutupUsulTenggat() = ubahDetail { it.copy(usulTenggat = null) }

    fun ubahUsulTenggat(f: (UsulTenggatUi) -> UsulTenggatUi) = ubahDetail { d ->
        d.usulTenggat?.let { d.copy(usulTenggat = f(it)) } ?: d
    }

    fun kirimUsulTenggat(hariIni: LocalDate = LocalDate.now(ZONA_WIB)) {
        val d = _detail.value ?: return
        val u = d.usulTenggat ?: return
        if (u.sibuk) return
        val tgl = dariKunci(u.tanggal)
        val galatTanggal = when {
            tgl == null -> "Pilih tanggal tenggat baru"
            !tgl.isAfter(hariIni) -> "Tenggat baru harus setelah hari ini"
            else -> null
        }
        val galatAlasan = if (u.alasan.trim().length < 10) "Tulis alasannya sebagai fakta, minimal 10 huruf" else null
        if (galatTanggal != null || galatAlasan != null) {
            ubahDetail { it.copy(usulTenggat = u.copy(galatTanggal = galatTanggal, galatAlasan = galatAlasan, galatForm = null)) }
            return
        }
        val projectId = d.proyek.id
        ubahDetail { it.copy(usulTenggat = u.copy(sibuk = true, galatTanggal = null, galatAlasan = null, galatForm = null)) }
        viewModelScope.launch {
            when (val h = panggil { api.usulTenggat(UsulTenggatRequest(projectId, u.tanggal, u.alasan.trim())) }) {
                is Hasil.Ok -> {
                    ubahDetailUntuk(projectId) { it.copy(usulTenggat = null) }
                    kirim("Usulan tenggat dikirim ke Direktur.")
                    muatUsulan(projectId)
                    muatTahapan(projectId)
                }
                is Hasil.Gagal -> if (_detail.value?.let { it.proyek.id == projectId && it.usulTenggat != null } == true) {
                    ubahDetailUntuk(projectId) { it.copy(usulTenggat = it.usulTenggat?.copy(sibuk = false, galatForm = h.pesan)) }
                } else {
                    kirim(h.pesan)
                }
            }
        }
    }

    /** Tarik usulan yang belum diputuskan; Urungkan = ajukan kembali isi yang sama. */
    fun tarikUsulan(u: UsulanTenggatDto) {
        val projectId = _detail.value?.proyek?.id ?: return
        if (_detail.value?.sibukUsulan == true) return
        ubahDetail { it.copy(sibukUsulan = true) }
        viewModelScope.launch {
            val h = panggil { api.aksiUsulan(AksiUsulanRequest(u.id, "withdraw")) }
            ubahDetailUntuk(projectId) { it.copy(sibukUsulan = false) }
            when (h) {
                is Hasil.Ok -> {
                    kirim("Usulan tenggat ditarik.", AksiUrungkan.AjukanKembaliUsulan(projectId, kunciTanggal(u.proposedDate), u.reason))
                    muatUsulan(projectId)
                    muatTahapan(projectId)
                }
                is Hasil.Gagal -> kirim(h.pesan)
            }
        }
    }

    fun mulaiPutusUsulan(u: UsulanTenggatDto, aksi: String) = ubahDetail {
        if (it.bolehPutus(u)) it.copy(putusUsulan = PutusUsulanUi(u, aksi)) else it
    }

    fun batalPutusUsulan() = ubahDetail { it.copy(putusUsulan = null) }

    fun ubahCatatanUsulan(teks: String) = ubahDetail { d ->
        d.putusUsulan?.let { d.copy(putusUsulan = it.copy(catatan = teks.take(BATAS_CATATAN_USULAN), galat = null)) } ?: d
    }

    /** PATCH approve/reject; tolak wajib alasan. Urungkan ≤ 15 menit (action undo). */
    fun kirimPutusUsulan() {
        val d = _detail.value ?: return
        val pu = d.putusUsulan ?: return
        if (pu.sibuk) return
        if (pu.aksi == "reject" && pu.catatan.isBlank()) {
            ubahDetail { it.copy(putusUsulan = pu.copy(galat = "Tulis alasan penolakan untuk PIC")) }
            return
        }
        val projectId = d.proyek.id
        ubahDetail { it.copy(putusUsulan = pu.copy(sibuk = true, galat = null)) }
        viewModelScope.launch {
            val h = panggil { api.aksiUsulan(AksiUsulanRequest(pu.usulan.id, pu.aksi, pu.catatan.trim().ifBlank { null })) }
            when (h) {
                is Hasil.Ok -> {
                    ubahDetailUntuk(projectId) { it.copy(putusUsulan = null) }
                    kirim(
                        if (pu.aksi == "approve") "Usulan tenggat disetujui." else "Usulan tenggat ditolak.",
                        AksiUrungkan.KeputusanUsulan(pu.usulan.id, projectId),
                    )
                    muatUsulan(projectId)
                    muatTahapan(projectId)
                    segarkanProyekDetail(projectId)
                    muatDaftar()
                }
                is Hasil.Gagal -> when {
                    // Usulan sudah diputus/ditarik pihak lain: tutup isian, tampilkan pesan, tarik ulang.
                    h.kode == 409 -> {
                        ubahDetailUntuk(projectId) { it.copy(putusUsulan = null) }
                        kirim(h.pesan)
                        muatUsulan(projectId)
                        muatTahapan(projectId)
                    }
                    _detail.value?.let { it.proyek.id == projectId && it.putusUsulan != null } == true ->
                        ubahDetailUntuk(projectId) { it.copy(putusUsulan = it.putusUsulan?.copy(sibuk = false, galat = h.pesan)) }
                    else -> kirim(h.pesan)
                }
            }
        }
    }

    /* -------------------------------------------------------------- */
    /* Formulir ajukan / ubah                                          */
    /* -------------------------------------------------------------- */

    fun bukaFormBaru() {
        _form.value = FormUi(sesi = ++nomorForm)
        muatOpsi(null)
    }

    /** Dari detail (izin manage) — Sheet detail ditutup, formulir dibuka. */
    fun bukaFormUbah(p: ProyekDto) {
        if (!p.permissions.manage) return
        tutupDetail()
        _form.value = FormUi(
            sesi = ++nomorForm,
            proyek = p,
            entitasId = p.entity.id,
            nama = p.name,
            penjelasan = p.description.orEmpty(),
            tujuan = p.purpose.orEmpty(),
            fase = p.phase,
            picId = p.picUserId.orEmpty(),
            divisiId = p.divisionId.orEmpty(),
            mulai = kunciTanggal(p.startDate),
            selesai = kunciTanggal(p.targetEndDate),
            terkait = p.relatedEntities.map { it.id },
            siklus = p.lifecycle,
        )
        muatOpsi(p.entity.id)
    }

    /**
     * Formulir boleh ditutup kapan saja (lihat [tutupDetail]); simpan yang
     * berjalan tetap selesai dan hasilnya dilaporkan lewat snackbar (C2 S2).
     */
    fun tutupForm() {
        opsiJob?.cancel()
        _form.value = null
    }

    fun ubahForm(f: (FormUi) -> FormUi) = _form.update { it?.let(f)?.copy(galat = emptyList()) }

    /** Peran global memilih PT dulu; kandidat PIC & divisi mengikuti PT itu. */
    fun pilihEntitas(id: String) {
        _form.update { f ->
            f?.copy(entitasId = id, picId = "", divisiId = "", terkait = f.terkait - id, galat = emptyList())
        }
        muatOpsi(id.ifBlank { null })
    }

    fun ubahFase(fase: String) = ubahForm { f ->
        // Jalur tanpa persetujuan hanya untuk tahap awal.
        f.copy(fase = fase, lewatiPersetujuan = if (fase.isEmpty() || fase == "INISIASI") f.lewatiPersetujuan else false)
    }

    fun alihkanTerkait(id: String) = ubahForm { f ->
        f.copy(terkait = if (id in f.terkait) f.terkait - id else f.terkait + id)
    }

    private fun muatOpsi(entityId: String?) {
        opsiJob?.cancel()
        _form.update { it?.copy(opsi = if (it.opsi is Bagian.Siap) it.opsi else Bagian.Memuat) }
        opsiJob = viewModelScope.launch {
            val h = panggil { api.opsi(entityId) }
            _form.update { it?.copy(opsi = h.keBagian { d -> d }) }
        }
    }

    fun simpanForm() {
        val f = _form.value ?: return
        if (f.sibuk) return
        // Formulir dibuka ulang selagi POST sebelumnya berjalan: cegah proyek ganda (C2 S2).
        if (simpanJob?.isActive == true) {
            kirim(PESAN_SIMPAN_BERJALAN)
            return
        }
        if (!f.sah) {
            val pesan = buildList {
                if (f.perluEntitas) add("Pilih PT pemilik proyek.")
                if (f.nama.trim().length < 5) add("Nama proyek minimal 5 karakter.")
                if (f.penjelasan.trim().length < 20) add("Jelaskan proyeknya minimal 20 karakter agar penyetuju paham.")
                if (!f.urutanTanggalSah) add("Target selesai harus setelah rencana mulai.")
            }
            _form.update { it?.copy(galat = pesan) }
            return
        }
        _form.update { it?.copy(sibuk = true, galat = emptyList()) }
        val sesi = f.sesi
        simpanJob = viewModelScope.launch {
            val p = f.proyek
            val h = if (p != null) {
                panggil {
                    api.ubah(
                        UbahProyekRequest(
                            id = p.id,
                            name = f.nama,
                            description = f.penjelasan,
                            purpose = f.tujuan,
                            phase = f.fase,
                            picUserId = f.picId,
                            relatedEntityIds = f.terkait,
                            // Tanggal hanya bila berubah (C2 R5): tenggat hasil usulan tidak tergeser.
                            startDate = f.mulai.takeIf { it != kunciTanggal(p.startDate) },
                            targetEndDate = f.selesai.takeIf { it != kunciTanggal(p.targetEndDate) },
                            // Kirim hanya bila berubah (divisi lama yang nonaktif tidak ditolak ulang).
                            divisionId = f.divisiId.takeIf { it != p.divisionId.orEmpty() },
                            lifecycle = f.siklus.takeIf { it.isNotEmpty() && it != p.lifecycle && p.permissions.setLifecycle },
                        ),
                    )
                }
            } else {
                panggil {
                    api.ajukan(
                        ProyekBaruRequest(
                            name = f.nama,
                            description = f.penjelasan,
                            purpose = f.tujuan,
                            phase = f.fase,
                            picUserId = f.picId,
                            divisionId = f.divisiId,
                            startDate = f.mulai,
                            targetEndDate = f.selesai,
                            relatedEntityIds = f.terkait,
                            entityId = f.pemilikId.ifBlank { null },
                            skipApproval = f.melewati,
                        ),
                    )
                }
            }
            when (h) {
                is Hasil.Ok -> {
                    // Hanya tutup formulir asalnya, bukan formulir lain yang dibuka sesudahnya.
                    _form.update { if (it?.sesi == sesi) null else it }
                    val token = h.data?.undoToken
                    when {
                        token != null -> kirim("Proyek diarsipkan.", AksiUrungkan.Tiket(token))
                        p != null -> kirim("Perubahan proyek tersimpan.")
                        f.rantai.isNotEmpty() && !f.melewati -> kirim("Pengajuan proyek terkirim.")
                        else -> kirim("Proyek dibuat dan langsung aktif.")
                    }
                    // Proyek baru: pindah ke status hasilnya (Diusulkan/Aktif) seperti web.
                    val siklusBaru = h.data?.project?.lifecycle
                    if (p == null && siklusBaru != null) {
                        _daftar.update { it.copy(saringan = it.saringan.copy(siklus = siklusBaru)) }
                    }
                    muatDaftar()
                }
                is Hasil.Gagal -> {
                    val daftar = (h.galat as? id.co.monitorkarya.core.network.ApiError.Validasi)?.errors.orEmpty()
                    val galat = daftar.ifEmpty { listOf(h.pesan) }
                    if (_form.value?.sesi == sesi) {
                        _form.update { it?.copy(sibuk = false, galat = galat) }
                    } else {
                        // Formulir sudah ditutup: galat tidak boleh hilang tanpa jejak.
                        kirim(galat.joinToString(" "))
                    }
                }
            }
        }
    }

    /* -------------------------------------------------------------- */
    /* Notifikasi & Urungkan                                           */
    /* -------------------------------------------------------------- */

    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    fun urungkan() {
        val aksi = _notifikasi.value?.urungkan ?: return
        _notifikasi.value = null
        viewModelScope.launch {
            when (aksi) {
                is AksiUrungkan.Tiket -> when (val h = panggil { api.urungkan(UrungkanRequest(aksi.token)) }) {
                    is Hasil.Ok -> kirim(h.data?.message?.takeIf { it.isNotBlank() } ?: "Tindakan diurungkan.")
                    is Hasil.Gagal -> kirim(h.pesan)
                }
                is AksiUrungkan.AjukanKembaliUsulan -> {
                    val h = panggil { api.usulTenggat(UsulTenggatRequest(aksi.projectId, aksi.tanggal, aksi.alasan)) }
                    kirim(if (h is Hasil.Gagal) h.pesan else "Usulan diajukan kembali.")
                    muatUsulan(aksi.projectId)
                    muatTahapan(aksi.projectId)
                }
                is AksiUrungkan.KeputusanUsulan -> {
                    val h = panggil { api.aksiUsulan(AksiUsulanRequest(aksi.id, "undo")) }
                    kirim(if (h is Hasil.Gagal) h.pesan else "Keputusan diurungkan.")
                    muatUsulan(aksi.projectId)
                    muatTahapan(aksi.projectId)
                    segarkanProyekDetail(aksi.projectId)
                }
            }
            muatDaftar()
        }
    }

    private fun kirim(pesan: String, urungkan: AksiUrungkan? = null) {
        _notifikasi.value = Notifikasi(System.nanoTime(), pesan, urungkan)
    }
}

/** Hasil → Bagian dengan pemetaan data; badan kosong dianggap galat ramah. */
internal fun <T, R> Hasil<T>.keBagian(peta: (T) -> R): Bagian<R> = when (this) {
    is Hasil.Ok -> data?.let { Bagian.Siap(peta(it)) } ?: Bagian.Galat("Jawaban server kosong. Muat ulang.")
    is Hasil.Gagal -> Bagian.Galat(pesan)
}

/** Kunci CacheLayar halaman pertama daftar proyek per hari WIB + saringan (uid ditambahkan CacheLayar). */
internal fun kunciPotretDaftar(s: Saringan): String =
    "pemantau:proyek:${Wib.hariIni()}:${s.siklus}:${s.fase.orEmpty()}:${s.cari.trim()}"
