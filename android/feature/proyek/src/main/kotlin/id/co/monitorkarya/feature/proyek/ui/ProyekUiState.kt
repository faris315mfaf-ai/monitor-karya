package id.co.monitorkarya.feature.proyek.ui

import id.co.monitorkarya.feature.proyek.data.DaftarOutputDto
import id.co.monitorkarya.feature.proyek.data.EskalasiDto
import id.co.monitorkarya.feature.proyek.data.LaporanHarianDto
import id.co.monitorkarya.feature.proyek.data.OpsiProyekDto
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.data.RingkasanProyekDto
import id.co.monitorkarya.feature.proyek.data.TahapDto
import id.co.monitorkarya.feature.proyek.data.TahapanDto
import id.co.monitorkarya.feature.proyek.data.UsulanTenggatDto
import id.co.monitorkarya.feature.proyek.data.UsulanTenggatListDto
import id.co.monitorkarya.feature.proyek.domain.dariKunci

/** Bagian data yang dimuat terpisah (detail): memuat, siap, atau galat. */
sealed interface Bagian<out T> {
    data object Memuat : Bagian<Nothing>
    data class Siap<T>(val data: T) : Bagian<T>
    data class Galat(val pesan: String) : Bagian<Nothing>
}

fun <T> Bagian<T>.dataAtauNull(): T? = (this as? Bagian.Siap<T>)?.data

/** Saringan daftar — sama dengan query web (lifecycle, phase, search). */
data class Saringan(
    val siklus: String = "AKTIF",
    /** null = semua tahap. */
    val fase: String? = null,
    val cari: String = "",
) {
    val aktif: Boolean get() = cari.isNotBlank() || fase != null
}

enum class Muat { MEMUAT, SIAP, GALAT }

/** Keadaan layar daftar. */
data class DaftarUi(
    val saringan: Saringan = Saringan(),
    val muat: Muat = Muat.MEMUAT,
    val galat: String? = null,
    val items: List<ProyekDto> = emptyList(),
    val total: Int = 0,
    val halaman: Int = 1,
    val ringkasan: RingkasanProyekDto? = null,
    /** Memuat ulang di latar (daftar lama tetap tampil, diredupkan). */
    val menyegarkan: Boolean = false,
    val memuatLagi: Boolean = false,
    /** Dari server: GET ?options=1 lolos (bukan tebakan klien). */
    val bolehAjukan: Boolean = false,
    /** Id proyek yang sedang disetujui cepat dari antrean. */
    val setujuiCepat: String? = null,
    /** B6: waktu potret Room yang tampil karena server tak terjangkau; null = data segar. */
    val tersimpanPada: Long? = null,
) {
    /** Pengajuan yang menunggu keputusan akun ini (permissions.approve dari server). */
    val antrean: List<ProyekDto> get() = items.filter { it.lifecycle == "DIUSULKAN" && it.permissions.approve }
    val lainnya: List<ProyekDto> get() = items.filterNot { it.lifecycle == "DIUSULKAN" && it.permissions.approve }
    val adaLagi: Boolean get() = items.size < total
}

/** Konfirmasi yang sedang ditanyakan (hanya untuk hapus dan arsip setelah hapus ditolak). */
sealed interface Konfirmasi {
    data object HapusProyek : Konfirmasi

    /** Membawa proyek asal agar arsip tidak pernah mengenai proyek lain (C2 S1). */
    data class ArsipkanProyek(val pesan: String, val proyek: ProyekDto) : Konfirmasi
    data class HapusTahap(val tahap: TahapDto) : Konfirmasi
}

/** Draf tahap di editor tahapan. Tanggal "YYYY-MM-DD" atau kosong. */
data class DrafTahap(
    val id: String? = null,
    val nama: String = "",
    val mulai: String = "",
    val selesai: String = "",
    val status: String = "BELUM_MULAI",
    val catatan: String = "",
)

data class EditorTahapUi(
    val draf: DrafTahap = DrafTahap(),
    val galat: String? = null,
    val sibuk: Boolean = false,
)

data class UsulTenggatUi(
    val tanggal: String = "",
    val alasan: String = "",
    val galatTanggal: String? = null,
    val galatAlasan: String? = null,
    val galatForm: String? = null,
    val sibuk: Boolean = false,
)

/** Keputusan atas usulan tenggat (Direktur entitas/Manajemen/Super Admin). */
data class PutusUsulanUi(
    val usulan: UsulanTenggatDto,
    /** "approve" | "reject". */
    val aksi: String,
    val catatan: String = "",
    val sibuk: Boolean = false,
    val galat: String? = null,
)

