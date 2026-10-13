// Kontrak JSON tab Proyek — dicocokkan dengan rute server (baca saja):
//   src/app/api/projects/route.ts (GET daftar/opsi, POST, PATCH, DELETE)
//   src/app/api/projects/approve/route.ts (POST keputusan slot)
//   src/app/api/project-stages/route.ts (tahapan bertanggal)
//   src/app/api/deadline-proposals/route.ts (usul geser tenggat)
//   src/app/api/daily-reports/route.ts (riwayat laporan per proyek)
//   src/app/api/outputs/route.ts (output proyek, baca)
//   src/app/api/escalations/route.ts (eskalasi, saringan server ?projectId=)
//   src/app/api/undo/route.ts (tiket Urungkan)
// Semua kolom yang bisa absen/null diberi bawaan agar server boleh menambah
// atau menghilangkan kolom opsional tanpa memecah dekode (mkJson ignoreUnknownKeys).
package id.co.monitorkarya.feature.proyek.data

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

/* ------------------------------------------------------------------ */
/* GET /api/projects — daftar                                          */
/* ------------------------------------------------------------------ */

@Serializable
data class DaftarProyekDto(
    val items: List<ProyekDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    val summary: RingkasanProyekDto? = null,
)

/** Hitungan seluruh hasil dalam cakupan (bukan hanya halaman ini). */
@Serializable
data class RingkasanProyekDto(
    val running: Int = 0,
    val waiting: Int = 0,
    val resubmit: Int = 0,
    val late: Int = 0,
    val risk: Int = 0,
    val silent: Int = 0,
)

/** Satu proyek hasil `format()` route projects. */
@Serializable
data class ProyekDto(
    val id: String,
    val name: String,
    val code: String,
    val phase: String = "INISIASI",
    val lifecycle: String = "AKTIF",
    val picName: String? = null,
    val picUserId: String? = null,
    val divisionId: String? = null,
    val division: IdNamaDto? = null,
    val description: String? = null,
    val purpose: String? = null,
    val proposedBy: PengajuDto? = null,
    val proposedAt: String? = null,
    val approvalChain: List<String> = emptyList(),
    val pendingRole: String? = null,
    val approvals: List<SlotPersetujuanDto> = emptyList(),
    val relatedEntities: List<PtDto> = emptyList(),
    val startDate: String? = null,
    val targetEndDate: String? = null,
    val approvedByName: String? = null,
    val approvedAt: String? = null,
    val noApproval: Boolean = false,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val entity: EntitasDto,
    val latestReport: LaporanTerakhirDto? = null,
    val permissions: IzinProyekDto = IzinProyekDto(),
)

@Serializable
data class IdNamaDto(val id: String, val name: String)

@Serializable
data class PengajuDto(val id: String, val name: String, val role: String = "")

@Serializable
data class SlotPersetujuanDto(
    val role: String,
    /** "DISETUJUI" | "DITOLAK" | null (belum diputuskan). */
    val decision: String? = null,
    val note: String? = null,
    val decidedAt: String? = null,
    val decidedByName: String? = null,
)

@Serializable
data class PtDto(val id: String, val name: String, val code: String = "")

@Serializable
data class EntitasDto(
    val id: String,
    val name: String,
    val code: String = "",
    val region: String? = null,
)

@Serializable
data class LaporanTerakhirDto(
    val status: String,
    val progressPct: Int = 0,
    val reportDate: String,
    val isLate: Boolean = false,
    val obstacle: String? = null,
    val needsEscalation: Boolean = false,
)

/** Izin dari server per proyek — klien tidak menebak izin sendiri. */
@Serializable
data class IzinProyekDto(
    val manage: Boolean = false,
    val setLifecycle: Boolean = false,
    val approve: Boolean = false,
    val resubmit: Boolean = false,
)

/* ------------------------------------------------------------------ */
/* GET /api/projects?options=1 — pilihan formulir                       */
/* ------------------------------------------------------------------ */

@Serializable
data class OpsiProyekDto(
    val entity: PtDto? = null,
    /** true = PT terpaku pada cakupan akun (tidak perlu memilih PT). */
    val entityPinned: Boolean = false,
    val entities: List<PtDto> = emptyList(),
    val candidates: List<KandidatPicDto> = emptyList(),
    val divisions: List<IdNamaDto> = emptyList(),
    /** Rantai penyetuju untuk peran pengaju; kosong = langsung aktif. */
    val chain: List<String> = emptyList(),
    val picIsSelf: Boolean = false,
)

@Serializable
data class KandidatPicDto(
    val id: String,
    val name: String,
    val email: String? = null,
    val activeProjects: Int = 0,
)

