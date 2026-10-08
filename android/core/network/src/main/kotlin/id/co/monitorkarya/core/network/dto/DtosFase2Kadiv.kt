package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.Serializable

/**
 * DTO Fase 2 kepala divisi + capaian mingguan [T6-C1]. Bentuk PERSIS dari rute:
 *   - src/app/api/weekly-input/route.ts             (papan butir capaian mingguan)
 *   - src/app/api/weekly-reports/route.ts           (arsip laporan mingguan)
 *   - src/app/api/kadiv/team/route.ts               (tim kepala divisi)
 *   - src/app/api/kadiv/members/route.ts            (keanggotaan divisi)
 *   - src/app/api/kadiv/weekly-summary/route.ts     (ringkasan mingguan untuk Direktur)
 *   - src/app/api/ringkasan/laporan-dibaca/route.ts (tanda baca pengawas)
 *
 * Konvensi (sama dengan DtosFase1/DtosFase2Admin): seluruh stempel waktu string
 * ISO-8601 apa adanya; kunci minggu "2026-W41"; kunci hari "YYYY-MM-DD" WIB.
 * Field opsional diberi bawaan `= null` — mkJson tidak menulis field bernilai
 * bawaan, jadi "tidak dikirim" dan "null" TIDAK bisa dibedakan; rute-rute ini
 * memakai string kosong "" untuk "kosongkan" (lihat catatan per DTO).
 */

// ------------------------------------------------------------------
// Badan galat bersama (400/409/422/429)
// ------------------------------------------------------------------

/**
 * Badan galat rute fase ini bila pemanggil butuh lebih dari pesan
 * (ApiError.dari() tetap jalur utama penerjemahan):
 *  - weekly-input 409: {error, locked: true, frozen, reason} — reason
 *    FUTURE_WEEK | FORWARDED | PAST_WEEK | TIME_LOCKED | REPORT_LOCKED;
 *  - weekly-summary 409: {error, code, pendingReview?} — code NOT_CURRENT_WEEK
 *    | LOCKED | FORWARDED | PENDING_REVIEW | SENT;
 *  - kadiv/team remind 409/429: {error, locked?} / {error, retryAfter}.
 */
@Serializable
data class KonflikDto(
    val error: String? = null,
    val code: String? = null,
    val locked: Boolean? = null,
    val frozen: Boolean? = null,
    val reason: String? = null,
    val pendingReview: Int? = null,
    val retryAfter: Long? = null,
)

// ------------------------------------------------------------------
// weekly-input — papan butir mingguan
// ------------------------------------------------------------------

/**
 * GET /api/weekly-input?entityId=&week= — meja mingguan divisi yang dijawab
 * akun beserta laporan minggu itu. Kolom datar bentuk lama (isoYear, isoWeek,
 * periodStart, periodEnd, handoverBy, lockAt) tetap dikirim server tetapi
 * sudah terwakili [week]; tidak didekode (ignoreUnknownKeys).
 */
@Serializable
data class WeeklyInputResponse(
    val week: WeeklyPekanDto,
    /** Bentuk lama: minggu yang diminta sudah melewati kunci Jumat 17.00 WIB. */
    val locked: Boolean = false,
    /** Tujuh hari periode (Senin–Minggu), tengah malam WIB, ISO. */
    val days: List<String> = emptyList(),
    /** Delapan pilihan minggu (indeks 0 = minggu berjalan) ke belakang. */
    val weeks: List<WeeklyPilihanDto> = emptyList(),
    /** PT yang boleh dilaporkan akun ini. */
    val entities: List<WeeklyEntityDto> = emptyList(),
    /** PT yang dipilih (TI); peran berlingkup terpaku pada PT-nya. */
    val entityId: String? = null,
    val entityPinned: Boolean = false,
    val aspects: List<WeeklyAspekDto> = emptyList(),
    val priorities: List<WeeklyPrioritasDto> = emptyList(),
    val canApprove: Boolean = false,
    val canRemind: Boolean = false,
    val divisions: List<WeeklyDivisiDto> = emptyList(),
)

