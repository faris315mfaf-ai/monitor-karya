// Logika murni tab Perusahaan & akun (padanan src/lib/accounts.ts,
// completeness() company-sheet.tsx, dan saringan companies-view.tsx).
// Batas wewenang (manageableRoles, canManageCompanies, scope) SELALU dari
// jawaban server; fungsi di sini hanya menerapkannya ke tampilan.
package id.co.monitorkarya.feature.entitas.perusahaan

import id.co.monitorkarya.feature.entitas.data.AkunBarisDto
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import java.security.SecureRandom
import java.text.Normalizer

/** Satu posisi yang bisa dipilih (POSITION_OPTIONS / HOLDING_POSITION_OPTIONS). */
data class OpsiPosisi(val peran: String, val label: String, val petunjuk: String)

/** Posisi di sebuah perusahaan (peran entitas). */
val POSISI_PERUSAHAAN = listOf(
    OpsiPosisi("ADMIN_PT", "Admin PT", "Mengisi & meneruskan laporan perusahaan"),
    OpsiPosisi("KEPALA_DIVISI", "Kepala divisi", "Capaian mingguan divisinya"),
    OpsiPosisi("PIC_PROYEK", "Manager proyek", "Laporan harian proyek yang dipegang"),
    OpsiPosisi("DIREKTUR_ENTITAS", "Direktur perusahaan", "Mengawasi & menyetujui di perusahaannya"),
)

/** Posisi tingkat grup (holding). */
val POSISI_HOLDING = listOf(
    OpsiPosisi("MANAJEMEN", "Manajemen holding", "Membaca seluruh grup, memutuskan eskalasi"),
    OpsiPosisi("DIREKTUR_SDM_GA", "Direksi holding (SDM & GA)", "Pemilik proses, menyetujui buka kunci"),
    OpsiPosisi("SUPERADMIN", "Super Admin", "Kelola perusahaan & akun seluruh grup"),
    OpsiPosisi("TI", "Tim TI", "Konsol sistem & akses"),
    OpsiPosisi("AUDITOR", "Auditor", "Baca-saja + jejak audit"),
)

/** Urutan peran (ALL_ROLES rbac.ts) untuk saringan posisi. */
val SEMUA_PERAN = listOf(
    "PIC_PROYEK", "KEPALA_DIVISI", "ADMIN_PT", "DIREKTUR_ENTITAS", "DIREKTUR_SDM_GA",
    "MANAJEMEN", "TI", "AUDITOR", "SUPERADMIN",
)

/** Label peran (roleLabel web: posisi dulu, lalu ROLE_LABELS). */
fun labelPeran(peran: String): String =
    (POSISI_PERUSAHAAN + POSISI_HOLDING).firstOrNull { it.peran == peran }?.label ?: when (peran) {
        "DIREKTUR_ENTITAS" -> "Direktur entitas"
        else -> peran
    }

/** Peran yang wajib menempel pada sebuah perusahaan. */
fun adalahPeranEntitas(peran: String): Boolean = POSISI_PERUSAHAAN.any { it.peran == peran }

/**
 * Posisi yang boleh dipilih untuk sebuah penempatan (positionsFor web):
 * tingkat grup hanya peran holding, PT hanya peran perusahaan, holding
 * keduanya — lalu diiris dengan manageableRoles dari server.
 */
fun posisiUntuk(perusahaan: PerusahaanDto?, boleh: List<String>): List<OpsiPosisi> {
    val dasar = when {
        perusahaan == null -> POSISI_HOLDING
        perusahaan.type == "HOLDING" -> POSISI_PERUSAHAAN + POSISI_HOLDING
        else -> POSISI_PERUSAHAAN
    }
    return if (boleh.isEmpty()) dasar else dasar.filter { it.peran in boleh }
}

/**
 * Akun boleh disentuh pemegang meja: bukan akun sendiri dan posisinya
 * termasuk manageableRoles server (kosong = tidak dibatasi, padanan web).
 */
