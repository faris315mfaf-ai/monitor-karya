// DTO tab Log aktivitas + Sistem & akses (gelombang A2).
// Kontrak dibaca langsung dari rute server:
//   src/app/api/audit-logs/route.ts            → AuditLogListDto
//   src/app/api/system/route.ts                → SistemDto (+ locking.perEntity[] T13)
//   src/app/api/access-requests/route.ts       → PengajuanAksesListDto / PutusanResponseDto
//   src/app/api/roles/route.ts                 → PeranListDto
//   src/app/api/health/ready/route.ts          → KesiapanDto
// Semua kolom yang tidak dijamin server diberi nilai bawaan agar respons lama
// tetap terbaca (mkJson: ignoreUnknownKeys + coerceInputValues).
package id.co.monitorkarya.feature.audit.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ------------------------------------------------------------------
// /api/audit-logs
// ------------------------------------------------------------------

@Serializable
data class AktorDto(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",
)

@Serializable
data class AuditLogDto(
    val id: String,
    val actorId: String? = null,
    val actor: AktorDto? = null,
    val action: String = "",
    val targetType: String = "",
    val targetId: String = "",
    /** JSON bebas (objek, larik, string mentah) atau null — selalu ditampilkan sebagai teks. */
    val beforeData: JsonElement? = null,
    val afterData: JsonElement? = null,
    val ip: String? = null,
    val userAgent: String? = null,
    /** ISO UTC. */
    val at: String = "",
)

@Serializable
data class AuditLogListDto(
    val items: List<AuditLogDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    /** Pemegang audit:read boleh mengunduh CSV (/api/audit-logs/export). */
    val canExport: Boolean = false,
)

// ------------------------------------------------------------------
// /api/system
// ------------------------------------------------------------------

@Serializable
data class BukaKunciTeknisDto(
    val waitingApproval: Int = 0,
    val waitingExecution: Int = 0,
    val activeNow: Int = 0,
)

@Serializable
data class CronDto(
    val job: String = "",
    val label: String = "",
    val schedule: String = "",
    val lastAt: String? = null,
    /** on | late | neutral */
    val health: String = "neutral",
)

@Serializable
data class PengingatTeknisDto(
    val enabled: Int = 0,
    val total: Int = 0,
    val lastRunAt: String? = null,
)

@Serializable
data class AkunTeknisDto(
    val active: Int = 0,
    val inactive: Int = 0,
    val neverLoggedIn: Int = 0,
    val noPassword: Int = 0,
    /** null = kolom belum dimigrasi. */
    val mustChange: Int? = null,
)

@Serializable
data class NotifTeknisDto(val failed7d: Int = 0)

@Serializable
data class TeknisDto(
    val unlocks: BukaKunciTeknisDto = BukaKunciTeknisDto(),
    val accessPending: Int? = null,
    val cron: List<CronDto> = emptyList(),
    val reminders: PengingatTeknisDto? = null,
    val accounts: AkunTeknisDto = AkunTeknisDto(),
    val notifications: NotifTeknisDto = NotifTeknisDto(),
)

@Serializable
data class AturanPengingatDto(
    val kind: String = "",
    val enabled: Boolean = false,
    /** "HH:MM" WIB. */
    val time: String = "",
    /** 1 = Senin … 7 = Minggu; null = setiap hari kerja. */
    val weekday: Int? = null,
    /**
     * Ambang hari ESKALASI_KADIV. Berasal dari JSON `params` bebas di server
     * (system-status.ts daysParam: `typeof === 'number'`), jadi bisa pecahan;
     * Int? akan memecah dekode SELURUH /api/system (C1-R5).
     */
    val days: Double? = null,
    val lastRunAt: String? = null,
)

@Serializable
data class PengingatPtDto(
    val entityId: String = "",
    val entityName: String = "",
    val entityCode: String = "",
    val rules: List<AturanPengingatDto> = emptyList(),
)

@Serializable
data class PeranAksesDto(
    val role: String = "",
    val count: Int = 0,
    val capabilities: Int = 0,
)

@Serializable
data class AkunRingkasDto(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",
    val lastLoginAt: String? = null,
    val hasPassword: Boolean = false,
    val scopeEntityId: String? = null,
)

@Serializable
data class AksesDto(
    val byRole: List<PeranAksesDto> = emptyList(),
    val inactiveUsers: Int = 0,
    val noPassword: Int = 0,
    val users: List<AkunRingkasDto> = emptyList(),
)

@Serializable
data class HitungMundurDto(
    val hours: Int = 0,
    val minutes: Int = 0,
    val passed: Boolean = false,
)