/** Identitas satu pekan ISO beserta kedua tenggatnya. */
@Serializable
data class WeeklyPekanDto(
    /** "2026-W41". */
    val key: String,
    val isoYear: Int,
    val isoWeek: Int,
    val start: String,
    val end: String,
    /** Tenggat serah kepala divisi ke Admin PT: Kamis 17.00 WIB. */
    val handoverBy: String,
    /** Kunci pekan (baca saja setelah ini): Jumat 17.00 WIB. */
    val lockAt: String,
    val current: Boolean = false,
)

/** Satu entri daftar minggu di pemilih. */
@Serializable
data class WeeklyPilihanDto(
    val key: String,
    val start: String,
    val end: String,
    val current: Boolean = false,
)

/** PT {id, code, name} pada daftar entitas pelapor. */
@Serializable
data class WeeklyEntityDto(
    val id: String,
    val code: String,
    val name: String,
)

/** Baris penuh tabel AspectCategory (pemilih aspek). */
@Serializable
data class WeeklyAspekDto(
    val id: String,
    val code: String,
    val name: String,
    val isActive: Boolean = true,
    val createdAt: String? = null,
)

/** Baris penuh tabel Priority (pemilih prioritas, urut weight turun). */
@Serializable
data class WeeklyPrioritasDto(
    val id: String,
    val code: String,
    val name: String,
    val weight: Int = 0,
    val createdAt: String? = null,
)

/**
 * Satu divisi di meja mingguan beserta laporannya. [writable] = false berarti
 * server menolak semua tulisan; alasannya satu kalimat di [lockReason] dan
 * [frozen] = true bila penyebabnya laporan sudah diteruskan ke holding.
 */
@Serializable
data class WeeklyDivisiDto(
    val id: String,
    val name: String,
    /** Nama tipe divisi (divisionType.name). */
    val type: String,
    val headName: String? = null,
    val writable: Boolean = false,
    val lockReason: String? = null,
    val frozen: Boolean = false,
    /** Buka kunci (UnlockRequest DIEKSEKUSI) yang sedang berlaku; null = tidak ada. */
    val unlockUntil: String? = null,
    val report: WeeklyReportHeadDto? = null,
)

/** Header laporan mingguan satu divisi + butir-butirnya. */
@Serializable
data class WeeklyReportHeadDto(
    val id: String,
    /** Lihat konstanta companion (schema: DRAFT | MENUNGGU_PERSETUJUAN | DISETUJUI | TERKUNCI). */
    val statusHeader: String,
    val submittedAt: String? = null,
    val approvedAt: String? = null,
    /** Terisi Admin PT saat meneruskan ke holding; mulai ini laporan beku. */
    val forwardedAt: String? = null,
    val isLocked: Boolean = false,
    val items: List<WeeklyItemDto> = emptyList(),
) {
    companion object {
        const val DRAFT = "DRAFT"
        const val MENUNGGU_PERSETUJUAN = "MENUNGGU_PERSETUJUAN"
        const val DISETUJUI = "DISETUJUI"
        const val TERKUNCI = "TERKUNCI"
    }
}

/**
 * Satu butir capaian (baris penuh WeeklyReportItem). Dipakai bersama oleh
 * weekly-input (dengan subtasks/evidence/escalationRaised) dan weekly-reports
 * (tanpa ketiganya — bawaan menutup field yang tidak dikirim).
 */
@Serializable
data class WeeklyItemDto(
    val id: String,
    val weeklyReportId: String,
    val aspectCategoryId: String,
    val workItem: String,
    val targetOutput: String,
    val picName: String,
    val picTitle: String,
    val targetDate: String? = null,
    /** SELESAI | ON_PROGRESS | BELUM_MULAI | TERKENDALA | NA. */
    val status: String,
    val progressPct: Int = 0,
    val achievementThisWeek: String,
    val obstacleFollowUp: String? = null,
    val priorityId: String,
    /** Ditandai otomatis bila status TERKENDALA. */
    val needsEscalation: Boolean = false,
    val evidenceCount: Int = 0,
    val tags: List<String> = emptyList(),
    val carriedOverFromId: String? = null,
    /** Hari pengerjaan "YYYY-MM-DD" WIB; null = lajur "Mingguan". */
    val workDate: String? = null,
    val position: Int = 0,
    val followUp: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val aspectCategory: WeeklyAspekRefDto,
    val priority: WeeklyPrioritasRefDto,
    /** Hanya dikirim weekly-input (urut position naik). */
    val subtasks: List<WeeklySubtaskDto> = emptyList(),
    /** Hanya dikirim weekly-input (urut createdAt turun). */
    val evidence: List<WeeklyEvidenceDto> = emptyList(),
    /** Hanya dikirim weekly-input: butir ini sudah pernah dinaikkan jadi eskalasi. */
    val escalationRaised: Boolean = false,
)

