// DTO dashboard pemantau grup — bentuk JSON persis dari route web:
//  - GET /api/ringkasan            (src/app/api/ringkasan/route.ts, kind "RINGKASAN")
//  - GET /api/daily-reports        (src/app/api/daily-reports/route.ts, drill-down proyek)
//  - GET /api/management-charts    (src/app/api/management-charts/route.ts)
//  - GET /api/kpi-trends           (src/app/api/kpi-trends/route.ts)
//  - GET /api/compliance-map       (src/app/api/compliance-map/route.ts)
//  - GET /api/late-incidents       (src/app/api/late-incidents/route.ts)
// Semua kolom diberi nilai bawaan supaya respons lama/sebagian tetap terbaca
// (mkJson: ignoreUnknownKeys + coerceInputValues). Tanggal tetap String ISO;
// konversi WIB di logika/FormatWib.kt.
package id.co.monitorkarya.feature.ringkasangrup.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// ------------------------------------------------------------------
// /api/ringkasan
// ------------------------------------------------------------------

@Serializable
data class RingkasanGrupDto(
    val kind: String = "RINGKASAN",
    val week: Int = 0,
    val scope: CakupanDto = CakupanDto(),
    val projects: List<ProyekGrupDto> = emptyList(),
    val counts: HitungStatusDto = HitungStatusDto(),
    val progressComparison: PerbandinganProgresDto? = null,
    val daily: HarianGrupDto = HarianGrupDto(),
    val weekly: MingguanGrupDto = MingguanGrupDto(),
    val trend: List<TrenMingguDto> = emptyList(),
    val byEntity: List<PerEntitasDto> = emptyList(),
    val reportWeek: MingguLaporanDto? = null,
    val divisions: List<DivisiGrupDto> = emptyList(),
    val outputs: OutputGrupDto? = null,
    val deadlineProposals: List<JsonObject> = emptyList(),
    val approvalRequests: List<JsonObject> = emptyList(),
    val decisions: List<KeputusanDto> = emptyList(),
    val escalations: List<EskalasiGrupDto> = emptyList(),
    val activity: List<AktivitasDto> = emptyList(),
    /** Hak tindakan pemanggil (B1, layar Direktur): ingatkan, tandai dibaca, dsb. */
    val viewer: PenontonDto = PenontonDto(),
)

/** viewer route ringkasan — izin tombol di layar pengawas. */
@Serializable
data class PenontonDto(
    val canRemind: Boolean = false,
    val canMarkRead: Boolean = false,
    val canDecideDeadline: Boolean = false,
    val canComment: Boolean = false,
    val canDecideApproval: Boolean = false,
)

@Serializable
data class CakupanDto(
    val entities: Int = 0,
    val divisions: Int = 0,
    val global: Boolean = false,
)

@Serializable
data class ProyekGrupDto(
    val id: String,
    val code: String = "",
    val name: String = "",
    val phase: String = "",
    val entityId: String = "",
    val entityName: String = "",
    val entityCode: String = "",
    val divisionId: String? = null,
    val divisionName: String? = null,
    val pic: String? = null,
    val startDate: String? = null,
    val targetEndDate: String? = null,
    /** on | risk | late | done | neutral (project-status.ts). */
    val status: String = "neutral",
    val reason: String? = null,
    val progress: Int = 0,
    val lastReportAt: String? = null,
    val lastNote: String? = null,
    val reportedToday: Boolean = false,
    val outputsDone: Int = 0,
    val outputsTotal: Int = 0,
    val escalations: List<EskalasiProyekDto> = emptyList(),
)

/** Eskalasi laporan harian pada satu proyek (T3-A1, drill-down per perusahaan). */
@Serializable
data class EskalasiProyekDto(
    val id: String,
    val summary: String = "",
    val needed: String = "",
    val status: String = "",
    val raisedAt: String? = null,
    val raisedBy: String? = null,
    val ageDays: Int? = null,
    val overdue: Boolean = false,
)

@Serializable
data class HitungStatusDto(
    val on: Int = 0,
    val risk: Int = 0,
    val late: Int = 0,
    val done: Int = 0,
    val neutral: Int = 0,
)

@Serializable
data class PerbandinganProgresDto(
    val current: Double = 0.0,
    val previous: Double = 0.0,
    val delta: Double = 0.0,
    val projects: Int = 0,
    val asOf: String? = null,
)

@Serializable
data class HarianGrupDto(
    val expected: Int = 0,
    val submitted: Int = 0,
    val onTime30Pct: Int = 0,
    val onTime30: Int = 0,
    val total30: Int = 0,
)

@Serializable
data class MingguanGrupDto(
    val expected: Int = 0,
    val submitted: Int = 0,
    val approved: Int = 0,
)

