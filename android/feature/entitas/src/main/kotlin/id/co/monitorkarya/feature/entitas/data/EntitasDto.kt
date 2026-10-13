// Kontrak jaringan tab Entitas (gelombang A2). Bentuknya disalin dari rute
// server sebenarnya, bukan dari tipe web:
//   src/app/api/entities/route.ts          — pohon HOLDING sampai PT + KPI bulan ini per PT
//   src/app/api/entities/[id]/route.ts     — rincian satu entitas (403 untuk PIC/kepala divisi)
//   src/app/api/entity-activity/route.ts   — aktivitas per PT per periode
// Semua kolom opsional diberi nilai bawaan supaya server boleh menambah atau
// menghilangkan kolom tanpa memecah klien (mkJson: ignoreUnknownKeys).
package id.co.monitorkarya.feature.entitas.data

import kotlinx.serialization.Serializable

// ------------------------------------------------------------------
// Pohon entitas
// ------------------------------------------------------------------

/** Jawaban pohon entitas; [periodKey] = "YYYY-MM" (KPI bulanan). */
@Serializable
data class PohonEntitasResponse(
    val tree: List<SimpulEntitasDto> = emptyList(),
    val periodKey: String = "",
)

/**
 * Satu simpul pohon. [kpi] hanya dikirim untuk tipe PT; bernilai null bila
 * KPI bulan ini belum dihitung. Simpul non-PT tidak membawa kunci kpi.
 */
@Serializable
data class SimpulEntitasDto(
    val id: String,
    val name: String,
    val code: String = "",
    val type: String,
    val region: String? = null,
    val kpi: KpiRingkasDto? = null,
    val children: List<SimpulEntitasDto> = emptyList(),
)

/** Ringkasan KPI bulanan PT di pohon (subset KpiSnapshot). */
@Serializable
data class KpiRingkasDto(
    val complianceScore: Double = 0.0,
    val onTimeDailyPct: Double = 0.0,
    val weeklyCompletenessPct: Double = 0.0,
    val lateToday: Int = 0,
    val pendingReports: Int = 0,
)

// ------------------------------------------------------------------
// Rincian entitas
// ------------------------------------------------------------------

/**
 * Rincian satu entitas. Kolom divisi/proyek/KPI/laporan hanya dikirim untuk
 * tipe PT; untuk tipe lain null (bukan daftar kosong).
 */
@Serializable
data class DetailEntitasResponse(
    val entity: EntitasDto,
    val parentChain: List<EntitasRingkasDto> = emptyList(),
    val children: List<AnakEntitasDto> = emptyList(),
    val divisions: List<DivisiEntitasDto>? = null,
    val projects: List<ProyekEntitasDto>? = null,
    val adminAppointments: List<PenunjukanAdminDto>? = null,
    val currentKpi: KpiLengkapDto? = null,
    val recentDailyReports: List<LaporanHarianTerbaruDto>? = null,
    val recentWeeklyReports: List<LaporanMingguanTerbaruDto>? = null,
)

@Serializable
data class EntitasDto(
    val id: String,
    val name: String,
    val code: String = "",
    val type: String,
    val path: String? = null,
    val region: String? = null,
    val parentId: String? = null,
    val isActive: Boolean = true,
)

@Serializable
data class EntitasRingkasDto(
    val id: String,
    val name: String,
    val code: String = "",
    val type: String = "",
    val region: String? = null,
)

@Serializable
data class AnakEntitasDto(
    val id: String,
    val name: String,
    val code: String = "",
    val type: String = "",
    val region: String? = null,
    val isActive: Boolean = true,
)

@Serializable
data class JenisDivisiDto(
    val id: String = "",
    val code: String = "",
    val name: String = "",
)

@Serializable
data class DivisiEntitasDto(
    val id: String,
    val name: String,
    val isActive: Boolean = true,
    val divisionType: JenisDivisiDto? = null,
)

@Serializable
data class ProyekEntitasDto(
    val id: String,
    val name: String,
    val code: String = "",
    val phase: String = "",
    val lifecycle: String = "",
    val picName: String? = null,
    val startDate: String? = null,
    val targetEndDate: String? = null,
)

/** Penunjukan admin PT (SK). status: AKTIF | BERAKHIR | DITOLAK. */
@Serializable
data class PenunjukanAdminDto(
    val id: String,
    val userName: String = "",
    val userEmail: String = "",
    val kind: String = "",
    val skNumber: String = "",
    val validFrom: String? = null,
    val validUntil: String? = null,
    val status: String = "",
)

/** KpiSnapshot BULANAN lengkap untuk satu PT. */
@Serializable
data class KpiLengkapDto(
    val complianceScore: Double = 0.0,
    val onTimeDailyPct: Double = 0.0,
    val weeklyCompletenessPct: Double = 0.0,
    val evidenceCompletenessPct: Double = 0.0,
    val highPriorityCompletionPct: Double = 0.0,
    val lateToday: Int = 0,
    val pendingReports: Int = 0,
    val totalProjects: Int = 0,
    val activeProjects: Int = 0,
)