/** Aspek {id, code, name} pada butir. */
@Serializable
data class WeeklyAspekRefDto(
    val id: String,
    val code: String,
    val name: String,
)

/** Prioritas {id, code, name} pada butir; weight hanya dikirim weekly-reports. */
@Serializable
data class WeeklyPrioritasRefDto(
    val id: String,
    val code: String,
    val name: String,
    val weight: Int = 0,
)

/** Baris subtask butir mingguan (urut position; taskId selalu null di sini). */
@Serializable
data class WeeklySubtaskDto(
    val id: String,
    val taskId: String? = null,
    val weeklyItemId: String? = null,
    val title: String,
    val isDone: Boolean = false,
    val position: Int = 0,
    val createdAt: String,
)

/** Bukti yang tergantung pada butir mingguan (targetType WEEKLY_ITEM). */
@Serializable
data class WeeklyEvidenceDto(
    val id: String,
    val targetId: String,
    val fileName: String,
    val url: String? = null,
    val mime: String,
    val size: Int,
    val createdAt: String,
)

/**
 * PUT /api/weekly-input — tambah/perbarui satu butir.
 *
 * [itemId] null = butir baru. [week] null = minggu berjalan. [workDate]:
 * null = TIDAK dikirim (pertahankan hari yang ada), "" = lajur "Mingguan",
 * "YYYY-MM-DD" = hari di minggu itu (422 bila di luar pekan). [targetDate]
 * null tidak dikirim (kosong). [tags] maks 8; [subtasks] dikirim utuh
 * (maks 30) dan MENGGANTIKAN daftar lama. Teks bebas dipangkas 4000 huruf.
 * Suntingan pada laporan yang sudah diserahkan menariknya kembali ke DRAFT;
 * laporan yang sudah diteruskan ditolak 409 (beku) kecuali buka kunci aktif.
 */
@Serializable
data class WeeklyItemSaveRequest(
    val divisionId: String,
    val itemId: String? = null,
    val week: String? = null,
    val workItem: String,
    val targetOutput: String,
    val picName: String,
    val picTitle: String? = null,
    val status: String,
    val achievementThisWeek: String,
    val obstacleFollowUp: String? = null,
    val followUp: String? = null,
    val progressPct: Int,
    val aspectCategoryId: String,
    val priorityId: String,
    val targetDate: String? = null,
    val workDate: String? = null,
    val tags: List<String> = emptyList(),
    val subtasks: List<WeeklySubtaskInputDto> = emptyList(),
)

/** Subtask pada badan simpan butir: hanya judul dan tanda selesai. */
@Serializable
data class WeeklySubtaskInputDto(
    val title: String,
    val isDone: Boolean = false,
)

/** Respons PUT /api/weekly-input. */
@Serializable
data class WeeklyItemSaveResponse(
    val ok: Boolean = false,
    val reportId: String,
    val itemId: String,
)

/**
 * PATCH /api/weekly-input — seret-lepas kartu antar hari. Mengurut ulang
 * TIDAK menarik laporan kembali ke draf (isi tidak berubah, hanya letaknya).
 */
@Serializable
data class WeeklyMovesRequest(
    val divisionId: String,
    val week: String? = null,
    /** Maks 200 kartu per permintaan. */
    val moves: List<WeeklyMoveDto>,
)

/** Satu perintah pindah; [workDate] "" / null = lajur "Mingguan". */
@Serializable
data class WeeklyMoveDto(
    val itemId: String,
    val workDate: String? = null,
    val position: Int,
)

/** Respons PATCH /api/weekly-input. */
@Serializable
data class WeeklyMovesResponse(
    val ok: Boolean = false,
    val moved: Int = 0,
)

/**
 * POST /api/weekly-input — alur status laporan:
 * DRAFT --submit--> MENUNGGU_PERSETUJUAN --approve--> DISETUJUI --(Admin PT
 * meneruskan)--> beku. "submit" hanya untuk DRAFT, "approve" hanya untuk
 * MENUNGGU_PERSETUJUAN; setiap butir harus lolos validasi dulu (aspek dan
 * prioritas terpilih, uraian dan status terisi, kendala wajib saat TERKENDALA).
 */