fun bisaSentuh(akun: AkunBarisDto, me: String, boleh: List<String>): Boolean =
    akun.id != me && (boleh.isEmpty() || akun.role in boleh)

// ------------------------------------------------------------------
// Kelengkapan profil
// ------------------------------------------------------------------

enum class TabPerusahaan { RINGKASAN, AKUN, DIVISI, PROYEK, PENGATURAN }

data class ButirKelengkapan(val kunci: String, val label: String, val selesai: Boolean, val tab: TabPerusahaan)

data class Kelengkapan(val butir: List<ButirKelengkapan>) {
    val selesai: Int get() = butir.count { it.selesai }
    val total: Int get() = butir.size
    val persen: Int get() = if (total == 0) 0 else Math.round(selesai * 100f / total)
}

/** completeness() web: logo, kontak, admin aktif, direktur, divisi, kepala divisi. */
/**
 * E2E-3 B16: jumlah laporan yang membuat perusahaan tidak bisa dihapus (server
 * menolak 409 bila ada laporan/tugas/eskalasi). 0 = tombol hapus boleh aktif;
 * baris lain (tugas, eskalasi) tetap dijaga server.
 */
fun laporanPenghalangHapus(c: PerusahaanDto): Int = c.counts.dailyReports + c.counts.weeklyReports

fun kelengkapan(c: PerusahaanDto): Kelengkapan {
    val holding = c.type == "HOLDING"
    return Kelengkapan(
        listOf(
            ButirKelengkapan("logo", "Logo perusahaan", !c.logoData.isNullOrBlank(), TabPerusahaan.PENGATURAN),
            ButirKelengkapan(
                "kontak",
                "Alamat, telepon, dan email",
                !c.address.isNullOrBlank() && !c.phone.isNullOrBlank() && !c.email.isNullOrBlank(),
                TabPerusahaan.PENGATURAN,
            ),
            ButirKelengkapan(
                "admin",
                "Admin PT yang aktif",
                holding || c.users.any { it.role == "ADMIN_PT" && it.isActive },
                TabPerusahaan.AKUN,
            ),
            ButirKelengkapan(
                "direktur",
                "Direktur perusahaan",
                holding || c.users.any { it.role == "DIREKTUR_ENTITAS" },
                TabPerusahaan.AKUN,
            ),
            ButirKelengkapan("divisi", "Minimal satu divisi", holding || c.divisions.isNotEmpty(), TabPerusahaan.DIVISI),
            ButirKelengkapan(
                "kepala",
                "Setiap divisi punya kepala",
                c.divisions.all { it.headUserId != null },
                TabPerusahaan.DIVISI,
            ),
        ),
    )
}

// ------------------------------------------------------------------
// Ringkasan hero
// ------------------------------------------------------------------

data class RingkasanMeja(
    val penuh: Boolean,
    val jumlahHolding: Int,
    val jumlahPerusahaan: Int,
    val perusahaanAktif: Int,
    val semuaAkun: Int,
    val akunAktif: Int,
    val pernahMasuk: Int,
    val belumMasuk: Int,
    val tanpaSandi: Int,
    val tanpaKepala: Int,
    val tanpaManager: Int,
    val belumLengkap: Int,
    val akunGrup: Int,
) {
    /** Angka tombol "Tinjau n hal" = jumlah hal yang disebut kalimat pendukung. */
    val hal: Int get() = belumMasuk + tanpaSandi + tanpaKepala + tanpaManager + belumLengkap
}

fun semuaAkun(m: MejaPerusahaanResponse): List<AkunBarisDto> = m.holdingUsers + m.companies.flatMap { it.users }

