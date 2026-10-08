package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.Serializable

/**
 * Bentuk PERSIS respons route Fase 1 (PIC) — diverifikasi dari kode 8 Okt 2026:
 *   daily-input, tasks, evidence (+upload, +[id]), work-desk (cabang PIC),
 *   projects (GET daftar), daily-reports, unlock-requests, undo, notifications.
 *
 * Konvensi: seluruh stempel waktu adalah string ISO-8601 apa adanya (server
 * memakai JSON.stringify Date); kunci tanggal laporan "YYYY-MM-DD" WIB. Galat
 * 409 yang membawa {error, locked, frozen?, reportId?} diurai di ApiError.Konflik.
 */

/* ------------------------------------------------------------------ */
/* Bersama                                                            */
/* ------------------------------------------------------------------ */

/** Sisa waktu menuju tenggat 17.00 WIB (src/lib/lock.ts dailyCountdown). */
@Serializable
data class CountdownDto(
    val hours: Int,
    val minutes: Int,
    val totalMs: Long,
    val passed: Boolean,
)

/** Baris bukti ringkas yang disertakan langsung di daily-input dan tasks. */
@Serializable
data class EvidenceRingkasDto(
    val id: String,
    val targetId: String,
    val fileName: String,
    val url: String? = null,
    val mime: String,
    val size: Int,
    val createdAt: String,
)

/** Pengguna {id, name} pada relasi picUser/createdBy di tasks. */
@Serializable
data class PenggunaRingkasDto(
    val id: String,
    val name: String,
)

/* ------------------------------------------------------------------ */
/* daily-input                                                        */
/* ------------------------------------------------------------------ */

/**
 * Isian laporan harian (PUT /api/daily-input).
 *
 * [action] "save" (draf) atau "submit" (kirim); [status] salah satu
 * SELESAI/ON_PROGRESS/TERKENDALA/MENUNGGU_KEPUTUSAN/TIDAK_ADA_PERUBAHAN —
 * string kosong berarti diturunkan dari task hari itu; [reportDate] kunci
 * "YYYY-MM-DD" WIB (bawaan hari ini bila dikosongkan — klien selalu mengisi).
 */
@Serializable
data class DailyInputRequest(
    val projectId: String,
    val action: String,
    val status: String,
    val achievementToday: String,
    val obstacle: String? = null,
    val followUp: String? = null,
    val decisionRequestedFrom: String? = null,
    val progressPct: Int,
    val reportDate: String,
)

/** Respons PUT /api/daily-input — TIDAK membawa undoToken. */
@Serializable
data class DailyInputPutResponse(
    val ok: Boolean = false,
    val reportId: String,
    val submitted: Boolean = false,
    val derivedFromTasks: Boolean = false,
)

/** GET /api/daily-input?date= — meja laporan satu hari (bawaan hari ini). */
@Serializable
data class DailyInputGetResponse(
    val reportDate: String,
    val reportDateKey: String,
    val today: Boolean = false,
    val todayKey: String,
    val lockAt: String,
    val locked: Boolean = false,
    val countdown: CountdownDto,
    val canRequestUnlock: Boolean = false,
    val openDays: List<DailyOpenDayDto> = emptyList(),
    val projects: List<DailyInputProjectDto> = emptyList(),
)

/** Hari lain yang sedang dibuka (unlock aktif) milik proyek yang terlihat. */
@Serializable
data class DailyOpenDayDto(
    val reportId: String,
    val projectId: String,
    val projectName: String,
    val date: String,
    val unlockUntil: String? = null,
)

/** Satu proyek di meja harian beserta laporan dan status kuncinya. */
@Serializable
data class DailyInputProjectDto(
    val id: String,
    val code: String,
    val name: String,
    val phase: String,
    val taskCount: Int = 0,
    val derived: Boolean = false,
    val editable: Boolean = false,
    /** "FORWARDED" | "LOCKED" | "TIME" | null (null = boleh diedit). */
    val lockReason: String? = null,
    val unlock: UnlockInfoDto? = null,
    val report: DailyReportIsiDto? = null,
)

