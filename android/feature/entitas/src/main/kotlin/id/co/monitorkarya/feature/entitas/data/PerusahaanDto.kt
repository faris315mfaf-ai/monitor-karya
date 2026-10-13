// Kontrak jaringan tab Perusahaan & akun (gelombang A2). Bentuknya disalin
// dari rute server sebenarnya:
//   src/app/api/companies/route.ts                  — GET meja, POST/PATCH/DELETE perusahaan
//   src/app/api/companies/users/route.ts            — GET keanggotaan, POST/PATCH/DELETE akun
//   src/app/api/companies/users/activation/route.ts — GET kelayakan, POST terbitkan tautan
//
// Catatan penyandian: mkJson memakai encodeDefaults=false, jadi kolom
// permintaan yang bernilai null TIDAK dikirim. Itu penting untuk PATCH: rute
// akun membaca `body.x !== undefined` sebagai "ubah x". Untuk sengaja
// mengosongkan (lepas divisi, pindah ke tingkat grup) kirim string kosong "".
package id.co.monitorkarya.feature.entitas.data

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

// ------------------------------------------------------------------
// GET /api/companies
// ------------------------------------------------------------------

/**
 * Meja perusahaan & akun. [scope] ALL = Super Admin (seluruh grup), ENTITY =
 * Admin PT (satu PT). [canManageCompanies] dan [manageableRoles] adalah batas
 * wewenang dari server — klien tidak menebak sendiri.
 */
@Serializable
data class MejaPerusahaanResponse(
    val companies: List<PerusahaanDto> = emptyList(),
    val holdingUsers: List<AkunBarisDto> = emptyList(),
    val totals: TotalMejaDto = TotalMejaDto(),
    val me: String = "",
    val scope: String = "ALL",
    val canManageCompanies: Boolean = false,
    val manageableRoles: List<String> = emptyList(),
)

@Serializable
data class TotalMejaDto(
    val companies: Int = 0,
    val users: Int = 0,
    val divisions: Int = 0,
    val projects: Int = 0,
)

/** Satu perusahaan (HOLDING atau PT) beserta akun, divisi, proyek, dan hitungannya. */
@Serializable
data class PerusahaanDto(
    val id: String,
    val code: String = "",
    val name: String,
    val type: String = "PT",
    val parentId: String? = null,
    val parentName: String? = null,
    /** Logo sebagai data URL; dibaca hanya untuk kelengkapan profil. */
    val logoData: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val website: String? = null,
    val isActive: Boolean = true,
    val users: List<AkunBarisDto> = emptyList(),
    val divisions: List<DivisiPerusahaanDto> = emptyList(),
    val projects: List<ProyekPerusahaanDto> = emptyList(),
    val counts: HitunganPerusahaanDto = HitunganPerusahaanDto(),
)

@Serializable
data class HitunganPerusahaanDto(
    val users: Int = 0,
    val divisions: Int = 0,
    val projects: Int = 0,
    val dailyReports: Int = 0,
    val weeklyReports: Int = 0,
)

@Serializable
data class DivisiPerusahaanDto(
    val id: String,
    val name: String = "",
    val headUserId: String? = null,
    val headName: String? = null,
)

@Serializable
data class ProyekPerusahaanDto(
    val id: String,
    val code: String = "",
    val name: String = "",
    val lifecycle: String = "",
    val picUserId: String? = null,
    val picName: String? = null,
)

/** Baris akun (UserRow). hasPassword=false: belum bisa masuk. */
@Serializable
data class AkunBarisDto(
    val id: String,
    val name: String = "",
    val username: String? = null,
    val email: String? = null,
    val role: String = "",
    val title: String? = null,
    val phone: String? = null,
    val isActive: Boolean = true,
    val lastLoginAt: String? = null,
    val avatarColor: String? = null,
    val hasPassword: Boolean = true,
    val scopeEntityId: String? = null,
    val divisionId: String? = null,
    val divisionName: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
)

// ------------------------------------------------------------------
// POST / PATCH / DELETE /api/companies
// ------------------------------------------------------------------

/** Posisi/akun pertama dalam wizard tambah perusahaan (readPosition server). */
@Serializable
data class PosisiBaruRequest(
    val role: String,
    val name: String,
    val username: String,
    val email: String? = null,
    val password: String? = null,
    val title: String? = null,
    val divisionName: String? = null,
    val projectName: String? = null,
)