fun ringkasMeja(m: MejaPerusahaanResponse): RingkasanMeja {
    val semua = semuaAkun(m)
    val aktif = semua.filter { it.isActive }
    return RingkasanMeja(
        penuh = m.scope != "ENTITY",
        jumlahHolding = m.companies.count { it.type == "HOLDING" },
        jumlahPerusahaan = m.companies.size,
        perusahaanAktif = m.companies.count { it.isActive },
        semuaAkun = semua.size,
        akunAktif = aktif.size,
        pernahMasuk = aktif.count { it.lastLoginAt != null },
        belumMasuk = aktif.count { it.lastLoginAt == null && it.hasPassword },
        tanpaSandi = semua.count { !it.hasPassword },
        tanpaKepala = m.companies.sumOf { c -> c.divisions.count { it.headUserId == null } },
        tanpaManager = m.companies.sumOf { c -> c.projects.count { it.picUserId == null } },
        belumLengkap = m.companies.count { kelengkapan(it).persen < 100 },
        akunGrup = m.holdingUsers.size,
    )
}

// ------------------------------------------------------------------
// Saringan perusahaan
// ------------------------------------------------------------------

enum class SaringPerusahaan { SEMUA, HOLDING, PT, BELUM_LENGKAP, NONAKTIF }

enum class UrutPerusahaan { NAMA, AKUN_TERBANYAK, PALING_BELUM_LENGKAP }

fun cocokSaringPerusahaan(c: PerusahaanDto, s: SaringPerusahaan): Boolean = when (s) {
    SaringPerusahaan.SEMUA -> true
    SaringPerusahaan.HOLDING -> c.type == "HOLDING"
    SaringPerusahaan.PT -> c.type == "PT"
    SaringPerusahaan.BELUM_LENGKAP -> kelengkapan(c).persen < 100
    SaringPerusahaan.NONAKTIF -> !c.isActive
}

fun saringPerusahaan(
    daftar: List<PerusahaanDto>,
    saring: SaringPerusahaan,
    urut: UrutPerusahaan,
    cari: String,
): List<PerusahaanDto> {
    val j = cari.trim().lowercase()
    val hasil = daftar
        .filter { cocokSaringPerusahaan(it, saring) }
        .filter { c ->
            j.isEmpty() ||
                listOf(c.name, c.code, c.address, c.email, c.parentName).any { it.orEmpty().lowercase().contains(j) }
        }
    return when (urut) {
        UrutPerusahaan.AKUN_TERBANYAK -> hasil.sortedByDescending { it.users.size }
        UrutPerusahaan.PALING_BELUM_LENGKAP -> hasil.sortedBy { kelengkapan(it).persen }
        UrutPerusahaan.NAMA -> hasil.sortedWith(
            compareBy<PerusahaanDto> { if (it.type == "HOLDING") 0 else 1 }.thenBy { it.name.lowercase() },
        )
    }
}

// ------------------------------------------------------------------
// Saringan akun
// ------------------------------------------------------------------

enum class SaringAkun { SEMUA, AKTIF, BELUM_MASUK, TANPA_SANDI, NONAKTIF }

fun cocokSaringAkun(u: AkunBarisDto, s: SaringAkun): Boolean = when (s) {
    SaringAkun.SEMUA -> true
    SaringAkun.AKTIF -> u.isActive
    SaringAkun.BELUM_MASUK -> u.isActive && u.lastLoginAt == null
    SaringAkun.TANPA_SANDI -> !u.hasPassword
    SaringAkun.NONAKTIF -> !u.isActive
}

/** Penempatan saringan akun: semua, tingkat grup, atau id perusahaan. */
const val TEMPAT_SEMUA = "all"
const val TEMPAT_GRUP = "group"

/** Satu baris daftar akun lintas perusahaan. */
data class BarisAkun(val akun: AkunBarisDto, val perusahaan: PerusahaanDto?)