/** Status buka kunci yang relevan untuk satu laporan. */
@Serializable
data class UnlockInfoDto(
    val id: String,
    val status: String,
    val unlockUntil: String? = null,
)

/** Isi laporan harian yang tersimpan untuk hari itu. */
@Serializable
data class DailyReportIsiDto(
    val id: String,
    val status: String,
    val progressPct: Int = 0,
    val achievementToday: String,
    val obstacle: String? = null,
    val followUp: String? = null,
    val decisionRequestedFrom: String? = null,
    val evidenceCount: Int = 0,
    val submittedAt: String? = null,
    val forwardedAt: String? = null,
    val isLocked: Boolean = false,
    val evidence: List<EvidenceRingkasDto> = emptyList(),
)

/* ------------------------------------------------------------------ */
/* tasks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Badan POST dan PUT /api/tasks — kolom persis yang dibaca readBody().
 *
 * Catatan penting (mkJson memakai encodeDefaults=false, jadi properti bernilai
 * bawaan TIDAK dikirim): [projectId] untuk POST saja, [id] untuk PUT saja;
 * [picUserId] null berarti tidak dikirim (PUT mempertahankan PIC lama) — kirim
 * string kosong "" untuk melepasnya; [context] "HARIAN"|"MINGGUAN";
 * [workDate] "YYYY-MM-DD"; [scope] "HARIAN"|"MINGGUAN"; [week] kunci ISO
 * "2026-W37"; [startTime]/[endTime] "HH:MM" WIB.
 */
@Serializable
data class TaskSaveRequest(
    val title: String,
    val projectId: String? = null,
    val id: String? = null,
    val context: String? = null,
    val week: String? = null,
    val workDate: String? = null,
    val scope: String? = null,
    val description: String? = null,
    val picName: String? = null,
    val picUserId: String? = null,
    val tags: List<String> = emptyList(),
    val status: String = "BELUM_MULAI",
    val progressPct: Int = 0,
    val urgency: String = "SEDANG",
    val obstacle: String? = null,
    val decisionNeeded: String? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val subtasks: List<SubtaskInputDto> = emptyList(),
)

/** Subtask pada badan simpan task: hanya judul dan tanda selesai. */
@Serializable
data class SubtaskInputDto(
    val title: String,
    val isDone: Boolean = false,
)

/** Respons POST/PUT /api/tasks. */
@Serializable
data class TaskSaveResponse(
    val ok: Boolean = false,
    val task: TaskDto,
)

/** Task utuh hasil include TASK_INCLUDE + evidence (GET/POST/PUT tasks). */
@Serializable
data class TaskDto(
    val id: String,
    val projectId: String,
    val entityId: String,
    val workDate: String,
    val title: String,
    val description: String? = null,
    val tags: List<String> = emptyList(),
    val picUserId: String? = null,
    val picName: String? = null,
    val startAt: String? = null,
    val endAt: String? = null,
    val durationMin: Int? = null,
    val status: String,
    val progressPct: Int = 0,
    val urgency: String,
    val sortOrder: Int = 0,
    val scope: String,
    val obstacle: String? = null,
    val decisionNeeded: String? = null,
    val escalationId: String? = null,
    val createdById: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val subtasks: List<SubtaskDto> = emptyList(),
    val picUser: PenggunaRingkasDto? = null,
    val escalation: TaskEskalasiDto? = null,
    val evidence: List<EvidenceRingkasDto> = emptyList(),
)

/** Baris subtask utuh (pemilik weeklyItemId selalu null di task harian). */
@Serializable
data class SubtaskDto(
    val id: String,
    val taskId: String? = null,
    val weeklyItemId: String? = null,
    val title: String,
    val isDone: Boolean = false,
    val position: Int = 0,
    val createdAt: String,
)