@Serializable
data class ProyekRingkasDto(
    val id: String = "",
    val name: String = "",
    val code: String = "",
)

@Serializable
data class LaporanHarianTerbaruDto(
    val id: String,
    val status: String = "",
    val progressPct: Int = 0,
    val reportDate: String = "",
    val isLate: Boolean = false,
    val isLocked: Boolean = false,
    val project: ProyekRingkasDto = ProyekRingkasDto(),
)

@Serializable
data class DivisiRingkasDto(
    val id: String = "",
    val name: String = "",
)

@Serializable
data class LaporanMingguanTerbaruDto(
    val id: String,
    val isoYear: Int = 0,
    val isoWeek: Int = 0,
    val statusHeader: String = "",
    val isLocked: Boolean = false,
    val division: DivisiRingkasDto = DivisiRingkasDto(),
)

// ------------------------------------------------------------------
// Aktivitas per perusahaan
// ------------------------------------------------------------------

@Serializable
data class AktivitasEntitasResponse(
    val cadence: String = "HARIAN",
    val priority: String = "ALL",
    val date: String = "",
    val period: PeriodeAktivitasDto = PeriodeAktivitasDto(),
    val prev: String = "",
    val next: String = "",
    val today: String = "",
    val entities: List<AktivitasPtDto> = emptyList(),
)

@Serializable
data class PeriodeAktivitasDto(
    val key: String = "",
    val start: String = "",
    val end: String = "",
    val isoWeek: Int = 0,
    val isoYear: Int = 0,
)

@Serializable
data class AktivitasPtDto(
    val id: String,
    val code: String = "",
    val name: String = "",
    val region: String? = null,
    val stats: StatAktivitasDto = StatAktivitasDto(),
    val projects: List<AktivitasProyekDto> = emptyList(),
    val divisions: List<AktivitasDivisiDto> = emptyList(),
)

@Serializable
data class StatAktivitasDto(
    val projects: Int = 0,
    val divisions: Int = 0,
    val tasks: Int = 0,
    val tasksDone: Int = 0,
    val tasksBlocked: Int = 0,
    val dailyReports: Int = 0,
    val dailyLate: Int = 0,
    val weeklyItems: Int = 0,
    val weeklyItemsBlocked: Int = 0,
    val weeklyReports: Int = 0,
)

@Serializable
data class StatTigaDto(
    val total: Int = 0,
    val done: Int = 0,
    val blocked: Int = 0,
)

@Serializable
data class StatHarianDto(
    val submitted: Int = 0,
    val late: Int = 0,
    val blocked: Int = 0,
)

@Serializable
data class AktivitasProyekDto(
    val id: String,
    val code: String = "",
    val name: String = "",
    val phase: String = "",
    val picName: String? = null,
    val tasks: List<TugasAktivitasDto> = emptyList(),
    val taskStats: StatTigaDto = StatTigaDto(),
    val dailyReports: List<LaporanHarianAktivitasDto> = emptyList(),
    val dailyStats: StatHarianDto = StatHarianDto(),
    val progressReport: LaporanKemajuanDto? = null,
)

@Serializable
data class TugasAktivitasDto(
    val id: String,
    val title: String = "",
    val workDate: String = "",
    val scope: String = "",
    val status: String = "",
    val progressPct: Int = 0,
    val urgency: String = "",
    val picName: String? = null,
    val note: String? = null,
    val subtaskDone: Int = 0,
    val subtaskTotal: Int = 0,
)

@Serializable
data class LaporanHarianAktivitasDto(
    val id: String,
    val date: String = "",
    val status: String = "",
    val progressPct: Int = 0,
    val achievement: String? = null,
    val obstacle: String? = null,
    val followUp: String? = null,
    val submitted: Boolean = false,
    val late: Boolean = false,
    val evidenceCount: Int = 0,
)

@Serializable
data class LaporanKemajuanDto(
    val status: String = "",
    val progressPct: Int = 0,
    val summary: String? = null,
    val obstacle: String? = null,
    val followUp: String? = null,
    val submitted: Boolean = false,
    val evidenceCount: Int = 0,
)

@Serializable
data class AktivitasDivisiDto(
    val id: String,
    val name: String = "",
    val headName: String? = null,
    val reports: List<RingkasMingguanDto> = emptyList(),
    val items: List<ButirDivisiDto> = emptyList(),
    val itemStats: StatTigaDto = StatTigaDto(),
)

@Serializable
data class RingkasMingguanDto(
    val id: String,
    val isoWeek: Int = 0,
    val statusHeader: String = "",
    val submitted: Boolean = false,
    val approved: Boolean = false,
    val itemCount: Int = 0,
)

@Serializable
data class ButirDivisiDto(
    val id: String,
    val workItem: String = "",
    val workDate: String? = null,
    val status: String = "",
    val progressPct: Int = 0,
    val achievement: String? = null,
    val obstacle: String? = null,
    val followUp: String? = null,
    val priority: String = "",
    val aspect: String = "",
    val picName: String? = null,
    val evidenceCount: Int = 0,
)
