// Laporan harian PIC — daftar entri multi-item (agen A1, 13 Okt 2026).
// Padanan web: src/components/views/daily-input-view.tsx (DailyInputView,
// EntryDesk, EntryCard, EntrySheet, SendBar, LockNotice, UnlockRequestSheet).
//
// Alur: pilih proyek (multi-proyek) → "Tambah entri" (Sheet: judul, pelaksana,
// hasil, status, progres, kendala, eskalasi + keputusan, rencana besok, bukti)
// → kartu entri (ubah/hapus) → "Kirim laporan ke Admin PT" (PUT daily-input
// action=submit; server menggabung entri lewat roll-up) → beku setelah Admin PT
// meneruskan → "Ajukan buka kunci". Seluruh baca/tulis lewat GerbangLaporanPic
// (satu titik sambung outbox, lihat berkas itu).
//
// C5: isian Sheet + proyek/tanggal terpilih bertahan saat proses mati
// (SavedStateHandle, S5); Sheet entri baru yang memegang id lokal berganti ke
// id server begitu TAMBAH terkirim (peta id, T1); hapus entri/bukti dijaga
// dari klik ganda (R6).
//
// G1 (keputusan pemilik 13 Okt 2026): Sheet yang ditutup (Batal/Selesai/
// geser/Kembali) atau ditinggal proses mati dengan perubahan belum tersimpan
// → draf otomatis per (uid, entri/entri baru proyek, tanggal), dipulihkan saat
// dibuka lagi dengan penanda "Draf dipulihkan" + "Buang draf"; tanpa dialog.
// Draf dibuang setelah simpan sukses/antre dan saat keluar akun.
package id.co.monitorkarya.app.ui.laporan

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.app.ui.draf.PESAN_DRAF_TERSIMPAN
import id.co.monitorkarya.app.ui.draf.PencatatDraf
import id.co.monitorkarya.core.data.outbox.IdLokal
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.repo.DrafSunting
import id.co.monitorkarya.core.data.repo.KunciDraf
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.Idempotensi
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ------------------------------------------------------------------
// Status UI tambahan
// ------------------------------------------------------------------

/** Aksi PUT daily-input: simpan draf atau kirim ke Admin PT. */
enum class AksiLaporan(val nilai: String) { SIMPAN("save"), KIRIM("submit") }

/** Tombol footer yang sedang bekerja. */
enum class SibukKirim { SIMPAN, KIRIM, HAPUS }

/** Footer kirim: tombol sibuk + galat terakhir. */
data class KirimUi(val sibuk: SibukKirim? = null, val galat: List<String> = emptyList())

/** Sheet "Tambah/Ubah entri". */
data class LembarEntri(
    /** Entri yang sedang diubah; null = tambah entri baru. */
    val entriId: String?,
    /** Id setelah tersimpan — membuka bagian bukti. */
    val idTersimpan: String?,
    val isian: IsianEntri,
    val galat: List<String> = emptyList(),
    val sibuk: Boolean = false,
    val unggah: Boolean = false,
    val hapusBuktiId: String? = null,
    /**
     * Kunci idempotensi POST entri baru (gelombang E): dibuat SEKALI saat Sheet
     * tambah dibuka dan dipakai setiap kali "Simpan" ditekan selama entri belum
     * tersimpan — klik ganda/ulang setelah galat tidak menggandakan entri.
     */
    val kunciTambah: String? = null,
    /**
     * Isian terakhir yang sama dengan server/perangkat (saat dibuka atau usai
     * simpan). null (Sheet dipulihkan setelah proses mati) = dibandingkan dengan
     * isian kosong.
     */
    val isianAwal: IsianEntri? = null,
    /**
     * E2E-R2 N2: bukti yang baru sukses diunggah dari Sheet ini (jawaban
     * POST upload). Digabung dengan bukti hasil muat ulang supaya bukti tetap
     * tampil walau muat ulang gagal (dulu Sheet tetap "Belum ada bukti" dan
     * pengguna bisa mengunggah ganda). Tidak disimpan ke SavedStateHandle.
     */
    val buktiBaru: List<Bukti> = emptyList(),
    /**
     * G1: Sheet dibuka dengan draf otomatis (epoch millis draf disimpan) —
     * penanda "Draf dipulihkan" + aksi "Buang draf". null = tanpa draf.
     */
    val drafPulih: Long? = null,
) {
    /** Bukti server [dariServer] + unggahan Sheet yang belum termuat ulang. */
    fun gabungBukti(dariServer: List<Bukti>): List<Bukti> =
        dariServer + buktiBaru.filter { b -> dariServer.none { it.id == b.id } }

    /**
     * Ada perubahan belum tersimpan — E2E-1 #5: Sheet tidak boleh tertutup oleh
     * geser/scrim/Kembali (perubahan terbuang diam-diam); tutup lewat Batal/Simpan.
     */
    val berubah: Boolean
        get() = isian != (isianAwal ?: IsianEntri())
}