/* ------------------------------------------------------------------ */
/* POST / PATCH / DELETE /api/projects                                  */
/* ------------------------------------------------------------------ */

/**
 * POST — ajukan proyek. Bentuk badan sama dengan formulir web
 * (projects-view.tsx ProjectFormSheet.submit). `skipApproval` bawaan false
 * (tidak dikirim bila false; server memperlakukan absen = false).
 */
@Serializable
data class ProyekBaruRequest(
    val name: String,
    val description: String,
    val purpose: String,
    val phase: String,
    val picUserId: String,
    val divisionId: String,
    val startDate: String,
    val targetEndDate: String,
    val relatedEntityIds: List<String>,
    val entityId: String? = null,
    val skipApproval: Boolean = false,
)

/**
 * PATCH — ubah proyek. Kolom tanpa bawaan SELALU dikirim (termasuk daftar PT
 * terkait yang dikosongkan); `divisionId`/`lifecycle`/`startDate`/`targetEndDate`
 * hanya dikirim bila berubah (null = tidak dikirim, karena mkJson
 * encodeDefaults=false). Tanggal yang tidak diubah sengaja tidak dikirim agar
 * tenggat hasil usulan (tengah malam WIB) tidak bergeser ke 00.00 UTC dan undo
 * keputusan usulan tenggat tetap cocok (C2 R5). "" = kosongkan tanggal.
 */
@Serializable
data class UbahProyekRequest(
    val id: String,
    val name: String,
    val description: String,
    val purpose: String,
    val phase: String,
    val picUserId: String,
    val relatedEntityIds: List<String>,
    val startDate: String? = null,
    val targetEndDate: String? = null,
    val divisionId: String? = null,
    val lifecycle: String? = null,
)

/** PATCH { id, lifecycle } — ganti status saja (dipakai jalur arsip dari hapus). */
@Serializable
data class UbahStatusRequest(val id: String, val lifecycle: String)

/**
 * PATCH { id, resubmit: true } — ajukan ulang pengajuan yang ditolak.
 * `resubmit` WAJIB terkirim (server memeriksa `body.resubmit === true`); mkJson
 * memakai encodeDefaults=false, jadi tanpa @EncodeDefault nilai bawaan `true`
 * tidak ikut disandikan dan server memperlakukannya sebagai PATCH kosong (C2 K1).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class AjukanUlangRequest(
    val id: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val resubmit: Boolean = true,
)

/** Respons POST/PATCH projects. */
@Serializable
data class SimpanProyekDto(
    val ok: Boolean = false,
    val project: ProyekDto? = null,
    val undoToken: String? = null,
)

/** Respons umum `{ ok }`. */
@Serializable
data class OkDto(val ok: Boolean = false)

/** Badan galat 409 DELETE projects: `{ error, activity, canArchive }`. */
@Serializable
data class GalatHapusDto(
    val error: String? = null,
    val activity: Int = 0,
    val canArchive: Boolean = false,
)

/* ------------------------------------------------------------------ */
/* POST /api/projects/approve                                           */
/* ------------------------------------------------------------------ */

@Serializable
data class KeputusanRequest(
    val projectId: String,
    /** "DISETUJUI" | "DITOLAK". */
    val decision: String,
    val note: String,
)

@Serializable
data class KeputusanDto(
    val ok: Boolean = false,
    val lifecycle: String? = null,
    val pending: String? = null,
    val undoToken: String? = null,
)

/* ------------------------------------------------------------------ */
/* /api/project-stages                                                  */
/* ------------------------------------------------------------------ */

@Serializable
data class TahapanDto(
    val projectId: String = "",
    val targetEndDate: String? = null,
    val proposedEndDate: String? = null,
    /** Server: PIC proyek, Admin PT-nya, atau master. */
    val canEdit: Boolean = false,
    val done: Int = 0,
    val total: Int = 0,
    val items: List<TahapDto> = emptyList(),
)

@Serializable
data class TahapDto(
    val id: String,
    val name: String,
    val position: Int = 0,
    val startDate: String? = null,
    val dueDate: String? = null,
    /** BELUM_MULAI | BERJALAN | TERTAHAN | SELESAI. */
    val status: String = "BELUM_MULAI",
    val note: String? = null,
    val updatedAt: String? = null,
)

/** POST — tambah tahap. Tanggal "YYYY-MM-DD" (WIB) atau null. */
@Serializable
data class TahapBaruRequest(
    val projectId: String,
    val name: String,
    val startDate: String?,
    val dueDate: String?,
    val status: String,
    val note: String,
)