@Serializable
data class WeeklyAksiRequest(
    val divisionId: String,
    val week: String? = null,
    val action: String,
) {
    companion object {
        const val SUBMIT = "submit"
        const val APPROVE = "approve"

        fun serahkan(divisionId: String, week: String? = null) =
            WeeklyAksiRequest(divisionId, week, SUBMIT)

        fun setujui(divisionId: String, week: String? = null) =
            WeeklyAksiRequest(divisionId, week, APPROVE)
    }
}

/** Respons POST /api/weekly-input — statusHeader baru laporan. */
@Serializable
data class WeeklyAksiResponse(
    val ok: Boolean = false,
    val statusHeader: String,
)

// ------------------------------------------------------------------
// weekly-reports — arsip laporan mingguan
// ------------------------------------------------------------------

/** GET /api/weekly-reports — daftar terpaginasi dalam cakupan entitas sesi. */
@Serializable
data class WeeklyReportsListResponse(
    val items: List<WeeklyReportRowDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    val summary: WeeklyReportsSummaryDto,
)

/** Hitungan pada saringan yang sama. */
@Serializable
data class WeeklyReportsSummaryDto(
    /** Jumlah MENUNGGU_PERSETUJUAN. */
    val waiting: Int = 0,
    /** Jumlah isLate. */
    val late: Int = 0,
)

/** Baris laporan mingguan utuh beserta divisi, PT, penyetuju, dan butirnya. */
@Serializable
data class WeeklyReportRowDto(
    val id: String,
    val divisionId: String,
    val entityId: String,
    val isoYear: Int,
    val isoWeek: Int,
    val periodStart: String,
    val periodEnd: String,
    val statusHeader: String,
    val submittedById: String? = null,
    val submittedAt: String? = null,
    val forwardedById: String? = null,
    val forwardedAt: String? = null,
    val approvedById: String? = null,
    val approvedAt: String? = null,
    /** Ringkasan sha256 isi yang disetujui (label jujur). */
    val approvalHash: String? = null,
    val isLocked: Boolean = false,
    val lockedAt: String? = null,
    val isLate: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
    val division: WeeklyDivisiRefDto,
    val entity: WeeklyEntityRowDto,
    val approvedBy: WeeklyPenggunaDto? = null,
    val items: List<WeeklyItemDto> = emptyList(),
)

/** Divisi {id, name} pada baris arsip. */
@Serializable
data class WeeklyDivisiRefDto(
    val id: String,
    val name: String,
)

/** PT pemilik {id, name, code, region} pada baris arsip. */
@Serializable
data class WeeklyEntityRowDto(
    val id: String,
    val name: String,
    val code: String,
    val region: String? = null,
)

/** Penyetuju {id, name, email} pada baris arsip. */
@Serializable
data class WeeklyPenggunaDto(
    val id: String,
    val name: String,
    val email: String,
)

// ------------------------------------------------------------------
// kadiv/team — tim kepala divisi
// ------------------------------------------------------------------

/** GET /api/kadiv/team?divisionId= — ringkasan tim divisi yang dipimpin. */
@Serializable
data class KadivTeamResponse(
    /** Hari ini, tengah malam WIB, ISO. */
    val today: String,
    /** Kunci laporan harian hari ini, 17.00 WIB, ISO. */
    val lockAt: String,
    val locked: Boolean = false,
    val cutoffLabel: String,
    /** null bila akun tidak (belum) memimpin divisi apa pun. */
    val division: KadivDivisiDto? = null,
    /** Semua divisi yang dipimpin (pemilih). */
    val divisions: List<KadivDivisiRefDto> = emptyList(),
    val projects: List<KadivProjectDto> = emptyList(),
    val members: List<KadivAnggotaDto> = emptyList(),
    /** 10 hari kerja terakhir (tengah malam WIB), lama ke baru. */
    val days: List<String> = emptyList(),
    /** Baris = members (urutan sama), kolom = days; null = cuti/sakit/izin. */
    val heat: List<List<Int?>> = emptyList(),
    val trend: List<KadivTrenDto> = emptyList(),
    val activity: List<KadivAktivitasDto> = emptyList(),
    val onTime30: KadivOnTimeDto,
    val summary: KadivTeamSummaryDto,
)

