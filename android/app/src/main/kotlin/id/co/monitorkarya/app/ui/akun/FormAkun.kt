// Logika murni wizard "Tambah akun" / "Ubah data akun" meja akun Admin PT
// (BUG-03). Padanan web: src/components/companies/account-sheet.tsx
// (AccountForm: errors + save) dan aturan server
// src/app/api/companies/users/route.ts + src/lib/companies.ts (readPosition,
// createAccount, USERNAME_RE, isValidEmail, format telepon PATCH).
//
// Sengaja tanpa Compose/Android supaya bisa diuji JVM: validasi tiap langkah,
// pemetaan badan POST/PATCH, dan pemetaan galat server ke langkah wizard.
package id.co.monitorkarya.app.ui.akun

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.dto.AkunBaruRequest
import id.co.monitorkarya.core.network.dto.AkunUbahRequest
import java.io.IOException
import java.text.Normalizer

/** Mode wizard: buat akun baru (POST) atau ubah data akun (PATCH). */
enum class ModeFormAkun { BARU, UBAH }

/** Langkah wizard: identitas -> posisi/divisi -> tinjau. */
enum class LangkahAkun(val judul: String) {
    IDENTITAS("Identitas"),
    POSISI("Posisi"),
    TINJAU("Tinjau"),
}

/** Medan yang bisa bergalat (untuk penanda isError + teks bantu di medannya). */
enum class MedanAkun { NAMA, USERNAME, EMAIL, JABATAN, TELEPON, PERAN, DIVISI_BARU, PROYEK_BARU, PERUBAHAN }

data class GalatMedan(val medan: MedanAkun, val pesan: String)

/** Nilai pilihan "Divisi baru…"/"Proyek baru…" (padanan "__new__" web). */
internal const val PILIH_BARU = "__baru__"

/** Satu posisi yang bisa dipilih (POSITION_OPTIONS src/lib/constants.ts). */
data class OpsiPosisi(val peran: String, val label: String, val petunjuk: String)

internal val OPSI_POSISI = listOf(
    OpsiPosisi("ADMIN_PT", "Admin PT", "Mengisi & meneruskan laporan perusahaan"),
    OpsiPosisi("KEPALA_DIVISI", "Kepala divisi", "Capaian mingguan divisinya"),
    OpsiPosisi("PIC_PROYEK", "Manager proyek", "Laporan harian proyek yang dipegang"),
    OpsiPosisi("DIREKTUR_ENTITAS", "Direktur perusahaan", "Mengawasi & menyetujui di perusahaannya"),
)

/** Posisi perusahaan yang boleh dibuat pemegang meja (urut seperti web). */
internal fun posisiBoleh(peranKelola: Set<String>): List<OpsiPosisi> =
    OPSI_POSISI.filter { it.peran in peranKelola }

internal fun labelPosisi(peran: String): String =
    OPSI_POSISI.firstOrNull { it.peran == peran }?.label ?: labelPeran(peran)

/** USERNAME_RE src/lib/companies.ts. */
private val POLA_USERNAME = Regex("^[a-z0-9][a-z0-9._-]{2,31}$")

/** isValidEmail src/lib/companies.ts. */
private val POLA_EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

/** Format telepon PATCH /api/companies/users (sama dengan /api/profile). */
private val POLA_TELEPON = Regex("^\\+?[0-9\\s-]{8,20}$")

internal const val MAKS_NAMA = 120
internal const val MAKS_JABATAN = 120

internal fun usernameSah(u: String): Boolean = POLA_USERNAME.matches(u)

internal fun emailSah(e: String): Boolean = POLA_EMAIL.matches(e)

internal fun teleponSah(t: String): Boolean = POLA_TELEPON.matches(t)

/** slugify web (src/lib/accounts.ts): huruf kecil, NFKD, hanya a-z0-9, maks 24. */
internal fun slugUsername(nama: String): String =
    Normalizer.normalize(nama.lowercase(), Normalizer.Form.NFKD)
        .replace(Regex("[^a-z0-9]+"), "")
        .take(24)