/** Relasi eskalasi pada task: {id, status, needed, decisionText}. */
@Serializable
data class TaskEskalasiDto(
    val id: String,
    val status: String,
    val needed: String,
    val decisionText: String? = null,
)

/** GET /api/tasks?projectId=&date= — lajur satu hari. */
@Serializable
data class TasksDayResponse(
    val workDate: String,
    val locked: Boolean = false,
    /** "FORWARDED" | "LOCKED" | null. */
    val frozen: String? = null,
    val reportId: String? = null,
    val unlockUntil: String? = null,
    val tasks: List<TaskDto> = emptyList(),
)

/** GET /api/tasks?projectId=&week= — papan mingguan. */
@Serializable
data class TasksWeekResponse(
    val mode: String,
    val period: PeriodMingguanDto,
    val locked: Boolean = false,
    val frozenDays: List<String> = emptyList(),
    val today: String,
    val days: List<String> = emptyList(),
    val tasks: List<TaskDto> = emptyList(),
)

/** Periode ISO minggu papan mingguan. */
@Serializable
data class PeriodMingguanDto(
    val key: String,
    val start: String,
    val end: String,
    val lockAt: String,
    val current: Boolean = false,
)

/** Badan PATCH /api/tasks — seret-lepas kartu di papan mingguan. */
@Serializable
data class TaskMovesRequest(
    val projectId: String,
    val week: String,
    val moves: List<TaskMoveDto>,
)

/** Satu perintah pindah: lajur tujuan "MINGGUAN" atau tanggal "YYYY-MM-DD". */
@Serializable
data class TaskMoveDto(
    val id: String,
    val lane: String,
    val sortOrder: Int,
)

/** Respons PATCH /api/tasks. */
@Serializable
data class TaskMovedResponse(
    val ok: Boolean = false,
    val moved: Int = 0,
)

/* ------------------------------------------------------------------ */
/* evidence                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/evidence?targetType=&targetId= — baris bukti utuh. */
@Serializable
data class EvidenceListResponse(
    val items: List<EvidenceItemDto> = emptyList(),
    val total: Int = 0,
)

/** Baris tabel Evidence (semua kolom; tautan luar punya url, unggahan null). */
@Serializable
data class EvidenceItemDto(
    val id: String,
    val targetType: String,
    val targetId: String,
    val storageKey: String,
    val fileName: String,
    val mime: String,
    val size: Int,
    val url: String? = null,
    val uploadedById: String? = null,
    val createdAt: String,
)

/** POST /api/evidence — lampirkan tautan http(s) berlabel. */
@Serializable
data class EvidenceLinkRequest(
    val targetType: String,
    val targetId: String,
    val fileName: String,
    val url: String,
)

/** Respons POST /api/evidence dan POST /api/evidence/upload. */
@Serializable
data class EvidenceAttachResponse(
    val ok: Boolean = false,
    val evidence: EvidenceItemDto,
    val evidenceCount: Int = 0,
)

/** Respons POST /api/evidence/upload (multipart) — bukti unggahan. */
@Serializable
data class EvidenceUploadResponse(
    val ok: Boolean = false,
    val evidence: EvidenceUploadItemDto,
    val evidenceCount: Int = 0,
)

/** Bentuk bukti unggahan: url selalu null (dibaca lewat tautan bertanda). */
@Serializable
data class EvidenceUploadItemDto(
    val id: String,
    val fileName: String,
    val mime: String,
    val size: Int,
    val storageKey: String,
    val url: String? = null,
    val createdAt: String,
)

/** GET /api/evidence/{id} — cara membuka satu bukti. */
@Serializable
data class EvidenceUrlResponse(
    val url: String,
    /** "link" (tautan luar) atau "file" (tautan bertanda sementara). */
    val kind: String,
    val expiresInSeconds: Int? = null,
)

/** DELETE /api/evidence/{id}. */
@Serializable
data class EvidenceDeleteResponse(
    val ok: Boolean = false,
    val evidenceCount: Int = 0,
)