/** Divisi {id, name, entityName}. */
@Serializable
data class KadivDivisiDto(
    val id: String,
    val name: String,
    val entityName: String,
)

/** Divisi {id, name} pada pemilih. */
@Serializable
data class KadivDivisiRefDto(
    val id: String,
    val name: String,
)

/** Proyek divisi untuk Timeline dan Sheet proyek [F2-KADIV]. */
@Serializable
data class KadivProjectDto(
    val id: String,
    val code: String,
    val name: String,
    val picName: String? = null,
    val phase: String,
    val startDate: String? = null,
    val targetEndDate: String? = null,
    /** on | risk | late | done | neutral (src/lib/project-status.ts). */
    val status: String,
    val reason: String? = null,
    /** Progres laporan harian terakhir (0–100). */
    val progress: Int = 0,
    val outputs: KadivProjectOutputsDto,
    /** Tenggat output terbuka terdekat. */
    val nextOutputDue: String? = null,
    val stages: List<KadivTahapanDto> = emptyList(),
    val lastReport: KadivLaporanTerakhirDto? = null,
)

/** Rekap output per status milik satu proyek. */
@Serializable
data class KadivProjectOutputsDto(
    val total: Int = 0,
    val accepted: Int = 0,
    val pending: Int = 0,
    val revise: Int = 0,
    val open: Int = 0,
)

/** Tahapan proyek pada Sheet proyek. */
@Serializable
data class KadivTahapanDto(
    val id: String,
    val name: String,
    val status: String,
    val dueDate: String? = null,
)

/** Laporan harian terakhir proyek. */
@Serializable
data class KadivLaporanTerakhirDto(
    val date: String,
    val status: String,
    val submittedAt: String? = null,
)

/** Satu anggota tim dan keadaannya hari ini. */
@Serializable
data class KadivAnggotaDto(
    val id: String,
    val name: String,
    val title: String? = null,
    val role: String,
    val initials: String,
    /** true = tercatat lewat User.divisionId; false = masuk tim karena PIC proyek divisi. */
    val isMember: Boolean = false,
    /** HADIR | TERLAMBAT | CUTI | SAKIT | IZIN (bawaan HADIR). */
    val attendance: String,
    val attendanceNote: String? = null,
    val projects: List<KadivAnggotaProyekDto> = emptyList(),
    val report: KadivAnggotaLaporanDto,
    val today: KadivAnggotaHariIniDto,
    val load: KadivAnggotaBebanDto,
)

/** Proyek {id, code, name} yang dipikul anggota. */
@Serializable
data class KadivAnggotaProyekDto(
    val id: String,
    val code: String,
    val name: String,
)

/** Status laporan harian anggota hari ini. */
@Serializable
data class KadivAnggotaLaporanDto(
    /** TERKIRIM | BELUM | ABSEN | TIDAK_WAJIB. */
    val state: String,
    /** Proyek wajib lapor (0 bila absen / tidak wajib). */
    val required: Int = 0,
    val sent: Int = 0,
    /** Kiriman terakhir hari ini, ISO. */
    val submittedAt: String? = null,
    val remindedAt: String? = null,
    /** Kapan kepala divisi menandai laporan hari ini sudah dibaca; null = belum. */
    val readAt: String? = null,
)

/** Isi "hari ini" anggota: tugas, capaian, kendala, rencana. */
@Serializable
data class KadivAnggotaHariIniDto(
    val tasks: List<KadivAnggotaTugasDto> = emptyList(),
    val achievements: List<String> = emptyList(),
    val obstacles: List<String> = emptyList(),
    val plans: List<String> = emptyList(),
)

/** Tugas anggota hari ini. */
@Serializable
data class KadivAnggotaTugasDto(
    val id: String,
    val title: String,
    val status: String,
    val progressPct: Int = 0,
    val projectName: String,
)

/** Beban kerja anggota minggu ini (rumus workloadPct di src/lib/kadiv.ts). */
@Serializable
data class KadivAnggotaBebanDto(
    /** Persen sisa menit task terbuka terhadap kapasitas; null = tanpa kapasitas. */
    val pct: Int? = null,
    val openTasks: Int = 0,
    val openMinutes: Int = 0,
)