/**
 * Isian wizard. Untuk divisi/proyek: "" = belum ditentukan (baru) atau tidak
 * diubah (ubah), id = yang sudah ada, [PILIH_BARU] = buat baru dari namanya.
 */
data class FormAkun(
    val mode: ModeFormAkun = ModeFormAkun.BARU,
    /** Id akun yang diubah (mode UBAH). */
    val idAkun: String? = null,
    val langkah: LangkahAkun = LangkahAkun.IDENTITAS,
    val nama: String = "",
    val username: String = "",
    val usernameDisentuh: Boolean = false,
    val email: String = "",
    val jabatan: String = "",
    val telepon: String = "",
    val peran: String = "",
    val divisi: String = "",
    val namaDivisiBaru: String = "",
    val proyek: String = "",
    val namaProyekBaru: String = "",
    /** Keanggotaan divisi (memberDivisionId) — hanya mode BARU; "" = tanpa divisi. */
    val anggotaDivisi: String = "",
    /** Langkah yang sudah dicoba dilewati — galatnya baru ditampilkan setelah ini. */
    val dicoba: Set<LangkahAkun> = emptySet(),
) {

    /** Nama berubah: username ikut nama selama belum disentuh (web: slugify). */
    fun denganNama(n: String): FormAkun =
        copy(nama = n, username = if (usernameDisentuh) username else slugUsername(n))

    fun denganUsername(u: String): FormAkun = copy(username = u.lowercase(), usernameDisentuh = true)

    /** Ganti posisi melepas pilihan divisi/proyek (web: changeEntity/setRole). */
    fun denganPeran(p: String): FormAkun =
        if (p == peran) this else copy(peran = p, divisi = "", namaDivisiBaru = "", proyek = "", namaProyekBaru = "")

    /** Galat langkah ini ditampilkan bila langkahnya sudah pernah dicoba dilewati. */
    fun tampilkanGalat(l: LangkahAkun = langkah): Boolean = l in dicoba
}

/** Isian awal mode UBAH dari baris akun. */
internal fun formDariAkun(akun: AkunBaris): FormAkun = FormAkun(
    mode = ModeFormAkun.UBAH,
    idAkun = akun.id,
    nama = akun.nama,
    username = akun.username.orEmpty(),
    usernameDisentuh = true,
    email = akun.email.orEmpty(),
    jabatan = akun.jabatan.orEmpty(),
    telepon = akun.telepon.orEmpty(),
    peran = akun.peran,
)

/** Galat satu langkah (kosong = boleh lanjut). [peranBoleh] = manageableRoles. */
internal fun galatLangkah(form: FormAkun, langkah: LangkahAkun, peranBoleh: Set<String>): List<GalatMedan> =
    when (langkah) {
        LangkahAkun.IDENTITAS -> buildList {
            val nama = form.nama.trim()
            if (nama.isEmpty()) {
                add(GalatMedan(MedanAkun.NAMA, "Nama wajib diisi."))
            } else if (nama.length > MAKS_NAMA) {
                add(GalatMedan(MedanAkun.NAMA, "Nama maksimal $MAKS_NAMA karakter."))
            }
            if (!usernameSah(form.username.trim())) {
                add(GalatMedan(MedanAkun.USERNAME, "Username 3–32 huruf kecil atau angka; boleh titik, garis bawah, strip."))
            }
            val email = form.email.trim()
            if (email.isEmpty() && form.mode == ModeFormAkun.UBAH) {
                add(GalatMedan(MedanAkun.EMAIL, "Email wajib diisi."))
            } else if (email.isNotEmpty() && !emailSah(email)) {
                add(GalatMedan(MedanAkun.EMAIL, "Format email belum benar."))
            }
            if (form.jabatan.trim().length > MAKS_JABATAN) {
                add(GalatMedan(MedanAkun.JABATAN, "Jabatan maksimal $MAKS_JABATAN karakter."))
            }
            val telepon = form.telepon.trim()
            if (telepon.isNotEmpty() && !teleponSah(telepon)) {
                add(GalatMedan(MedanAkun.TELEPON, "Nomor telepon tidak valid. Gunakan 8–20 angka, boleh diawali +."))
            }
        }
        LangkahAkun.POSISI -> buildList {
            if (form.peran.isBlank() || form.peran !in peranBoleh) {
                add(GalatMedan(MedanAkun.PERAN, "Pilih posisi akun."))
            }
            if (form.peran == "KEPALA_DIVISI" && form.divisi == PILIH_BARU && form.namaDivisiBaru.isBlank()) {
                add(GalatMedan(MedanAkun.DIVISI_BARU, "Isi nama divisi baru."))
            }
            if (form.peran == "PIC_PROYEK" && form.proyek == PILIH_BARU && form.namaProyekBaru.isBlank()) {
                add(GalatMedan(MedanAkun.PROYEK_BARU, "Isi nama proyek baru."))
            }
        }
        LangkahAkun.TINJAU -> emptyList()
    }