/**
 * POST perusahaan. [isHolding] dan [positions] SELALU disandikan (D2): server
 * kini memperlakukan absen = false / [], tetapi keduanya penentu bentuk entitas
 * (HOLDING vs PT, akun pertama) sehingga tidak boleh bergantung pada nilai
 * bawaan yang dibuang encodeDefaults=false (pelajaran C2 K1 `resubmit`).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class TambahPerusahaanRequest(
    val name: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val isHolding: Boolean = false,
    val parentId: String? = null,
    val code: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val website: String? = null,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val positions: List<PosisiBaruRequest> = emptyList(),
)

@Serializable
data class EntitasBaruDto(
    val id: String,
    val code: String = "",
    val name: String = "",
)

@Serializable
data class AkunTercatatDto(
    val id: String,
    val name: String = "",
    val role: String = "",
    val username: String? = null,
    val email: String? = null,
    val divisionId: String? = null,
    val projectId: String? = null,
)

@Serializable
data class TambahPerusahaanResponse(
    val ok: Boolean = false,
    val entity: EntitasBaruDto? = null,
    val accounts: List<AkunTercatatDto> = emptyList(),
)

/** PATCH perusahaan: hanya kolom non-null yang terkirim. */
@Serializable
data class UbahPerusahaanRequest(
    val id: String,
    val name: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val website: String? = null,
    val isActive: Boolean? = null,
)

@Serializable
data class PerusahaanTersimpanDto(
    val id: String,
    val name: String = "",
    val code: String = "",
    val isActive: Boolean = true,
)

@Serializable
data class UbahPerusahaanResponse(
    val ok: Boolean = false,
    val entity: PerusahaanTersimpanDto? = null,
)

@Serializable
data class OkDto(
    val ok: Boolean = false,
)

// ------------------------------------------------------------------
// /api/companies/users
// ------------------------------------------------------------------

/** GET ?id= — keanggotaan divisi satu akun (User.divisionId). */
@Serializable
data class KeanggotaanAkunDto(
    val id: String = "",
    val memberDivisionId: String? = null,
)

/**
 * POST akun. [entityId] null = tingkat grup (hanya meja penuh). divisionId /
 * divisionName = divisi yang DIPIMPIN kepala divisi; projectId/projectName =
 * proyek yang dipegang PIC; memberDivisionId = keanggotaan divisi.
 */
@Serializable
data class TambahAkunRequest(
    val entityId: String? = null,
    val name: String,
    val username: String,
    val role: String,
    val email: String? = null,
    val password: String? = null,
    val title: String? = null,
    val phone: String? = null,
    val divisionId: String? = null,
    val divisionName: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
    val memberDivisionId: String? = null,
)

/**
 * PATCH akun: kolom null tidak terkirim (tidak diubah); "" = kosongkan.
 * Pengecualian [email]: server tidak mengizinkan email dikosongkan ("" → 422),
 * jadi isian dibentuk lewat [id.co.monitorkarya.feature.entitas.perusahaan.emailUntukUbah].
 */
@Serializable
data class UbahAkunRequest(
    val id: String,
    val name: String? = null,
    val username: String? = null,
    val email: String? = null,
    val title: String? = null,
    val phone: String? = null,
    val role: String? = null,
    val entityId: String? = null,
    val isActive: Boolean? = null,
    val password: String? = null,
    val divisionId: String? = null,
    val divisionName: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
    val memberDivisionId: String? = null,
)

@Serializable
data class AkunTersimpanDto(
    val id: String,
    val name: String = "",
    val username: String? = null,
    val email: String? = null,
    val role: String = "",
    val title: String? = null,
    val isActive: Boolean? = null,
    val scopeEntityId: String? = null,
    val divisionId: String? = null,
    val projectId: String? = null,
)

@Serializable
data class AkunTersimpanResponse(
    val ok: Boolean = false,
    val account: AkunTersimpanDto? = null,
)

// ------------------------------------------------------------------
// /api/companies/users/activation
// ------------------------------------------------------------------

@Serializable
data class KelayakanAktivasiDto(
    val canActivate: Boolean = false,
)

@Serializable
data class TerbitkanAktivasiBody(
    val userId: String,
)

/**
 * Tautan aktivasi sekali pakai. Token hanya ada di fragmen [path]
 * ("/login/aktivasi#token=..."); jangan pernah dicatat log.
 */
@Serializable
data class AktivasiTerbitDto(
    val userId: String = "",
    val username: String = "",
    val path: String = "",
    val expiresAt: String = "",
)

@Serializable
data class TerbitkanAktivasiJawaban(
    val ok: Boolean = false,
    val activation: AktivasiTerbitDto? = null,
)
