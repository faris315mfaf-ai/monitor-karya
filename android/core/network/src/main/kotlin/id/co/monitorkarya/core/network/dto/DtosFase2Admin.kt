package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.Serializable

/**
 * DTO Fase 2 sisi Admin PT [T6-C2]. Bentuknya persis dari rute:
 *   - src/app/api/inbox/route.ts             (penerimaan + teruskan)
 *   - src/app/api/admin/compliance/route.ts  (kepatuhan per divisi)
 *   - src/app/api/admin/compliance/remind/route.ts (pengingat)
 *   - src/app/api/companies/users/route.ts   (meja akun)
 *   - src/app/api/companies/users/activation/route.ts (aktivasi akun)
 *
 * Konvensi: semua field opsional diberi bawaan `= null` supaya mkJson
 * (encodeDefaults = false) MENGHILANGKANNYA saat mengirim — penting untuk
 * badan PATCH yang memakai "ada/tidak ada field" sebagai sinyal.
 */

// ------------------------------------------------------------------
// Penerimaan (/api/inbox)
// ------------------------------------------------------------------

/** GET /api/inbox — dua arus (harian + mingguan) dengan status serah terima. */
@Serializable
data class InboxResponse(
    val reportDate: String,
    val dailyLockAt: String,
    val dailyCountdown: InboxCountdownDto? = null,
    val dailyLocked: Boolean = false,
    val week: InboxWeekDto,
    val daily: List<InboxHarianDto> = emptyList(),
    val weekly: List<InboxMingguanDto> = emptyList(),
)

/** Sisa waktu menuju tutup harian 17.00 WIB. */
@Serializable
data class InboxCountdownDto(
    val hours: Int = 0,
    val minutes: Int = 0,
    val totalMs: Long = 0,
    val passed: Boolean = false,
)

/** Batas pekan berjalan: serah Kamis, kunci Jumat. */
@Serializable
data class InboxWeekDto(
    val isoYear: Int,
    val isoWeek: Int,
    val handoverBy: String,
    val lockAt: String,
)

/** Satu baris meja harian: satu proyek aktif dan laporannya hari ini. */
@Serializable
data class InboxHarianDto(
    val projectId: String,
    val code: String,
    val name: String,
    val picName: String? = null,
    val reportId: String? = null,
    val status: String? = null,
    val progressPct: Int? = null,
    val evidenceCount: Int = 0,
    val submittedAt: String? = null,
    val submittedBy: String? = null,
    val forwardedAt: String? = null,
    /** Siap diteruskan: PIC sudah mengirim dan belum pernah diteruskan. */
    val readyToForward: Boolean = false,
)

/** Satu baris meja mingguan: satu divisi dan laporan pekan berjalan. */
@Serializable
data class InboxMingguanDto(
    val divisionId: String,
    val name: String,
    val headName: String? = null,
    val reportId: String? = null,
    /** Status header laporan mingguan, mis. "DISETUJUI". */
    val statusHeader: String? = null,
    val itemCount: Int = 0,
    val submittedAt: String? = null,
    val approvedAt: String? = null,
    val forwardedAt: String? = null,
    /** Siap diteruskan: disetujui kepala divisi dan belum pernah diteruskan. */
    val readyToForward: Boolean = false,
)

/**
 * POST /api/inbox — teruskan satu laporan.
 * [kind] = "daily" (bawaan di server) atau "weekly"; [id] = id laporan
 * (DailyProjectReport.id / WeeklyDivisionReport.id), BUKAN id proyek/divisi.
 */
@Serializable
data class TeruskanRequest(
    val kind: String,
    val id: String,
) {
    companion object {
        const val KIND_HARIAN = "daily"
        const val KIND_MINGGUAN = "weekly"

        fun harian(id: String) = TeruskanRequest(KIND_HARIAN, id)

        fun mingguan(id: String) = TeruskanRequest(KIND_MINGGUAN, id)
    }
}

/**
 * Respons sukses penerusan. [undoToken] hanya ada bila server berhasil
 * menerbitkan tiket urungkan [F2-URUNGKAN] (jendela 15 menit, sekali pakai,
 * POST /api/undo); bila penerbitan gagal field ini TIDAK dikirim dan UI
 * tidak menawarkan "Urungkan". null ≠ galat — penerusan tetap berhasil.
 */
@Serializable
data class TeruskanResponse(
    val ok: Boolean = false,
    val undoToken: String? = null,
)

// ------------------------------------------------------------------
// Kepatuhan (/api/admin/compliance)
// ------------------------------------------------------------------