/* ------------------------------------------------------------------ */
/* work-desk (cabang PIC — Fase 1)                                    */
/* ------------------------------------------------------------------ */

/**
 * GET /api/work-desk untuk PIC_PROYEK. Server memilih bentuk menurut peran
 * (kind "PIC"|"KADIV"|"ADMIN"); DTO ini hanya milik cabang PIC — dekode untuk
 * peran lain gagal dan memang belum didukung sampai Fase 2.
 */
@Serializable
data class WorkDeskPicResponse(
    val kind: String,
    val today: String,
    val lockAt: String,
    val locked: Boolean = false,
    val countdown: CountdownDto,
    val cutoffLabel: String,
    val days: List<String> = emptyList(),
    val projects: List<PicProyekDto> = emptyList(),
)

/** Satu proyek PIC di meja kerja: tugas hari ini, laporan, riwayat, pengingat. */
@Serializable
data class PicProyekDto(
    val id: String,
    val code: String,
    val name: String,
    val phase: String,
    val startDate: String? = null,
    val targetEndDate: String? = null,
    val entityName: String,
    val tasks: PicTugasHariIniDto,
    val report: PicLaporanHariIniDto? = null,
    val history: List<PicRiwayatDto> = emptyList(),
    val remindedAt: String? = null,
    val remindedBy: String? = null,
)

/** Hitungan tugas hari ini milik satu proyek. */
@Serializable
data class PicTugasHariIniDto(
    val total: Int = 0,
    val done: Int = 0,
    val blocked: Int = 0,
)

/** Ringkasan laporan hari ini milik satu proyek. */
@Serializable
data class PicLaporanHariIniDto(
    val status: String,
    val progressPct: Int = 0,
    val submittedAt: String? = null,
    val forwardedAt: String? = null,
    val isLate: Boolean = false,
    val evidenceCount: Int = 0,
)

/** Satu hari kerja dalam riwayat 10 hari PIC. */
@Serializable
data class PicRiwayatDto(
    val date: String,
    val submitted: Boolean = false,
    val isLate: Boolean = false,
    val status: String? = null,
    val progressPct: Int? = null,
)

/**
 * POST /api/work-desk — [action] "remind-pic" (dengan [projectId]) atau
 * "remind-all-pics". Aksi Admin PT; PIC tidak memakainya di Fase 1, tetapi
 * kontraknya ditulis lengkap agar paritas terjaga.
 */
@Serializable
data class WorkDeskAksiRequest(
    val action: String,
    val projectId: String? = null,
)

/**
 * Respons POST /api/work-desk: remind-pic mengisi projectId/picName/remindedAt;
 * remind-all-pics mengisi sent/skipped.
 */
@Serializable
data class WorkDeskAksiResponse(
    val ok: Boolean = false,
    val projectId: String? = null,
    val picName: String? = null,
    val remindedAt: String? = null,
    val sent: Int? = null,
    val skipped: Int? = null,
)

/* ------------------------------------------------------------------ */
/* projects (GET daftar)                                              */
/* ------------------------------------------------------------------ */

/** GET /api/projects — daftar proyek dalam cakupan sesi. */
@Serializable
data class ProjectsListResponse(
    val items: List<ProjectDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    val summary: ProjectsSummaryDto,
)

/** Hitungan ringkas seluruh hasil dalam cakupan yang sama. */
@Serializable
data class ProjectsSummaryDto(
    val running: Int = 0,
    val waiting: Int = 0,
    val resubmit: Int = 0,
    val late: Int = 0,
    val risk: Int = 0,
    val silent: Int = 0,
)