/** Titik tren output mingguan (8 pekan). */
@Serializable
data class KadivTrenDto(
    /** Label "M41". */
    val label: String,
    val accepted: Int = 0,
    val target: Int = 0,
)

/** Aktivitas tim 14 hari terakhir (maks 12 baris). */
@Serializable
data class KadivAktivitasDto(
    val id: String,
    val actorName: String,
    val initials: String,
    val text: String,
    val at: String,
)

/** KPI "Tepat waktu 30 hari" laporan harian proyek divisi. */
@Serializable
data class KadivOnTimeDto(
    /** null = belum ada laporan wajib. */
    val pct: Int? = null,
    val ok: Int = 0,
    val total: Int = 0,
    val target: Int = 0,
    val days: Int = 0,
    val historyComplete: Boolean? = null,
    val unknownProjects: Int? = null,
)

/** Ringkasan angka tim hari ini. */
@Serializable
data class KadivTeamSummaryDto(
    val members: Int = 0,
    val present: Int = 0,
    val absent: Int = 0,
    val absentNames: List<String> = emptyList(),
    /** Penyebut laporan harian: anggota wajib lapor yang tidak cuti. */
    val reporters: Int = 0,
    val reported: Int = 0,
    val outputsAccepted: Int = 0,
    val outputsTarget: Int = 0,
    val pendingReview: Int = 0,
    /** Rata-rata beban anggota yang punya nilai; null bila kosong. */
    val avgLoad: Int? = null,
    val overloaded: Int = 0,
)

/**
 * POST /api/kadiv/team — tiga aksi:
 *  - "remind": ingatkan yang belum mengirim laporan harian ([userId] kosong =
 *    semua anggota); sekali per proyek per hari, orang cuti dilewati;
 *  - "read" / "unread": tandai (atau batalkan) laporan harian HARI INI milik
 *    satu [userId] sudah dibaca — hanya tanda untuk kepala divisi, laporan
 *    tetap mengalir ke Admin PT.
 */
@Serializable
data class KadivTeamAksiRequest(
    val action: String,
    val userId: String? = null,
    val divisionId: String? = null,
) {
    companion object {
        const val REMIND = "remind"
        const val READ = "read"
        const val UNREAD = "unread"

        fun ingatkan(userId: String? = null, divisionId: String? = null) =
            KadivTeamAksiRequest(REMIND, userId, divisionId)

        fun tandaiBaca(userId: String, divisionId: String? = null) =
            KadivTeamAksiRequest(READ, userId, divisionId)

        fun batalTandai(userId: String, divisionId: String? = null) =
            KadivTeamAksiRequest(UNREAD, userId, divisionId)
    }
}

/** Respons aksi "remind" — pengingat yang baru terkirim dan yang dilewati. */
@Serializable
data class KadivRemindResponse(
    val ok: Boolean = false,
    /** Satu entri per proyek yang PIC-nya baru diingatkan. */
    val sent: List<KadivTerkirimDto> = emptyList(),
    val skipped: Int = 0,
)

/** Penerima pengingat {userId, name, projectId}. */
@Serializable
data class KadivTerkirimDto(
    val userId: String,
    val name: String,
    val projectId: String,
)

/** Respons aksi "read"/"unread" — laporan harian yang ditandai. */
@Serializable
data class KadivTandaiBacaResponse(
    val ok: Boolean = false,
    val reportIds: List<String> = emptyList(),
)

// ------------------------------------------------------------------
// kadiv/members — keanggotaan divisi
// ------------------------------------------------------------------

/** GET /api/kadiv/members?divisionId= — anggota, calon anggota, dan proyek PT. */
@Serializable
data class KadivMembersResponse(
    val division: KadivDivisiKelolaDto,
    /** Akun aktif peran PIC proyek di PT yang sama (kandidat + anggota). */
    val people: List<KadivOrangDto> = emptyList(),
    /** Proyek AKTIF di PT divisi, dengan divisinya masing-masing. */
    val projects: List<KadivProyekAnggotaDto> = emptyList(),
)

/** Divisi yang sedang diatur {id, name, entityId, entityName, headUserId}. */
@Serializable
data class KadivDivisiKelolaDto(
    val id: String,
    val name: String,
    val entityId: String,
    val entityName: String,
    val headUserId: String? = null,
)