fun saringAkun(
    m: MejaPerusahaanResponse,
    status: SaringAkun,
    tempat: String,
    peran: String?,
    cari: String,
): List<BarisAkun> {
    val j = cari.trim().lowercase()
    val datar = m.holdingUsers.map { BarisAkun(it, null) } + m.companies.flatMap { c -> c.users.map { BarisAkun(it, c) } }
    return datar
        .filter { cocokSaringAkun(it.akun, status) }
        .filter {
            when (tempat) {
                TEMPAT_SEMUA -> true
                TEMPAT_GRUP -> it.perusahaan == null
                else -> it.perusahaan?.id == tempat
            }
        }
        .filter { peran == null || it.akun.role == peran }
        .filter { b ->
            j.isEmpty() ||
                listOf(b.akun.name, b.akun.username, b.akun.email, b.akun.title, labelPeran(b.akun.role), b.perusahaan?.name)
                    .any { it.orEmpty().lowercase().contains(j) }
        }
        .sortedWith(compareBy<BarisAkun> { it.perusahaan?.name.orEmpty().lowercase() }.thenBy { it.akun.name.lowercase() })
}

fun jumlahSaringAkun(m: MejaPerusahaanResponse): Map<SaringAkun, Int> {
    val semua = semuaAkun(m)
    return SaringAkun.entries.associateWith { s -> semua.count { cocokSaringAkun(it, s) } }
}

// ------------------------------------------------------------------
// Validasi & pembantu formulir
// ------------------------------------------------------------------

private val POLA_USERNAME = Regex("^[a-z0-9][a-z0-9._-]{2,31}$")
private val POLA_EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
private val POLA_KODE = Regex("^[A-Z0-9-]{2,32}$")
private val POLA_TELEPON = Regex("^\\+?[0-9\\s-]{8,20}$")

const val SANDI_MINIMAL = 8

fun usernameSah(u: String): Boolean = POLA_USERNAME.matches(u)
fun emailSah(e: String): Boolean = POLA_EMAIL.matches(e)
fun kodeSah(k: String): Boolean = POLA_KODE.matches(k)
fun teleponSah(t: String): Boolean = t.isBlank() || POLA_TELEPON.matches(t)

/**
 * Nilai `email` untuk PATCH akun (D2). Server membaca `body.email !== undefined`
 * sebagai "ubah email" dan menolak "" (422 "Email tidak valid."). Dulu isian
 * kosong dipetakan ke null → tidak terkirim → server membalas 200 tanpa
 * mengubah apa pun, padahal pengguna bermaksud mengosongkan. Kini:
 *  - isian terisi → dikirim (huruf kecil);
 *  - isian kosong & akun semula punya email → "" dikirim supaya server menolak
 *    dengan pesan jelas, bukan sukses palsu;
 *  - isian kosong & akun memang tanpa email → null (tidak berubah).
 */
fun emailUntukUbah(isian: String, semula: String?): String? {
    val bersih = isian.trim().lowercase()
    return when {
        bersih.isNotEmpty() -> bersih
        !semula.isNullOrBlank() -> ""
        else -> null
    }
}

/** slugify web: huruf kecil, buang diakritik & non-alfanumerik, maks 24. */
fun slugify(s: String): String = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFKD)
    .replace(Regex("[^a-z0-9]+"), "")
    .take(24)

/** Kode perusahaan turunan dari nama (PT-XXX / HOLDING-XXX). */
fun kodeTurunan(nama: String, holding: Boolean): String {
    val tanpaAwalan = nama.replace(Regex("^(pt|holding)\\s+", RegexOption.IGNORE_CASE), "")
    val slug = slugify(tanpaAwalan).ifEmpty { slugify(nama) }
    return if (slug.isEmpty()) "" else "${if (holding) "HOLDING" else "PT"}-${slug.uppercase()}"
}

/**
 * Kata sandi awal acak (randomInitialPassword web): 12 karakter tanpa huruf
 * mudah tertukar. Hanya hidup di state formulir dan permintaan; tidak pernah
 * dicatat log atau disimpan ViewModel.
 */
fun sandiAcak(panjang: Int = 12): String {
    val abjad = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    val acak = SecureRandom()
    return buildString { repeat(panjang) { append(abjad[acak.nextInt(abjad.length)]) } }
}