/** Rincian penguncian satu PT (locking.perEntity[], T13 — ReportSettings per entitas). */
@Serializable
data class KunciPtDto(
    val entityId: String = "",
    val name: String = "",
    val code: String = "",
    /** "17.00 WIB", "24.00 WIB" (24/7), atau "ditutup". */
    val dailyCutoff: String = "",
    val dailyOpen: Boolean = true,
    val dailyLockAt: String? = null,
    val dailyLocked: Boolean = false,
    /** ISO 1 = Senin … 7 = Minggu; kosong = setiap hari. */
    val workingDays: List<Int> = emptyList(),
    val weeklyOpen: Boolean = true,
    val weeklyHandoverBy: String? = null,
    val weeklyLockAt: String? = null,
)

@Serializable
data class PenguncianDto(
    /** Label seragam ("17.00 WIB") atau "beragam per PT". */
    val dailyCutoff: String = "",
    val dailyLockAt: String? = null,
    val dailyLocked: Boolean = false,
    val dailyCountdown: HitungMundurDto = HitungMundurDto(),
    val weeklyHandoverBy: String? = null,
    val weeklyLockAt: String? = null,
    val perEntity: List<KunciPtDto> = emptyList(),
    val lockedToday: Int = 0,
    val pendingUnlocks: Int = 0,
)

@Serializable
data class NotifDto(val sent: Int = 0, val failed: Int = 0)

@Serializable
data class VolumeDto(
    val entities: Int = 0,
    val projects: Int = 0,
    val divisions: Int = 0,
    val dailyReports: Int = 0,
    val weeklyReports: Int = 0,
    val evidence: Int = 0,
    val auditLogs: Int = 0,
)

@Serializable
data class AuditTerakhirDto(
    val id: String = "",
    val action: String = "",
    val at: String = "",
    val actorName: String = "Sistem",
    val actorRole: String? = null,
    val targetType: String = "",
)

@Serializable
data class SistemDto(
    val technical: TeknisDto? = null,
    /** null = tabel aturan pengingat belum dimigrasi; kosong = belum ada PT. */
    val reminders: List<PengingatPtDto>? = null,
    val access: AksesDto = AksesDto(),
    val locking: PenguncianDto = PenguncianDto(),
    val notifications: NotifDto = NotifDto(),
    val data: VolumeDto = VolumeDto(),
    val recentAudit: List<AuditTerakhirDto> = emptyList(),
)

// ------------------------------------------------------------------
// /api/access-requests
// ------------------------------------------------------------------

@Serializable
data class OrangDto(val id: String = "", val name: String = "")

@Serializable
data class PengajuanAksesDto(
    val id: String,
    /** AKUN_BARU | AKSES_SEMENTARA | PINDAH_PERAN */
    val type: String = "",
    /** DIAJUKAN | DISETUJUI | DITOLAK */
    val status: String = "",
    val title: String = "",
    val detail: String = "",
    val reason: String? = null,
    val entityId: String? = null,
    val entityName: String? = null,
    val requester: OrangDto? = null,
    val target: OrangDto? = null,
    val decidedBy: OrangDto? = null,
    val decidedAt: String? = null,
    val decisionNote: String? = null,
    val expiresAt: String? = null,
    val revertedAt: String? = null,
    val createdAt: String = "",
    val canDecide: Boolean = false,
    val canActivate: Boolean = false,
)

@Serializable
data class PengajuanAksesListDto(
    val items: List<PengajuanAksesDto> = emptyList(),
    val pending: Int = 0,
    val canDecide: Boolean = false,
)

@Serializable
data class PutusanAksesRequest(
    val id: String,
    /** approve | reject */
    val decision: String,
    val note: String? = null,
)

/**
 * Respons PATCH. Kolom `activation` (tautan aktivasi sekali pakai untuk
 * AKUN_BARU) sengaja TIDAK dideklarasikan: aktivasi tetap diserahkan lewat
 * web (Rancangan §2), token tidak pernah disimpan objek Kotlin.
 */
@Serializable
data class PutusanAksesResponse(
    val ok: Boolean = false,
    val item: PengajuanAksesDto? = null,
)

// ------------------------------------------------------------------
// /api/roles dan /api/health/ready
// ------------------------------------------------------------------

@Serializable
data class AnggotaPeranDto(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",
    val scopeEntityId: String? = null,
    val lastLoginAt: String? = null,
)

@Serializable
data class KelompokPeranDto(
    val role: String = "",
    val label: String = "",
    val users: List<AnggotaPeranDto> = emptyList(),
)

@Serializable
data class PeranListDto(val roles: List<KelompokPeranDto> = emptyList())

@Serializable
data class KesiapanDto(
    val ok: Boolean = false,
    /** ready | degraded | unavailable */
    val status: String = "",
)