/** Satu akun di daftar orang. */
@Serializable
data class KadivOrangDto(
    val id: String,
    val name: String,
    val title: String? = null,
    val role: String,
    val divisionId: String? = null,
    val divisionName: String? = null,
    /** true bila sudah tercatat sebagai anggota divisi ini. */
    val isMember: Boolean = false,
)

/** Satu proyek di daftar proyek PT. */
@Serializable
data class KadivProyekAnggotaDto(
    val id: String,
    val code: String,
    val name: String,
    val picName: String? = null,
    val divisionId: String? = null,
    val divisionName: String? = null,
)

/**
 * PUT /api/kadiv/members — TEPAT SATU pasang: [userId] + [member] (masukkan /
 * keluarkan anggota, mengubah User.divisionId) ATAU [projectId] + [assign]
 * (tautkan / lepas proyek, mengubah Project.divisionId). Akun dan proyek harus
 * se-PT dengan divisi (422). Kepala divisi tidak boleh menarik orang/proyek
 * yang tercatat di divisi lain — 409, minta Admin PT (hanya Admin PT/TI yang
 * boleh memindahkan lintas divisi).
 */
@Serializable
data class KadivMemberPutRequest(
    val divisionId: String,
    val userId: String? = null,
    val member: Boolean? = null,
    val projectId: String? = null,
    val assign: Boolean? = null,
) {
    companion object {

        fun orang(divisionId: String, userId: String, member: Boolean) =
            KadivMemberPutRequest(divisionId = divisionId, userId = userId, member = member)

        fun proyek(divisionId: String, projectId: String, assign: Boolean) =
            KadivMemberPutRequest(divisionId = divisionId, projectId = projectId, assign = assign)
    }
}

/** Respons PUT /api/kadiv/members. */
@Serializable
data class KadivMemberPutResponse(
    val ok: Boolean = false,
    /** Divisi semula; null bila sebelumnya tanpa divisi. */
    val previousDivisionId: String? = null,
    /** true = permintaan tidak mengubah apa pun (sudah/belum tercatat demikian). */
    val unchanged: Boolean? = null,
)

// ------------------------------------------------------------------
// kadiv/weekly-summary — ringkasan mingguan untuk Direktur
// ------------------------------------------------------------------

/**
 * GET /api/kadiv/weekly-summary?divisionId=&week= — draf otomatis + baris
 * tersimpan + status laporan mingguan divisi minggu itu. [blocked] null =
 * boleh disunting/dikirim; [undoMinutes] jendela "Urungkan" setelah kirim.
 */
@Serializable
data class WeeklySummaryResponse(
    val division: KadivDivisiRefDto,
    val week: WeeklySummaryWeekDto,
    /** Angka dan poin terkini, dihitung ulang setiap kali dibuka. */
    val live: WeeklySummaryLiveDto,
    /** Baris tersimpan (draf yang disunting / yang sudah dikirim); null = belum pernah. */
    val saved: WeeklySummarySavedDto? = null,
    /** Laporan harian minggu ini: terkirim / wajib (langkah "Kumpulkan"). */
    val daily: WeeklySummaryDailyDto,
    val report: WeeklySummaryReportDto? = null,
    /** Direktur yang akan menerima ringkasan (paling dekat dengan divisi). */
    val directors: List<WeeklyDirekturDto> = emptyList(),
    val blocked: WeeklySummaryBlockDto? = null,
    val undoMinutes: Int = 15,
)

/** Identitas pekan ringkasan. */
@Serializable
data class WeeklySummaryWeekDto(
    val key: String,
    val isoYear: Int,
    val isoWeek: Int,
    val start: String,
    /** Tenggat serah ke Admin PT: Kamis 17.00 WIB. */
    val handoverBy: String,
    /** Kunci pekan: Jumat 17.00 WIB. */
    val lockAt: String,
)

/** Angka + 3 poin draf bawaan. */
@Serializable
data class WeeklySummaryLiveDto(
    val outputsAccepted: Int = 0,
    val outputsTarget: Int = 0,
    val projectsOnTrack: Int = 0,
    val projectsTotal: Int = 0,
    val openObstacles: Int = 0,
    val pendingReview: Int = 0,
    val points: List<String> = emptyList(),
)