/** Satu proyek hasil format() route projects. */
@Serializable
data class ProjectDto(
    val id: String,
    val name: String,
    val code: String,
    val phase: String,
    val lifecycle: String,
    val picName: String? = null,
    val picUserId: String? = null,
    val divisionId: String? = null,
    val division: ProjectDivisiDto? = null,
    val description: String? = null,
    val purpose: String? = null,
    val proposedBy: ProjectPengusulDto? = null,
    val proposedAt: String? = null,
    val approvalChain: List<String> = emptyList(),
    /** Slot yang menunggu keputusan saat lifecycle DIUSULKAN. */
    val pendingRole: String? = null,
    val approvals: List<ProjectSlotDto> = emptyList(),
    val relatedEntities: List<ProjectPtDto> = emptyList(),
    val startDate: String? = null,
    val targetEndDate: String? = null,
    val approvedByName: String? = null,
    val approvedAt: String? = null,
    val noApproval: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
    val entity: ProjectEntityDto,
    val latestReport: ProjectLaporanDto? = null,
    val permissions: ProjectPermissionsDto,
)

/** Divisi pelaksana {id, name}. */
@Serializable
data class ProjectDivisiDto(
    val id: String,
    val name: String,
)

/** Pengusul proyek {id, name, role}. */
@Serializable
data class ProjectPengusulDto(
    val id: String,
    val name: String,
    val role: String,
)

/** Satu slot rantai persetujuan; belum diisi berarti decision null. */
@Serializable
data class ProjectSlotDto(
    val role: String,
    val decision: String? = null,
    val note: String? = null,
    val decidedAt: String? = null,
    val decidedByName: String? = null,
)

/** PT terkait {id, name, code}. */
@Serializable
data class ProjectPtDto(
    val id: String,
    val name: String,
    val code: String,
)

/** PT pemilik {id, name, code, region}. */
@Serializable
data class ProjectEntityDto(
    val id: String,
    val name: String,
    val code: String,
    val region: String,
)

/** Laporan harian terakhir proyek. */
@Serializable
data class ProjectLaporanDto(
    val status: String,
    val progressPct: Int = 0,
    val reportDate: String,
    val isLate: Boolean = false,
    val obstacle: String? = null,
    val needsEscalation: Boolean = false,
)

/** Hak akun ini atas proyek tersebut. */
@Serializable
data class ProjectPermissionsDto(
    val manage: Boolean = false,
    val setLifecycle: Boolean = false,
    val approve: Boolean = false,
    val resubmit: Boolean = false,
)

/* ------------------------------------------------------------------ */
/* daily-reports                                                      */
/* ------------------------------------------------------------------ */

/** GET /api/daily-reports — daftar laporan harian tersaring. */
@Serializable
data class DailyReportsListResponse(
    val items: List<DailyReportRowDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
)

/** Baris laporan harian utuh beserta proyek, entitas, dan pengirimnya. */
@Serializable
data class DailyReportRowDto(
    val id: String,
    val projectId: String,
    val entityId: String,
    val reportDate: String,
    val status: String,
    val progressPct: Int = 0,
    val phase: String,
    val achievementToday: String,
    val obstacle: String? = null,
    val followUp: String? = null,
    val followUpTargetDate: String? = null,
    val decisionRequestedFrom: String? = null,
    val needsEscalation: Boolean = false,
    val evidenceCount: Int = 0,
    val isLocked: Boolean = false,
    val lockedAt: String? = null,
    val isLate: Boolean = false,
    val submittedById: String? = null,
    val submittedAt: String? = null,
    val forwardedById: String? = null,
    val forwardedAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val project: DailyReportProjectDto,
    val entity: ProjectEntityDto,
    val submittedBy: DailyReportPengirimDto? = null,
)

/** Proyek {id, name, code} pada baris laporan. */
@Serializable
data class DailyReportProjectDto(
    val id: String,
    val name: String,
    val code: String,
)

/** Pengirim {id, name, email} pada baris laporan. */
@Serializable
data class DailyReportPengirimDto(
    val id: String,
    val name: String,
    val email: String,
)

/* ------------------------------------------------------------------ */
/* unlock-requests                                                    */
/* ------------------------------------------------------------------ */

/** GET /api/unlock-requests — daftar dalam cakupan pengaju. */
@Serializable
data class UnlockListResponse(
    val items: List<UnlockRequestDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 30,
    val can: UnlockCapabilitiesDto,
    val me: String,
)