/** Keadaan Sheet detail satu proyek. */
data class DetailUi(
    val proyek: ProyekDto,
    /** Mode keputusan pengajuan: "DISETUJUI" | "DITOLAK" | null. */
    val keputusan: String? = null,
    val catatan: String = "",
    /** "decide" | "resubmit" | "delete" | null. */
    val sibuk: String? = null,
    val galat: String? = null,
    val tahapan: Bagian<TahapanDto> = Bagian.Memuat,
    val usulan: Bagian<UsulanTenggatListDto> = Bagian.Memuat,
    val laporan: Bagian<List<LaporanHarianDto>> = Bagian.Memuat,
    val output: Bagian<DaftarOutputDto> = Bagian.Memuat,
    val eskalasi: Bagian<List<EskalasiDto>> = Bagian.Memuat,
    val konfirmasi: Konfirmasi? = null,
    /** Editor tahapan terbuka (Sheet tersendiri). */
    val editorTahap: EditorTahapUi? = null,
    val usulTenggat: UsulTenggatUi? = null,
    val putusUsulan: PutusUsulanUi? = null,
    val sibukUsulan: Boolean = false,
    /** PATCH urutan tahap sedang berjalan — tombol naik/turun dikunci (C2 R4). */
    val sibukUrut: Boolean = false,
    /** Id akun ini (profil sesi) — tombol putus usulan milik sendiri disembunyikan (C2 R1). */
    val penggunaId: String? = null,
) {
    /** Pengajuan/penolakan tidak punya progres, tahapan, laporan, maupun output. */
    val berjalan: Boolean get() = proyek.lifecycle != "DIUSULKAN" && proyek.lifecycle != "DITOLAK"
    val usulanTerbuka: UsulanTenggatDto? get() = usulan.dataAtauNull()?.items?.firstOrNull { it.status == "DIAJUKAN" }
    val usulanTerakhir: UsulanTenggatDto? get() = usulan.dataAtauNull()?.items?.firstOrNull { it.status != "DIAJUKAN" }

    /**
     * Boleh memutus usulan [u]: peran pemutus (canDecide server) dan bukan
     * pengusulnya sendiri — server menolak 403 "Usulan Anda sendiri…".
     */
    fun bolehPutus(u: UsulanTenggatDto): Boolean =
        usulan.dataAtauNull()?.canDecide == true && (penggunaId == null || u.proposedById != penggunaId)
}

/** Keadaan formulir ajukan/ubah proyek. */
data class FormUi(
    /** null = ajukan baru. */
    val proyek: ProyekDto? = null,
    /** Nomor sesi formulir: hasil simpan hanya diterapkan ke formulir asalnya (C2 S2). */
    val sesi: Long = 0,
    val opsi: Bagian<OpsiProyekDto> = Bagian.Memuat,
    val entitasId: String = "",
    val nama: String = "",
    val penjelasan: String = "",
    val tujuan: String = "",
    /** "" = belum ditentukan (dianggap Inisiasi). */
    val fase: String = "",
    val picId: String = "",
    val divisiId: String = "",
    val mulai: String = "",
    val selesai: String = "",
    val terkait: List<String> = emptyList(),
    val siklus: String = "",
    val lewatiPersetujuan: Boolean = false,
    val sibuk: Boolean = false,
    val galat: List<String> = emptyList(),
) {
    val mengubah: Boolean get() = proyek != null
    val opsiData: OpsiProyekDto? get() = opsi.dataAtauNull()
    /**
     * PT pemilik: pilihan pengguna (peran global) atau PT cakupan dari server
     * (peran berlingkup). Pilihan pengguna didahulukan agar tidak tertimpa opsi
     * lama selama opsi PT baru dimuat.
     */
    val pemilikId: String get() = entitasId.ifEmpty { opsiData?.entity?.id.orEmpty() }
    val rantai: List<String> get() = opsiData?.chain.orEmpty()
    val faseAwal: Boolean get() = fase.isEmpty() || fase == "INISIASI"
    val bisaLewati: Boolean get() = !mengubah && rantai.isNotEmpty() && faseAwal
    val melewati: Boolean get() = bisaLewati && lewatiPersetujuan
    val perluEntitas: Boolean get() = !mengubah && opsiData?.entityPinned != true && pemilikId.isEmpty()

    /** Validasi ramah sama dengan web; keputusan akhir tetap di server (422). */
    val sah: Boolean
        get() = nama.trim().length >= 5 && penjelasan.trim().length >= 20 && !perluEntitas && urutanTanggalSah

    val urutanTanggalSah: Boolean
        get() {
            val a = dariKunci(mulai) ?: return true
            val b = dariKunci(selesai) ?: return true
            return b.isAfter(a)
        }
}

/** Aksi "Urungkan" yang ditawarkan snackbar. */
sealed interface AksiUrungkan {
    /** Tiket /api/undo (persetujuan, ajukan ulang, arsip). */
    data class Tiket(val token: String) : AksiUrungkan

    /** Usulan tenggat yang ditarik diajukan kembali (pola web stages.tsx). */
    data class AjukanKembaliUsulan(val projectId: String, val tanggal: String, val alasan: String) : AksiUrungkan

    /** Pemutus mengurungkan keputusan usulan tenggat ≤ 15 menit (PATCH action undo). */
    data class KeputusanUsulan(val id: String, val projectId: String) : AksiUrungkan
}

/** Snackbar satu kali. */
data class Notifikasi(val id: Long, val pesan: String, val urungkan: AksiUrungkan? = null)