/** Sheet "Ajukan buka kunci". */
data class LembarBukaKunci(
    val reportId: String,
    val namaProyek: String,
    val kataHari: String,
    val alasan: String = "",
    val sibuk: Boolean = false,
    val galat: String? = null,
) {
    val alasanCukup: Boolean get() = alasan.trim().length >= 10
}

/** Snackbar satu-kali + undoToken bila server mengirim. */
data class NotifikasiLaporan(val id: Long, val pesan: String, val undoToken: String? = null)

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class LaporanViewModel @Inject constructor(
    private val gerbang: GerbangLaporanPic,
    private val penyiap: PenyiapBukti,
    private val simpanan: SavedStateHandle,
    draf: DrafSunting,
) : ViewModel() {

    /** G1: draf otomatis Sheet entri (antrean tulis berurutan + jeda saat mengetik). */
    private val pencatat = PencatatDraf(viewModelScope, draf)

    private val _state = MutableStateFlow<LaporanUiState>(LaporanUiState.Memuat)

    /** Meja laporan satu hari. */
    val state: StateFlow<LaporanUiState> = _state.asStateFlow()

    private val _tanggal = MutableStateFlow<String?>(simpanan[SIMPAN_TANGGAL])

    /** Tanggal lampau yang dibuka lewat buka kunci ("YYYY-MM-DD"); null = hari ini. */
    val tanggal: StateFlow<String?> = _tanggal.asStateFlow()

    private val _terpilih = MutableStateFlow<String?>(simpanan[SIMPAN_TERPILIH])

    /** Proyek yang meja entrinya tampil. */
    val terpilih: StateFlow<String?> = _terpilih.asStateFlow()

    /** Entri dari server / potret Room, sebelum ditumpangi antrean. */
    private val _entri = MutableStateFlow<EntriUiState>(EntriUiState.Memuat)

    /** Seluruh pesan antrean laporan harian (MENUNGGU + GAGAL), FIFO. */
    private val antrean: StateFlow<List<PesanOutbox>> =
        gerbang.amatiAntrean().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /**
     * Daftar entri proyek terpilih, DITUMPANGI perubahan yang masih di antrean
     * (entri luring, ubah/hapus tertunda, bukti menunggu unggah) — B2.
     */
    val entri: StateFlow<EntriUiState> = combine(_entri, antrean, _terpilih, _state) { e, pesan, pid, st ->
        val desk = (st as? LaporanUiState.Siap)?.desk
        if (e !is EntriUiState.Siap || pid == null || desk == null) {
            e
        } else {
            val kunci = KunciOutbox.laporanHarian(pid, desk.tanggalKunci)
            EntriUiState.Siap(tumpangkanAntrean(e.hari, pesan.filter { it.kunci == kunci }))
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, EntriUiState.Memuat)

    private val _tersimpanMeja = MutableStateFlow<Long?>(null)
    private val _tersimpanEntri = MutableStateFlow<Long?>(null)

    /**
     * Kapan potret Room yang sedang tampil disimpan (epoch millis); null = data
     * segar dari server. Layar menampilkan "Luring · data tersimpan HH.MM".
     */
    val tersimpanPada: StateFlow<Long?> = combine(_tersimpanMeja, _tersimpanEntri) { a, b ->
        listOfNotNull(a, b).minOrNull()
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Dipulihkan dari SavedStateHandle setelah proses mati (C5-S5). */
    private val _lembar = MutableStateFlow(lembarDariJson(simpanan[SIMPAN_LEMBAR]))

    /** Sheet entri yang terbuka; null = tertutup. */
    val lembar: StateFlow<LembarEntri?> = _lembar.asStateFlow()

    private val _kirim = MutableStateFlow(KirimUi())

    /** Footer kirim laporan. */
    val kirim: StateFlow<KirimUi> = _kirim.asStateFlow()

    private val _hapusSibuk = MutableStateFlow<String?>(null)

    /** Id entri yang sedang dihapus. */
    val hapusSibuk: StateFlow<String?> = _hapusSibuk.asStateFlow()

    private val _galatAksi = MutableStateFlow<String?>(null)

    /** Galat hapus entri (di bawah daftar). */
    val galatAksi: StateFlow<String?> = _galatAksi.asStateFlow()

    private val _bukaKunci = MutableStateFlow<LembarBukaKunci?>(null)

    /** Sheet ajukan buka kunci. */
    val bukaKunci: StateFlow<LembarBukaKunci?> = _bukaKunci.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiLaporan?>(null)

    /** Snackbar satu-kali. */
    val notifikasi: StateFlow<NotifikasiLaporan?> = _notifikasi.asStateFlow()

    private val cacheUrl = mutableMapOf<String, String>()

    init {
        // C5-S5: catat isian Sheet + pilihan layar setiap kali berubah.
        viewModelScope.launch { _lembar.collect { simpanan[SIMPAN_LEMBAR] = it?.let(::lembarKeJson) } }
        viewModelScope.launch { _terpilih.collect { simpanan[SIMPAN_TERPILIH] = it } }
        viewModelScope.launch { _tanggal.collect { simpanan[SIMPAN_TANGGAL] = it } }
        // G1: setiap perubahan Sheet dicatat sebagai draf (ditulis setelah jeda)
        // — isian selamat walau proses mati sebelum Sheet ditutup.
        viewModelScope.launch { _lembar.collect { l -> if (l != null && !l.sibuk) catatDraf(l, segera = false) } }
        // C5-T1: TAMBAH entri terkirim → Sheet yang masih memegang id lokal
        // berganti ke id server (bukti berikutnya langsung daring, bukan antre).
        viewModelScope.launch {
            gerbang.amatiPetaId().collect { peta ->
                _lembar.update { l ->
                    val idServer = l?.idTersimpan?.takeIf(IdLokal::adalah)?.let(peta::get)
                    if (l == null || idServer == null) {
                        l
                    } else {
                        l.copy(idTersimpan = idServer, entriId = l.entriId?.let { peta[it] ?: it })
                    }
                }
            }
        }
        muat()
        // Pesan antrean laporan yang hilang = terkirim (atau dibuang): muat
        // ulang data server diam-diam supaya entri lokal berganti versi server.
        viewModelScope.launch {
            var sebelumnya: Set<Long>? = null
            antrean.collect { daftar ->
                val kini = daftar.map { it.id }.toSet()
                val lama = sebelumnya
                sebelumnya = kini
                if (lama != null && (lama - kini).isNotEmpty() && _state.value is LaporanUiState.Siap) segarkan()
            }
        }
    }

    // ------------------------------------------------------------ muat

    /** Menarik meja + entri; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = LaporanUiState.Memuat
            muatMeja(diam = false)
        }
    }

    fun ulang() = muat()

    /**
     * C5-T4: layar kembali tampil (ON_RESUME) setelah lewat tengah malam WIB —
     * meja "hari ini" yang masih memegang tanggal kemarin dimuat ulang supaya
     * entri baru tidak ditulis ke tanggal kemarin.
     */
    fun segarkanBilaHariBerganti() {
        val desk = deskAktif() ?: return
        if (_tanggal.value == null && desk.tanggalKunci != Wib.hariIni().toString()) muat()
    }

    /** Buka tanggal lain yang sedang dibuka ([kunci] null/hari ini = kembali ke hari ini). */
    fun pilihTanggal(kunci: String?) {
        val hariIni = (state.value as? LaporanUiState.Siap)?.desk?.hariIniKunci
        _tanggal.value = kunci?.takeIf { it != hariIni }
        _kirim.value = KirimUi()
        muat()
    }

    /** Pilih proyek yang entrinya ditampilkan (multi-proyek). */
    fun pilih(projectId: String) {
        if (_terpilih.value == projectId) return
        // E2E-3 B10: hanya proyek yang ada di meja yang boleh dipilih.
        if (deskAktif()?.proyek?.none { it.id == projectId } == true) return
        _terpilih.value = projectId
        _kirim.value = KirimUi()
        _galatAksi.value = null
        tugasPilih?.cancel()
        tugasPilih = viewModelScope.launch { muatEntri(diam = false) }
    }

    /** Muat entri karena pilihan pengguna; dibatalkan bila pengguna memilih lagi. */
    private var tugasPilih: kotlinx.coroutines.Job? = null

    /** Muat ulang meja dan entri tanpa kerangka (setelah tulis). */
    private suspend fun segarkan() {
        muatMeja(diam = true)
    }

    private suspend fun muatMeja(diam: Boolean) {
        when (val hasil = gerbang.meja(_tanggal.value)) {
            is HasilLaporan.Sukses -> {
                val desk = hasil.data
                _tersimpanMeja.value = hasil.tersimpanPada
                _state.value = LaporanUiState.Siap(desk)
                val kini = _terpilih.value
                if (kini == null || desk.proyek.none { it.id == kini }) {
                    _terpilih.value = (
                        desk.proyek.firstOrNull { it.laporan?.terkirimIso == null && !it.terkunci }
                            ?: desk.proyek.firstOrNull()
                        )?.id
                }
                muatEntri(diam = diam && _entri.value is EntriUiState.Siap)
            }
            is HasilLaporan.Gagal -> if (!diam || _state.value !is LaporanUiState.Siap) {
                _state.value = LaporanUiState.Galat(hasil.galat.pesanTampil())
            } else {
                tampilkan(hasil.galat.pesanTampil())
            }
            is HasilLaporan.Antre -> Unit
        }
    }

    private suspend fun muatEntri(diam: Boolean) {
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        if (!diam) _entri.value = EntriUiState.Memuat
        val hasil = gerbang.entri(pid, desk.tanggalKunci)
        // E2E-3 B10: jawaban yang tiba setelah pengguna memilih proyek lain (atau
        // tanggal lain) dibuang — dulu panel "Entri hari ini" bisa menampilkan
        // entri proyek A sementara baris yang disorot proyek B.
        if (_terpilih.value != pid || deskAktif()?.tanggalKunci != desk.tanggalKunci) return
        _entri.value = when (hasil) {
            is HasilLaporan.Sukses -> {
                _tersimpanEntri.value = hasil.tersimpanPada
                EntriUiState.Siap(hasil.data)
            }
            is HasilLaporan.Gagal -> EntriUiState.Galat(hasil.galat.pesanTampil())
            is HasilLaporan.Antre -> _entri.value
        }
    }

    fun ulangEntri() {
        viewModelScope.launch { muatEntri(diam = false) }
    }

    // ------------------------------------------------------------ Sheet entri

    /**
     * Buka Sheet entri baru; pelaksana terisi nama akun (bisa diubah). G1:
     * draf entri baru proyek + tanggal ini (bila ada) dipulihkan lebih dulu.
     */
    fun bukaTambah() {
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        val kunciTambah = Idempotensi.kunciBaru()
        viewModelScope.launch {
            val kosong = LembarEntri(
                entriId = null,
                idTersimpan = null,
                isian = IsianEntri(),
                kunciTambah = kunciTambah,
                isianAwal = IsianEntri(),
            )
            val draf = pencatat.ambil(kunciDrafLembar(kosong, pid, desk.tanggalKunci))
            if (_terpilih.value != pid || deskAktif()?.tanggalKunci != desk.tanggalKunci) return@launch
            _lembar.value = pulihkanLembar(kosong, draf)
            val nama = gerbang.namaPengguna()
            _lembar.update { l ->
                if (l != null && l.entriId == null && l.idTersimpan == null && l.kunciTambah == kunciTambah) {
                    // Isian otomatis bukan perubahan pengguna.
                    l.copy(
                        isian = if (l.isian.pelaksana.isEmpty()) l.isian.copy(pelaksana = nama) else l.isian,
                        isianAwal = (l.isianAwal ?: IsianEntri()).copy(pelaksana = nama),
                    )
                } else {
                    l
                }
            }
        }
    }

    /** Buka Sheet mengubah entri [id]; G1: draf suntingan entri ini dipulihkan bila ada. */
    fun bukaUbah(id: String) {
        val e = entriAktif().firstOrNull { it.id == id } ?: return
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        val isian = e.keIsian()
        val lembar = LembarEntri(entriId = e.id, idTersimpan = e.id, isian = isian, isianAwal = isian)
        viewModelScope.launch {
            val draf = if (terkunciKini()) null else pencatat.ambil(kunciDrafLembar(lembar, pid, desk.tanggalKunci))
            if (_terpilih.value != pid) return@launch
            _lembar.value = pulihkanLembar(lembar, draf)
        }
    }

    /** G1: "Buang draf" — isian kembali ke versi tersimpan, draf dihapus. */
    fun buangDraf() {
        _lembar.update { l -> l?.let(::buangDrafLembar) }
        _lembar.value?.let { catatDraf(it, segera = true) }
    }

    fun ubahIsian(isian: IsianEntri) {
        _lembar.update { l -> l?.copy(isian = isian, galat = galatSetelahUbah(l.galat, l.isian, isian)) }
    }

    /**
     * Tutup Sheet (Batal/Selesai/geser/Kembali). G1: perubahan belum tersimpan
     * TIDAK dibuang dan tidak memunculkan dialog — ditulis sebagai draf.
     */
    fun tutupLembar() {
        val l = _lembar.value ?: return
        if (l.sibuk) return // simpan masih berjalan
        _lembar.value = null
        if (catatDraf(l, segera = true)) tampilkan(PESAN_DRAF_TERSIMPAN)
    }

    /** Tulis/buang draf [l]; true bila draf ditulis. Tanpa proyek/meja aktif: tidak apa-apa. */
    private fun catatDraf(l: LembarEntri, segera: Boolean): Boolean {
        val pid = _terpilih.value ?: return false
        val desk = deskAktif() ?: return false
        val kunci = kunciDrafLembar(l, pid, desk.tanggalKunci)
        val json = isiDrafLembar(l, terkunciKini())
        if (segera) pencatat.segera(kunci, json) else pencatat.catat(kunci, json)
        return json != null
    }

    private fun buangDrafSegera(kunci: KunciDraf) = pencatat.segera(kunci, null)

    /** Simpan entri: baru → Sheet tetap terbuka agar bukti bisa dilampirkan; ubah → tutup. */
    fun simpanEntri() {
        val l = _lembar.value ?: return
        if (l.sibuk) return // klik ganda: kiriman pertama masih berjalan
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        val masalah = validasiEntri(l.isian)
        if (masalah.isNotEmpty()) {
            _lembar.value = l.copy(galat = masalah)
            return
        }
        val lama = l.idTersimpan?.let { id -> entriAktif().firstOrNull { it.id == id } }
        // G1: draf Sheet ini dibuang begitu simpan sukses/diantre.
        val kunciDraf = kunciDrafLembar(l, pid, desk.tanggalKunci)
        viewModelScope.launch {
            _lembar.value = l.copy(sibuk = true, galat = emptyList())
            when (val hasil = gerbang.simpanEntri(pid, desk.tanggalKunci, l.idTersimpan, lama, l.isian, l.kunciTambah)) {
                is HasilLaporan.Sukses -> {
                    buangDrafSegera(kunciDraf)
                    if (l.idTersimpan != null) {
                        _lembar.value = null
                        tampilkan("Perubahan entri tersimpan")
                    } else {
                        _lembar.update { it?.copy(idTersimpan = hasil.data.id, sibuk = false, isianAwal = it.isian) }
                        tampilkan("Entri ditambahkan")
                    }
                    segarkan()
                }
                is HasilLaporan.Antre -> {
                    buangDrafSegera(kunciDraf)
                    if (l.idTersimpan == null && hasil.idLokal != null) {
                        // Entri baru tersimpan di perangkat: Sheet tetap terbuka agar
                        // bukti bisa dilampirkan (ikut antre di belakang entrinya).
                        _lembar.update { it?.copy(idTersimpan = hasil.idLokal, sibuk = false, isianAwal = it.isian) }
                    } else {
                        _lembar.value = null
                    }
                    tampilkan(hasil.pesan)
                }
                is HasilLaporan.Gagal -> tanganiGagalLembar(hasil.galat)
            }
        }
    }

    /** Unggah bukti ke entri yang sudah tersimpan (foto dikompres dulu). */
    fun unggahBukti(uri: Uri) {
        val l = _lembar.value ?: return
        if (l.unggah) return // klik ganda: unggahan pertama masih berjalan
        val taskId = l.idTersimpan ?: return
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        _lembar.update { it?.copy(unggah = true, galat = emptyList()) }
        viewModelScope.launch {
            val berkas = try {
                penyiap.siapkan(uri)
            } catch (e: CancellationException) {
                throw e
            } catch (e: GalatBerkas) {
                _lembar.update { it?.copy(unggah = false, galat = listOf(e.message.orEmpty())) }
                return@launch
            } catch (e: Exception) {
                _lembar.update { it?.copy(unggah = false, galat = listOf("Berkas tidak dapat dibaca. Pilih ulang berkasnya.")) }
                return@launch
            }
            when (val hasil = gerbang.unggahBukti(taskId, berkas, pid, desk.tanggalKunci)) {
                is HasilLaporan.Sukses -> {
                    val baru = hasil.data
                    _lembar.update { l ->
                        l?.copy(unggah = false, buktiBaru = if (baru != null) l.buktiBaru + baru else l.buktiBaru)
                    }
                    if (baru != null) tambahBuktiKeEntri(taskId, baru)
                    tampilkan("Bukti terlampir")
                    segarkan()
                }
                is HasilLaporan.Antre -> {
                    _lembar.update { it?.copy(unggah = false) }
                    tampilkan(hasil.pesan)
                }
                is HasilLaporan.Gagal -> {
                    _lembar.update { it?.copy(unggah = false) }
                    tanganiGagalLembar(hasil.galat)
                }
            }
        }
    }

    /** Hapus satu bukti entri (konfirmasi di layar). */
    fun hapusBukti(id: String) {
        // C5-R6: penjaga klik ganda disetel SINKRON sebelum launch.
        if (_lembar.value?.hapusBuktiId != null) return
        _lembar.update { it?.copy(hapusBuktiId = id, galat = emptyList()) }
        viewModelScope.launch {
            when (val hasil = gerbang.hapusBukti(id)) {
                is HasilLaporan.Sukses -> {
                    cacheUrl.remove(id)
                    _lembar.update { l -> l?.copy(hapusBuktiId = null, buktiBaru = l.buktiBaru.filterNot { it.id == id }) }
                    hapusBuktiDariEntri(id)
                    tampilkan("Bukti dihapus")
                    segarkan()
                }
                is HasilLaporan.Antre -> _lembar.update { it?.copy(hapusBuktiId = null) }
                is HasilLaporan.Gagal -> {
                    _lembar.update { it?.copy(hapusBuktiId = null) }
                    tanganiGagalLembar(hasil.galat)
                }
            }
        }
    }

    /** N2: cerminkan bukti terunggah ke daftar entri lokal (kartu + Sheet) tanpa menunggu muat ulang. */
    private fun tambahBuktiKeEntri(taskId: String, bukti: Bukti) {
        val siap = _entri.value as? EntriUiState.Siap ?: return
        _entri.value = siap.copy(
            hari = siap.hari.copy(
                entri = siap.hari.entri.map { e ->
                    if (e.id == taskId && e.bukti.none { it.id == bukti.id }) e.copy(bukti = e.bukti + bukti) else e
                },
            ),
        )
    }

    private fun hapusBuktiDariEntri(id: String) {
        val siap = _entri.value as? EntriUiState.Siap ?: return
        _entri.value = siap.copy(
            hari = siap.hari.copy(entri = siap.hari.entri.map { e -> e.copy(bukti = e.bukti.filterNot { it.id == id }) }),
        )
    }

    private suspend fun tanganiGagalLembar(galat: ApiError) {
        val g = petakanGalat(galat)
        _lembar.update { it?.copy(sibuk = false, galat = g.daftarPesan()) }
        // 409: laporan baru saja dibekukan/dikunci — muat ulang agar tampilan ikut terkunci.
        if (g is GalatTulis.Beku) segarkan()
    }

    // ------------------------------------------------------------ daftar entri

    /** Hapus entri beserta buktinya (konfirmasi di layar). */
    fun hapusEntri(id: String) {
        if (_hapusSibuk.value != null) return // C5-R6: hapus pertama masih berjalan
        val e = entriAktif().firstOrNull { it.id == id } ?: return
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        _hapusSibuk.value = id
        _galatAksi.value = null
        viewModelScope.launch {
            when (val hasil = gerbang.hapusEntri(e, pid, desk.tanggalKunci)) {
                is HasilLaporan.Sukses -> {
                    tampilkan("Entri dihapus")
                    segarkan()
                }
                is HasilLaporan.Antre -> tampilkan(hasil.pesan)
                is HasilLaporan.Gagal -> {
                    val g = petakanGalat(hasil.galat)
                    _galatAksi.value = g.pesan
                    if (g is GalatTulis.Beku) segarkan()
                }
            }
            _hapusSibuk.value = null
        }
    }

    // ------------------------------------------------------------ kirim laporan

    /** Simpan draf / kirim semua entri sebagai satu laporan (konfirmasi kirim di layar). */
    fun kirimLaporan(aksi: AksiLaporan) {
        if (_kirim.value.sibuk != null) return // klik ganda: kiriman pertama masih berjalan
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        val daftar = entriAktif()
        if (daftar.isEmpty()) return
        val nama = desk.proyek.firstOrNull { it.id == pid }?.nama.orEmpty()
        viewModelScope.launch {
            _kirim.value = KirimUi(sibuk = if (aksi == AksiLaporan.KIRIM) SibukKirim.KIRIM else SibukKirim.SIMPAN)
            when (val hasil = gerbang.kirimLaporan(pid, nama, desk.tanggalKunci, aksi, gabungNarasi(daftar))) {
                is HasilLaporan.Sukses -> {
                    _kirim.value = KirimUi()
                    tampilkan(
                        if (aksi == AksiLaporan.KIRIM) "Laporan terkirim ke Admin PT" else "Draf tersimpan",
                        hasil.undoToken,
                    )
                    segarkan()
                }
                is HasilLaporan.Antre -> {
                    _kirim.value = KirimUi()
                    tampilkan(hasil.pesan)
                }
                is HasilLaporan.Gagal -> {
                    val g = petakanGalat(hasil.galat)
                    _kirim.value = KirimUi(galat = g.daftarPesan())
                    if (g is GalatTulis.Beku) segarkan()
                }
            }
        }
    }

    /** Hapus laporan ringkas (entri tetap ada). */
    fun hapusLaporan() {
        val pid = _terpilih.value ?: return
        val desk = deskAktif() ?: return
        viewModelScope.launch {
            _kirim.value = KirimUi(sibuk = SibukKirim.HAPUS)
            when (val hasil = gerbang.hapusLaporan(pid, desk.tanggalKunci)) {
                is HasilLaporan.Sukses -> {
                    _kirim.value = KirimUi()
                    tampilkan("Laporan dihapus")
                    segarkan()
                }
                is HasilLaporan.Antre -> _kirim.value = KirimUi()
                is HasilLaporan.Gagal -> {
                    val g = petakanGalat(hasil.galat)
                    _kirim.value = KirimUi(galat = g.daftarPesan())
                    if (g is GalatTulis.Beku) segarkan()
                }
            }
        }
    }

    // ------------------------------------------------------------ buka kunci

    /** Buka Sheet ajukan buka kunci untuk laporan proyek terpilih. */
    fun bukaAjukan() {
        val desk = deskAktif() ?: return
        val p = desk.proyek.firstOrNull { it.id == _terpilih.value } ?: return
        val reportId = p.laporan?.id ?: ((_entri.value as? EntriUiState.Siap)?.hari?.reportId) ?: return
        _bukaKunci.value = LembarBukaKunci(
            reportId = reportId,
            namaProyek = p.nama,
            kataHari = if (desk.hariIni) "hari ini" else "tanggal ${tanggalKunciPendek(desk.tanggalKunci)}",
        )
    }

    fun ubahAlasan(alasan: String) {
        _bukaKunci.update { it?.copy(alasan = alasan.take(500), galat = null) }
    }

    fun tutupAjukan() {
        _bukaKunci.value = null
    }

    fun ajukanBukaKunci() {
        val b = _bukaKunci.value ?: return
        if (!b.alasanCukup) return
        viewModelScope.launch {
            _bukaKunci.value = b.copy(sibuk = true, galat = null)
            when (val hasil = gerbang.ajukanBukaKunci(b.reportId, b.alasan)) {
                is HasilLaporan.Sukses -> {
                    _bukaKunci.value = null
                    tampilkan("Buka kunci diajukan. Anda diberi tahu setelah diputuskan.")
                    segarkan()
                }
                is HasilLaporan.Antre -> _bukaKunci.value = null
                is HasilLaporan.Gagal -> _bukaKunci.update { it?.copy(sibuk = false, galat = hasil.galat.pesanTampil()) }
            }
        }
    }

    // ------------------------------------------------------------ snackbar & Urungkan

    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /** "Urungkan" dari snackbar — POST /api/undo dengan tiket terakhir. */
    fun urungkan(token: String) {
        viewModelScope.launch {
            when (val hasil = gerbang.urungkan(token)) {
                is HasilLaporan.Sukses -> {
                    tampilkan(hasil.data.ifBlank { "Tindakan diurungkan" })
                    segarkan()
                }
                is HasilLaporan.Gagal -> tampilkan(hasil.galat.pesanTampil())
                is HasilLaporan.Antre -> Unit
            }
        }
    }

    /** Tautan buka bukti (luar langsung; berkas lewat URL bertanda, di-cache sesi layar). */
    suspend fun urlBukti(bukti: Bukti): String? {
        bukti.tautan?.let { return it }
        // Bukti yang masih di antrean belum punya alamat server.
        if (bukti.statusKirim != null || idOutboxBukti(bukti.id) != null) return null
        cacheUrl[bukti.id]?.let { return it }
        return (gerbang.urlBukti(bukti.id) as? HasilLaporan.Sukses)?.data?.also { cacheUrl[bukti.id] = it }
    }

    // ------------------------------------------------------------ pembantu

    private fun deskAktif(): DeskLaporan? = (_state.value as? LaporanUiState.Siap)?.desk

    /** Laporan proyek terpilih terkunci/beku (Sheet hanya baca) — sama dengan layar. */
    private fun terkunciKini(): Boolean {
        val p = deskAktif()?.proyek?.firstOrNull { it.id == _terpilih.value }
        val hari = (_entri.value as? EntriUiState.Siap)?.hari
        return (p?.terkunci ?: false) || (hari?.terkunci ?: false)
    }

    private fun entriAktif(): List<Entri> = (entri.value as? EntriUiState.Siap)?.hari?.entri.orEmpty()

    private fun tampilkan(pesan: String, undoToken: String? = null) {
        _notifikasi.value = NotifikasiLaporan(id = System.nanoTime(), pesan = pesan, undoToken = undoToken)
    }
}