/** GET /api/admin/compliance — kepatuhan laporan per divisi. */
@Serializable
data class KepatuhanResponse(
    /** Hari ini (tengah malam WIB), ISO. */
    val today: String,
    /** Hari kerja terakhir (maks 10), lama ke baru, ISO. */
    val days: List<String> = emptyList(),
    /** Laporan hari ini sudah dikunci pukul 17.00 WIB. */
    val locked: Boolean = false,
    val week: KepatuhanWeekDto,
    val totals: KepatuhanTotalsDto,
    val divisions: List<DivisiKepatuhanDto> = emptyList(),
    /** Akun ini boleh menekan tombol Ingatkan (terikat satu PT). */
    val canRemind: Boolean = false,
)

@Serializable
data class KepatuhanWeekDto(
    val isoYear: Int,
    val isoWeek: Int,
    val handoverBy: String,
    val lockAt: String,
    val handoverPassed: Boolean = false,
)

/** Total orang berbeda lintas divisi (tidak dihitung dua kali). */
@Serializable
data class KepatuhanTotalsDto(
    val expected: Int = 0,
    val reported: Int = 0,
    val onLeave: Int = 0,
    val reminded: Int = 0,
    /** PIC aktif yang tidak tergabung di divisi mana pun. */
    val unassigned: Int = 0,
)

/** Satu divisi: wajib lapor, yang belum, peta panas 10 hari, mingguan. */
@Serializable
data class DivisiKepatuhanDto(
    val id: String,
    val name: String,
    val entityId: String,
    /** Kontak kepala divisi; null bila kosong/nonaktif. */
    val head: KepatuhanKepalaDto? = null,
    val expected: Int = 0,
    val reported: Int = 0,
    val onLeave: Int = 0,
    val missing: List<OrangBelumLaporDto> = emptyList(),
    /** Persen lapor per hari kerja (urutan sama dengan days); null = tidak ada yang wajib. */
    val history: List<Int?> = emptyList(),
    val weekly: MingguanDivisiDto,
)

@Serializable
data class KepatuhanKepalaDto(
    val id: String,
    val name: String,
    val email: String? = null,
    val phone: String? = null,
)

/** Orang yang belum melaporkan semua proyeknya hari ini. */
@Serializable
data class OrangBelumLaporDto(
    val id: String,
    val name: String,
    /** Label peran, mis. "Manager / PIC proyek". */
    val role: String,
    /** Kiriman terakhir (mana pun proyeknya), ISO. */
    val lastReportAt: String? = null,
    /** Pengingat harian pertama hari ini, ISO; null = belum diingatkan. */
    val remindedAt: String? = null,
    /** Nama proyek yang belum terkirim hari ini. */
    val projects: List<String> = emptyList(),
)

/** Status laporan mingguan divisi pekan berjalan. */
@Serializable
data class MingguanDivisiDto(
    /** "MASUK" | "TERLAMBAT" | "BELUM" (src/lib/admin-compliance.ts). */
    val state: String,
    val statusHeader: String? = null,
    val submittedAt: String? = null,
    val approvedAt: String? = null,
    val forwardedAt: String? = null,
) {
    companion object {
        const val STATE_MASUK = "MASUK"
        const val STATE_TERLAMBAT = "TERLAMBAT"
        const val STATE_BELUM = "BELUM"
    }
}

// ------------------------------------------------------------------
// Pengingat (/api/admin/compliance/remind)
// ------------------------------------------------------------------

/**
 * POST remind — TEPAT SATU dari [userId] / [divisionId] / [all] = true
 * (server menolak 400 bila lebih dari satu terisi).
 */
@Serializable
data class IngatkanRequest(
    val userId: String? = null,
    val divisionId: String? = null,
    val all: Boolean? = null,
) {
    companion object {
        fun orang(userId: String) = IngatkanRequest(userId = userId)

        fun divisi(divisionId: String) = IngatkanRequest(divisionId = divisionId)

        fun semua() = IngatkanRequest(all = true)
    }
}

/** Respons sukses pengingat. */
@Serializable
data class IngatkanResponse(
    val ok: Boolean = false,
    /** Orang yang baru saja diingatkan (satu entri per orang, bukan per proyek). */
    val people: List<OrangDiingatkanDto> = emptyList(),
    /** Jumlah pengingat terkirim (bisa > people: satu orang banyak proyek). */
    val sent: Int = 0,
    /** Dilewati (sudah diingatkan/cuti hari ini). */
    val skipped: Int = 0,
)

@Serializable
data class OrangDiingatkanDto(
    val userId: String,
    val name: String,
    /** Waktu pengingat terkirim, ISO. */
    val remindedAt: String? = null,
)

// ------------------------------------------------------------------
// Meja akun (/api/companies/users)
// ------------------------------------------------------------------

/**
 * Badan galat seragam (400/403/404/409/422/429) untuk diurai dari
 * errorBody() bila pemanggil butuh lebih dari pesan: 409 remind terkunci
 * mengirim {error, locked: true}; 409 "sudah diingatkan" mengirim
 * {error, remindedAt}; 409 laporan beku gaya /api/tasks mengirim
 * {error, locked, frozen, reportId}. Semua field opsional.
 */