/** Langkah pertama yang masih bergalat; null = semua lengkap. */
internal fun langkahSalahPertama(form: FormAkun, peranBoleh: Set<String>): LangkahAkun? =
    LangkahAkun.entries.firstOrNull { galatLangkah(form, it, peranBoleh).isNotEmpty() }

/** Tombol "Lanjut": maju bila langkah ini sah, bila tidak tandai dicoba (galat tampil). */
internal fun lanjut(form: FormAkun, peranBoleh: Set<String>): FormAkun {
    if (form.langkah == LangkahAkun.TINJAU) return form
    return if (galatLangkah(form, form.langkah, peranBoleh).isNotEmpty()) {
        form.copy(dicoba = form.dicoba + form.langkah)
    } else {
        form.copy(langkah = LangkahAkun.entries[form.langkah.ordinal + 1])
    }
}

internal fun kembali(form: FormAkun): FormAkun =
    if (form.langkah.ordinal == 0) form else form.copy(langkah = LangkahAkun.entries[form.langkah.ordinal - 1])

/** Tautan divisi/proyek yang dikirim (hanya untuk posisinya; selain itu null). */
private data class Tautan(
    val divisionId: String? = null,
    val divisionName: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
)

private fun tautan(form: FormAkun): Tautan = Tautan(
    divisionId = form.divisi.takeIf { form.peran == "KEPALA_DIVISI" && it.isNotEmpty() && it != PILIH_BARU },
    divisionName = form.namaDivisiBaru.trim()
        .takeIf { form.peran == "KEPALA_DIVISI" && form.divisi == PILIH_BARU && it.isNotEmpty() },
    projectId = form.proyek.takeIf { form.peran == "PIC_PROYEK" && it.isNotEmpty() && it != PILIH_BARU },
    projectName = form.namaProyekBaru.trim()
        .takeIf { form.peran == "PIC_PROYEK" && form.proyek == PILIH_BARU && it.isNotEmpty() },
)

/**
 * Badan POST /api/companies/users. [sandi] = sandi awal acak yang nanti
 * diserahkan (dikirim apa adanya). [idPt] = PT meja ini (meja terbatas
 * memaksa PT-nya sendiri; dikirim supaya meja penuh juga menempatkan akun
 * di perusahaan, bukan tingkat grup). Email kosong = server memakai
 * username@karya.co.id.
 */
internal fun keRequestBaru(form: FormAkun, sandi: String, idPt: String?): AkunBaruRequest {
    val t = tautan(form)
    return AkunBaruRequest(
        name = form.nama.trim(),
        role = form.peran,
        entityId = idPt?.takeIf { it.isNotBlank() },
        username = form.username.trim().lowercase(),
        email = form.email.trim().lowercase().ifEmpty { null },
        password = sandi,
        title = form.jabatan.trim().ifEmpty { null },
        phone = form.telepon.trim().ifEmpty { null },
        memberDivisionId = form.anggotaDivisi.takeIf { it.isNotEmpty() },
        divisionId = t.divisionId,
        divisionName = t.divisionName,
        projectId = t.projectId,
        projectName = t.projectName,
    )
}