/** Hak akun atas alur buka kunci. */
@Serializable
data class UnlockCapabilitiesDto(
    val request: Boolean = false,
    val approve: Boolean = false,
    val execute: Boolean = false,
)

/**
 * Baris pengajuan buka kunci utuh. Pada respons GET ada relasi requestedBy/
 * approvedBy/executedBy; pada respons POST (baris baru) ketiganya absen —
 * karenanya semuanya nullable.
 */
@Serializable
data class UnlockRequestDto(
    val id: String,
    val targetType: String,
    val targetId: String,
    val requestedById: String? = null,
    val reason: String,
    val status: String,
    val approvedById: String? = null,
    val approvedAt: String? = null,
    val executedById: String? = null,
    val executedAt: String? = null,
    val unlockUntil: String? = null,
    val reLockedAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val requestedBy: DailyReportPengirimDto? = null,
    val approvedBy: DailyReportPengirimDto? = null,
    val executedBy: DailyReportPengirimDto? = null,
    val targetLabel: String,
)

/** POST /api/unlock-requests — ajukan buka kunci satu laporan. */
@Serializable
data class UnlockCreateRequest(
    /** "DAILY_REPORT" | "WEEKLY_REPORT". */
    val targetType: String,
    val targetId: String,
    /** Minimal 10 karakter, maksimal 500. */
    val reason: String,
)

/** Respons POST /api/unlock-requests (status 201). */
@Serializable
data class UnlockCreateResponse(
    val ok: Boolean = false,
    val item: UnlockRequestDto,
)

/* ------------------------------------------------------------------ */
/* undo                                                               */
/* ------------------------------------------------------------------ */

/** POST /api/undo — badan {token}; tiket dari kolom undoToken route asal. */
@Serializable
data class UndoRequest(
    val token: String,
)

/** Respons POST /api/undo saat berhasil. */
@Serializable
data class UndoResponse(
    val ok: Boolean = false,
    val action: String,
    val targetType: String,
    val targetId: String,
    val message: String,
)

/* ------------------------------------------------------------------ */
/* notifications                                                      */
/* ------------------------------------------------------------------ */

/**
 * GET /api/notifications?inbox=1 — lonceng dalam aplikasi. (Nama dibedakan
 * dari InboxResponse Fase 2 yang untuk meja Admin PT.)
 */
@Serializable
data class NotificationsInboxResponse(
    val unread: Int = 0,
    val items: List<InboxItemDto> = emptyList(),
)

/** Satu pesan dalam aplikasi: payload sudah diurai menjadi judul dan isi. */
@Serializable
data class InboxItemDto(
    val id: String,
    val template: String,
    val title: String,
    val body: String,
    val tab: String? = null,
    val createdAt: String,
    val readAt: String? = null,
)

/** GET /api/notifications (tanpa inbox) — log kiriman milik akun sendiri. */
@Serializable
data class NotificationListResponse(
    val items: List<NotificationLogDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 50,
)

/** Baris NotificationLog utuh (payload masih string JSON mentah). */
@Serializable
data class NotificationLogDto(
    val id: String,
    val userId: String? = null,
    val channel: String,
    val recipient: String,
    val template: String,
    val payload: String,
    val status: String,
    val error: String? = null,
    val sentAt: String? = null,
    val readAt: String? = null,
    val createdAt: String,
    val user: DailyReportPengirimDto? = null,
)

/**
 * PATCH /api/notifications — tandai dibaca: sejumlah [ids], atau semua bila
 * [all] true (ids kosong tidak dikirim karena encodeDefaults=false).
 */
@Serializable
data class TandaiBacaRequest(
    val ids: List<String> = emptyList(),
    val all: Boolean = false,
)

/** Respons PATCH /api/notifications. */
@Serializable
data class TandaiBacaResponse(
    val ok: Boolean = false,
    val marked: Int = 0,
)