/** PUT — ubah tahap; null dikirim eksplisit agar tanggal bisa dikosongkan. */
@Serializable
data class UbahTahapRequest(
    val id: String,
    val name: String,
    val startDate: String?,
    val dueDate: String?,
    val status: String,
    val note: String,
)

/** PATCH — urutan baru (semua id tahap proyek, tanpa duplikat). */
@Serializable
data class UrutanTahapRequest(val projectId: String, val order: List<String>)

@Serializable
data class SimpanTahapDto(val ok: Boolean = false, val stage: TahapDto? = null)

/* ------------------------------------------------------------------ */
/* /api/deadline-proposals                                              */
/* ------------------------------------------------------------------ */

@Serializable
data class UsulanTenggatListDto(
    val items: List<UsulanTenggatDto> = emptyList(),
    /** Peran pemutus (Direktur entitas, Manajemen, Super Admin). */
    val canDecide: Boolean = false,
)

@Serializable
data class UsulanTenggatDto(
    val id: String,
    val projectId: String = "",
    val previousDate: String? = null,
    val proposedDate: String,
    val reason: String = "",
    /** DIAJUKAN | DISETUJUI | DITOLAK. */
    val status: String = "DIAJUKAN",
    val proposedById: String? = null,
    val decidedAt: String? = null,
    val decisionNote: String? = null,
    val createdAt: String? = null,
    val proposedByName: String? = null,
    val decidedByName: String? = null,
)

@Serializable
data class UsulTenggatRequest(
    val projectId: String,
    /** "YYYY-MM-DD" WIB, harus setelah hari ini. */
    val proposedDate: String,
    val reason: String,
)

/** PATCH { id, action: approve | reject | withdraw, note? }. */
@Serializable
data class AksiUsulanRequest(
    val id: String,
    val action: String,
    val note: String? = null,
)

/* ------------------------------------------------------------------ */
/* GET /api/daily-reports?projectId=                                    */
/* ------------------------------------------------------------------ */

@Serializable
data class RiwayatLaporanDto(
    val items: List<LaporanHarianDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
)

@Serializable
data class LaporanHarianDto(
    val id: String,
    val reportDate: String,
    val status: String,
    val progressPct: Int = 0,
    val phase: String? = null,
    val achievementToday: String? = null,
    val obstacle: String? = null,
    val followUp: String? = null,
    val needsEscalation: Boolean = false,
    val evidenceCount: Int = 0,
    val isLate: Boolean = false,
    val isLocked: Boolean = false,
    val submittedAt: String? = null,
    val forwardedAt: String? = null,
    val submittedBy: PengirimDto? = null,
)

@Serializable
data class PengirimDto(val id: String = "", val name: String = "")

/* ------------------------------------------------------------------ */
/* GET /api/outputs?projectId=                                          */
/* ------------------------------------------------------------------ */

@Serializable
data class DaftarOutputDto(
    val items: List<OutputDto> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val total: Int = 0,
)

@Serializable
data class OutputDto(
    val id: String,
    val title: String,
    val description: String? = null,
    /** DIKERJAKAN | MENUNGGU_REVIEW | PERLU_REVISI | DITERIMA. */
    val status: String,
    val dueDate: String? = null,
    val ownerName: String? = null,
    val reviewerName: String? = null,
    val revisionNote: String? = null,
    val evidenceCount: Int = 0,
)

/* ------------------------------------------------------------------ */
/* GET /api/escalations?projectId=                                      */
/* ------------------------------------------------------------------ */

@Serializable
data class DaftarEskalasiDto(
    val items: List<EskalasiDto> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class EskalasiDto(
    val id: String,
    /** DAILY_REPORT | TASK (saringan projectId tidak memuat WEEKLY_ITEM). */
    val sourceType: String = "",
    val sourceId: String = "",
    val summary: String = "",
    /** KEPUTUSAN | ANGGARAN | DUKUNGAN_LINTAS_FUNGSI. */
    val needed: String = "",
    /** DIAJUKAN | DITINJAU | DIPUTUSKAN | DITUTUP. */
    val status: String = "",
    val raisedAt: String? = null,
    val slaDays: Int = 7,
    val ageDays: Int = 0,
    val isOverdue: Boolean = false,
    val decisionText: String? = null,
    val raisedBy: PengirimDto? = null,
)

/* ------------------------------------------------------------------ */
/* POST /api/undo                                                       */
/* ------------------------------------------------------------------ */

@Serializable
data class UrungkanRequest(val token: String)

@Serializable
data class UrungkanDto(val ok: Boolean = false, val message: String? = null)