/**
 * Badan PATCH /api/companies/users — hanya medan yang berubah (yang lain
 * null = tidak dikirim). Jabatan/telepon dikosongkan memakai "" (server
 * membacanya sebagai hapus).
 */
internal fun keRequestUbah(form: FormAkun, asal: AkunBaris): AkunUbahRequest {
    val t = tautan(form)
    val nama = form.nama.trim()
    val username = form.username.trim().lowercase()
    val email = form.email.trim().lowercase()
    val jabatan = form.jabatan.trim()
    val telepon = form.telepon.trim()
    return AkunUbahRequest(
        id = asal.id,
        name = nama.takeIf { it != asal.nama },
        username = username.takeIf { it != asal.username.orEmpty() },
        email = email.takeIf { it != asal.email.orEmpty().lowercase() },
        title = jabatan.takeIf { it != asal.jabatan.orEmpty() },
        phone = telepon.takeIf { it != asal.telepon.orEmpty() },
        role = form.peran.takeIf { it != asal.peran },
        divisionId = t.divisionId,
        divisionName = t.divisionName,
        projectId = t.projectId,
        projectName = t.projectName,
    )
}

/** Ada medan yang benar-benar dikirim selain id? */
internal fun adaPerubahan(req: AkunUbahRequest): Boolean = req != AkunUbahRequest(id = req.id)

/**
 * Langkah tempat galat 4xx server paling mungkin diperbaiki (pesan server
 * readPosition/createAccount/PATCH): username/email/telepon -> identitas,
 * posisi/divisi/proyek -> posisi. null = tetap di langkah sekarang.
 */
internal fun langkahUntukGalatServer(pesan: String): LangkahAkun? {
    val p = pesan.lowercase()
    return when {
        "username" in p || "email" in p || "telepon" in p || p.startsWith("nama") -> LangkahAkun.IDENTITAS
        "posisi" in p || "divisi" in p || "proyek" in p -> LangkahAkun.POSISI
        else -> null
    }
}

/** Pesan pengganti galat jaringan: pembuatan/ubah akun hanya daring (tanpa antrean). */
internal const val PESAN_AKUN_LURING =
    "Akun hanya bisa dibuat atau diubah saat daring. Periksa koneksi internet Anda, lalu coba lagi."

/** Pesan galat kirim wizard: jaringan putus -> [PESAN_AKUN_LURING], lainnya pesan ApiError. */
internal fun pesanGalatKirimAkun(e: Throwable): String =
    if (e is IOException) PESAN_AKUN_LURING else ApiError.dari(e).pesanTampil()

/** Hasil pembuatan akun untuk serah terima; [sandi] = yang BENAR-BENAR terkirim. */
data class HasilAkunBaru(
    val idAkun: String,
    val nama: String,
    val username: String,
    val peran: String,
    val sandi: Rahasia,
)

/**
 * Keadaan wizard. Hidup di memori ViewModel (bukan SavedStateHandle/Bundle)
 * supaya isian dan sandi stabil saat rotasi tanpa pernah diserialisasi;
 * dibuang saat wizard ditutup. toString [Rahasia] disamarkan.
 */
data class WizardAkunUi(
    val form: FormAkun,
    /** Sandi awal mode BARU — dibuat sekali saat wizard dibuka, dipakai ulang saat kirim ulang. */
    val sandi: Rahasia? = null,
    val sibuk: Boolean = false,
    /** Galat server (4xx/jaringan) — tampil di dekat tombol aksi. */
    val galat: String? = null,
    val hasil: HasilAkunBaru? = null,
)