@Serializable
data class GalatDto(
    val error: String? = null,
    val locked: Boolean? = null,
    val frozen: Boolean? = null,
    val reportId: String? = null,
    val remindedAt: String? = null,
    val retryAfter: Long? = null,
)

/**
 * POST /api/companies/users — tambah akun. username kosong = slug dari nama;
 * email kosong = username@karya.co.id; password kosong = acak (akun selalu
 * wajib ganti sandi saat masuk pertama, F1-C).
 */
@Serializable
data class AkunBaruRequest(
    val name: String,
    val role: String,
    /** null = tingkat holding (hanya meja penuh/Super Admin). */
    val entityId: String? = null,
    val username: String? = null,
    val email: String? = null,
    val password: String? = null,
    val title: String? = null,
    val phone: String? = null,
    val avatarColor: String? = null,
    /** [F2-ADMIN] divisi yang diikuti sebagai ANGGOTA; "" = tanpa divisi. */
    val memberDivisionId: String? = null,
    /** Divisi yang DIPIMPIN bila peran KEPALA_DIVISI (id atau nama baru). */
    val divisionId: String? = null,
    val divisionName: String? = null,
    /** Proyek yang dipimpang bila peran PIC_PROYEK (id atau nama baru). */
    val projectId: String? = null,
    val projectName: String? = null,
)

/**
 * PATCH /api/companies/users — ubah akun. Field yang tidak dikirim tidak
 * berubah. PENTING: melepas nilai memakai string kosong "" BUKAN null —
 * serializer menghilangkan field null (encodeDefaults = false), sedangkan
 * server membaca "" sebagai "kosongkan" (memberDivisionId, title, phone,
 * entityId). password "" dilewati server (tidak mengubah sandi).
 */
@Serializable
data class AkunUbahRequest(
    val id: String,
    val name: String? = null,
    val username: String? = null,
    val email: String? = null,
    val title: String? = null,
    val phone: String? = null,
    val avatarColor: String? = null,
    val role: String? = null,
    /** "" = pindah ke tingkat holding; meja terbatas tidak boleh. */
    val entityId: String? = null,
    val isActive: Boolean? = null,
    /** Setel ulang kata sandi; untuk orang lain server memaksa ganti sandi. */
    val password: String? = null,
    /** [F2-ADMIN] "" = lepas dari divisi anggota. */
    val memberDivisionId: String? = null,
    val divisionId: String? = null,
    val divisionName: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
)

/** Respons POST/PATCH meja akun. */
@Serializable
data class AkunResponse(
    val ok: Boolean = false,
    val account: AkunDto,
)

/**
 * Bentuk akun hasil POST/PATCH. POST mengirim id/name/username/email/role
 * (plus tautan divisionId/projectId bila ada); PATCH menambah
 * title/isActive/scopeEntityId. mustChangePassword TIDAK pernah dikirim
 * rute ini (hanya /api/auth/me); disediakan opsional untuk toleransi.
 */
@Serializable
data class AkunDto(
    val id: String,
    val name: String,
    val username: String? = null,
    val email: String? = null,
    val role: String,
    val title: String? = null,
    val isActive: Boolean? = null,
    val scopeEntityId: String? = null,
    /** Tautan kepala divisi hasil penempatan. */
    val divisionId: String? = null,
    /** Tautan PIC proyek hasil penempatan. */
    val projectId: String? = null,
    val mustChangePassword: Boolean? = null,
)

/** GET /api/companies/users?id= — keanggotaan divisi satu akun (sheet akun). */
@Serializable
data class KeanggotaanDivisiDto(
    val id: String,
    /** Divisi yang diikuti sebagai anggota; null = tanpa divisi. */
    val memberDivisionId: String? = null,
)

// ------------------------------------------------------------------
// Aktivasi akun (/api/companies/users/activation)
// ------------------------------------------------------------------

/** GET /api/companies/users/activation?id= — cek kelayakan; 200 = bisa. */
@Serializable
data class AktivasiTersediaResponse(
    val canActivate: Boolean = false,
)

/** POST /api/companies/users/activation — terbitkan ulang tautan aktivasi. */
@Serializable
data class TerbitkanAktivasiRequest(
    val userId: String,
)

@Serializable
data class TerbitkanAktivasiResponse(
    val ok: Boolean = false,
    val activation: AktivasiDto,
)

/**
 * Metadata aktivasi; token hanya ada di fragmen [path]
 * (/login/aktivasi#token=...) dan tidak pernah dikirim sebagai field lain.
 * Berlaku 24 jam (ACTIVATION_TTL_MS).
 */
@Serializable
data class AktivasiDto(
    val userId: String,
    val username: String,
    val path: String,
    val expiresAt: String,
)