@Serializable
data class TrenMingguDto(
    val label: String = "",
    val submitted: Int = 0,
    val onTimePct: Int = 0,
)

@Serializable
data class PerEntitasDto(
    val id: String,
    val name: String = "",
    val code: String = "",
    val onTimePct: Int? = null,
    val onTime: Int = 0,
    val total: Int = 0,
    val projects: Int = 0,
    val reportedToday: Int = 0,
)

@Serializable
data class MingguLaporanDto(
    val isoYear: Int = 0,
    val isoWeek: Int = 0,
    val label: String = "",
    val handoverBy: String? = null,
    val current: Boolean = true,
)

@Serializable
data class DivisiGrupDto(
    val id: String,
    val name: String = "",
    val typeName: String = "",
    val entityId: String = "",
    val entityName: String = "",
    val entityCode: String = "",
    val projects: Int = 0,
    val onTime: TepatWaktuDivisiDto? = null,
    /** B1 (layar Direktur): kepala divisi, laporan mingguan minggu laporan, output. */
    val head: KepalaDivisiDto? = null,
    val weekly: MingguanDivisiDto = MingguanDivisiDto(),
    val outputs: OutputDivisiDto = OutputDivisiDto(),
)

/** Kepala divisi; email/telepon hanya untuk pengawas (null untuk PIC). */
@Serializable
data class KepalaDivisiDto(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
)

/**
 * Laporan mingguan satu divisi pada minggu laporan. [state]: sent | late |
 * missing | read (WeeklyState di oversight/types.ts).
 */
@Serializable
data class MingguanDivisiDto(
    val id: String? = null,
    val state: String = "missing",
    val statusHeader: String? = null,
    val submittedAt: String? = null,
    val submittedBy: String? = null,
    val readAt: String? = null,
    val itemsTotal: Int = 0,
    val itemsDone: Int = 0,
    val summary: String? = null,
    val points: List<String> = emptyList(),
    val obstacles: List<String> = emptyList(),
    val comments: Int = 0,
    val headSummary: RingkasanKepalaDto? = null,
)

/** Ringkasan yang dikirim kepala divisi ke Direktur (F2-KADIV). */
@Serializable
data class RingkasanKepalaDto(
    val points: List<String> = emptyList(),
    val sentAt: String? = null,
    val outputsAccepted: Int = 0,
    val outputsTarget: Int = 0,
    val openObstacles: Int = 0,
)

/** Output per divisi; [trend] = output diterima per minggu (8 minggu, lama → baru). */
@Serializable
data class OutputDivisiDto(
    val total: Int = 0,
    val done: Int = 0,
    val active: Int = 0,
    val review: Int = 0,
    val onTime: Int = 0,
    val withDue: Int = 0,
    val trend: List<Int> = emptyList(),
)

@Serializable
data class TepatWaktuDivisiDto(
    val pct: Int = 0,
    val ok: Int = 0,
    val total: Int = 0,
    /** "output" | "laporan". */
    val basis: String = "laporan",
)

@Serializable
data class OutputGrupDto(
    val total: Int = 0,
    val done: Int = 0,
    val active: Int = 0,
    val review: Int = 0,
    val onTime: Int = 0,
    val withDue: Int = 0,
    val trend: TrenOutputDto = TrenOutputDto(),
)

/** Seri output diterima: per minggu (8), bulan (6), kuartal (4). */
@Serializable
data class TrenOutputDto(
    val week: List<TitikTrenDto> = emptyList(),
    val month: List<TitikTrenDto> = emptyList(),
    val quarter: List<TitikTrenDto> = emptyList(),
)

@Serializable
data class TitikTrenDto(
    val label: String = "",
    val value: Int = 0,
)

@Serializable
data class KeputusanDto(
    val id: String,
    val name: String = "",
    val entityName: String = "",
    val proposer: String = "",
    val proposedAt: String? = null,
    val slot: String? = null,
)

@Serializable
data class EskalasiGrupDto(
    val id: String,
    val divisionId: String? = null,
    val summary: String = "",
    val needed: String = "",
    val status: String = "",
    val raisedAt: String? = null,
    val raisedBy: String? = null,
    val entityName: String = "",
    val entityCode: String = "",
    val ageDays: Int = 0,
    val overdue: Boolean = false,
)

@Serializable
data class AktivitasDto(
    val id: String,
    val who: String = "",
    val role: String? = null,
    val text: String = "",
    val at: String? = null,
)

// ------------------------------------------------------------------
// /api/daily-reports?projectId=…&pageSize=14
// ------------------------------------------------------------------

@Serializable
data class HalamanLaporanDto(
    val items: List<LaporanHarianGrupDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 14,
)