/** Baris tersimpan: potret angka saat disimpan/dikirim. */
@Serializable
data class WeeklySummarySavedDto(
    /** DRAF | TERKIRIM. */
    val status: String,
    val points: List<String> = emptyList(),
    val outputsAccepted: Int = 0,
    val outputsTarget: Int = 0,
    val projectsOnTrack: Int = 0,
    val projectsTotal: Int = 0,
    val openObstacles: Int = 0,
    val pendingReview: Int = 0,
    val sentAt: String? = null,
    val updatedAt: String,
)

/** Rekap laporan harian minggu itu. */
@Serializable
data class WeeklySummaryDailyDto(
    val sent: Int = 0,
    val required: Int = 0,
)

/** Status laporan mingguan divisi minggu itu; null = belum ada barisnya. */
@Serializable
data class WeeklySummaryReportDto(
    val id: String,
    val statusHeader: String,
    val submittedAt: String? = null,
    val approvedAt: String? = null,
    /** Terisi = laporan sudah diteruskan, ringkasan ikut beku. */
    val forwardedAt: String? = null,
)

/** Penerima ringkasan {id, name}. */
@Serializable
data class WeeklyDirekturDto(
    val id: String,
    val name: String,
)

/** Alasan ringkasan terkunci; null = boleh disunting/dikirim. */
@Serializable
data class WeeklySummaryBlockDto(
    /** NOT_CURRENT_WEEK | LOCKED | FORWARDED | PENDING_REVIEW. */
    val code: String,
    val message: String,
)

/**
 * PUT /api/kadiv/weekly-summary — simpan draf. [points] wajib 1–3 poin,
 * masing-masing paling banyak 280 huruf setelah dirapikan server (422 bila
 * tidak lolos). Hanya minggu berjalan, sebelum kunci Jumat 17.00 WIB, selama
 * laporan mingguannya belum diteruskan, dan selama statusnya belum TERKIRIM.
 */
@Serializable
data class WeeklySummarySaveRequest(
    val divisionId: String,
    val points: List<String>,
)

/** Respons PUT /api/kadiv/weekly-summary. */
@Serializable
data class WeeklySummarySaveResponse(
    val ok: Boolean = false,
    val updatedAt: String,
)

/**
 * POST /api/kadiv/weekly-summary:
 *  - "send": kirim ke Direktur — server memotret angka + poin (status TERKIRIM,
 *    lonceng ke direktur PT). Bila masih ada output menunggu review sebelum
 *    tenggat serah: 409 PENDING_REVIEW kecuali [confirmPending] = true.
 *    [points] opsional menimpa draf (validasi sama dengan PUT).
 *  - "unsend": tarik kembali ke draf (toast "Urungkan") — hanya pengirimnya,
 *    dalam [undoMinutes] (15 menit), sebelum pekan dikunci atau diteruskan.
 */
@Serializable
data class WeeklySummarySendRequest(
    val divisionId: String,
    val action: String,
    val points: List<String>? = null,
    val confirmPending: Boolean? = null,
) {
    companion object {
        const val SEND = "send"
        const val UNSEND = "unsend"

        fun kirim(divisionId: String, points: List<String>? = null, confirmPending: Boolean? = null) =
            WeeklySummarySendRequest(divisionId, SEND, points, confirmPending)

        fun tarik(divisionId: String) = WeeklySummarySendRequest(divisionId, UNSEND)
    }
}

/** Respons POST /api/kadiv/weekly-summary (send mengisi sentAt + directors). */
@Serializable
data class WeeklySummarySendResponse(
    val ok: Boolean = false,
    val sentAt: String? = null,
    val directors: List<WeeklyDirekturDto> = emptyList(),
)

// ------------------------------------------------------------------
// ringkasan/laporan-dibaca — tanda baca pengawas
// ------------------------------------------------------------------

/**
 * POST / DELETE /api/ringkasan/laporan-dibaca — tandai (idempoten) / batalkan
 * tanda "Sudah dibaca" satu laporan mingguan divisi. Hanya laporan yang sudah
 * diserahkan dan berada di cakupan entitas pemanggil (peran MANAJEMEN,
 * DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, SUPERADMIN); di luar cakupan dijawab 404.
 */
@Serializable
data class LaporanDibacaRequest(
    val weeklyReportId: String,
)

/** Respons POST /api/ringkasan/laporan-dibaca. */
@Serializable
data class LaporanDibacaResponse(
    val ok: Boolean = false,
    val readAt: String,
)