@Serializable
data class LaporanHarianGrupDto(
    val id: String,
    val reportDate: String? = null,
    val status: String? = null,
    val progressPct: Int = 0,
    val achievementToday: String? = null,
    val obstacle: String? = null,
    val isLate: Boolean = false,
    val submittedAt: String? = null,
    val submittedBy: PenggunaRingkasDto? = null,
)

@Serializable
data class PenggunaRingkasDto(
    val id: String = "",
    val name: String = "",
)

// ------------------------------------------------------------------
// /api/management-charts
// ------------------------------------------------------------------

@Serializable
data class GrafikManajemenDto(
    val periode: PeriodeGrafikDto = PeriodeGrafikDto(),
    val ringkasan: RingkasanGrafikDto = RingkasanGrafikDto(),
    /**
     * Tren 6 bulan (C4 P2-7) — sumber yang sama dengan kartu tren web
     * (management-charts.tsx `data.trend`): cakupan scopeEntityIds, 1 desimal.
     */
    val trend: List<TrenBulanDto> = emptyList(),
    val bySubHolding: List<SubHoldingDto> = emptyList(),
    val dailyStatus: List<StatusHarianDto> = emptyList(),
    val escalationAging: List<UmurEskalasiDto> = emptyList(),
    /** Baris campuran {name, "Draft": n, "Menunggu persetujuan": n, …}. */
    val weeklyByGroup: List<JsonObject> = emptyList(),
    val lowestPt: List<PtTerendahDto> = emptyList(),
)

/** Satu bulan tren /api/management-charts; bulan tanpa potret bernilai 0. */
@Serializable
data class TrenBulanDto(
    val label: String = "",
    val kepatuhan: Double = 0.0,
    val tepatWaktu: Double = 0.0,
    val mingguan: Double = 0.0,
    val bukti: Double = 0.0,
)

@Serializable
data class PeriodeGrafikDto(
    val bulanIni: String = "",
    val isoWeek: Int = 0,
    val isoYear: Int = 0,
)

@Serializable
data class RingkasanGrafikDto(
    val entitas: Int = 0,
    val rataKepatuhan: Double = 0.0,
    val diBawahTarget: Int = 0,
    val eskalasiTerbuka: Int = 0,
    val eskalasiLewatSla: Int = 0,
)

@Serializable
data class SubHoldingDto(
    val name: String = "",
    val skor: Double = 0.0,
    val jumlahPt: Int = 0,
)

@Serializable
data class StatusHarianDto(
    val status: String = "",
    val label: String = "",
    val jumlah: Int = 0,
)

@Serializable
data class UmurEskalasiDto(
    val bucket: String = "",
    val dalamSla: Int = 0,
    val lewatSla: Int = 0,
)

@Serializable
data class PtTerendahDto(
    val name: String = "",
    val code: String = "",
    val region: String? = null,
    val skor: Double = 0.0,
)

// ------------------------------------------------------------------
// /api/kpi-trends
// ------------------------------------------------------------------

@Serializable
data class TrenKpiDto(
    val months: List<BulanKpiDto> = emptyList(),
)

@Serializable
data class BulanKpiDto(
    val periodKey: String = "",
    val label: String = "",
    val avgCompliance: Double = 0.0,
    val avgOnTime: Double = 0.0,
    val avgWeeklyCompleteness: Double = 0.0,
    val avgEvidenceCompleteness: Double = 0.0,
    val avgHighPriorityCompletion: Double = 0.0,
    val totalEntities: Int = 0,
)

// ------------------------------------------------------------------
// /api/compliance-map
// ------------------------------------------------------------------

@Serializable
data class PetaKepatuhanDto(
    val tree: List<SimpulPetaDto> = emptyList(),
    val periodKey: String = "",
    val topLevelType: String = "",
)

@Serializable
data class SimpulPetaDto(
    val id: String,
    val name: String = "",
    val code: String = "",
    val type: String? = null,
    val region: String? = null,
    val complianceScore: Double? = null,
    val entityCount: Int = 0,
    val avgComplianceScore: Double? = null,
    val children: List<SimpulPetaDto> = emptyList(),
)

// ------------------------------------------------------------------
// /api/late-incidents
// ------------------------------------------------------------------

@Serializable
data class HalamanInsidenDto(
    val items: List<InsidenTerlambatDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
)

@Serializable
data class InsidenTerlambatDto(
    val id: String,
    val entityId: String = "",
    /** HARIAN | MINGGUAN. */
    val cycle: String = "",
    val period: String = "",
    val occurrenceInMonth: Int = 1,
    val actionTaken: String? = null,
    val createdAt: String? = null,
    val entity: EntitasInsidenDto? = null,
)

@Serializable
data class EntitasInsidenDto(
    val id: String = "",
    val name: String = "",
    val code: String = "",
    val region: String? = null,
)
