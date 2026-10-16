// Kontrak kawat model subholding (web 15–16 Okt 2026): /api/sh/* dan
// POST api/evidence/signed. Nama medan = JSON server apa adanya; semua medan
// opsional diberi bawaan supaya respons lama/baru tetap terbaca (mkJson
// ignoreUnknownKeys + coerceInputValues). Dijaga ShKontrakTest terhadap
// fixture yang direkam dari server lokal (core/network/src/test/resources/sh).
//
// Jebakan encodeDefaults=false: medan permintaan yang masih bernilai bawaan
// TIDAK terkirim. Itu dipakai sengaja untuk PATCH sebagian; medan yang wajib
// selalu terkirim walau bernilai bawaan memakai @EncodeDefault(ALWAYS).
@file:OptIn(ExperimentalSerializationApi::class)

package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/* ---------- Laporan ---------- */

/** Satu bukti laporan (tanpa kunci penyimpanan); `url` hanya untuk tautan. */
@Serializable
data class ShEvidenceDto(
    val id: String,
    val fileName: String = "",
    val mime: String? = null,
    val size: Long? = null,
    val url: String? = null,
    val kind: String? = null,
)

/** Percakapan laporan. `kind`: KOMENTAR | PERBAIKAN | SETUJU | BALASAN. */
@Serializable
data class ShCommentDto(
    val id: String,
    val kind: String = "",
    val body: String = "",
    val authorName: String = "",
    val authorRole: String = "",
    val createdAt: String = "",
    val mine: Boolean = false,
)

/**
 * ShReport server (src/lib/subholding/report.ts). `status`: MENUNGGU |
 * PERLU_PERBAIKAN | DISETUJUI. `reportDate` = 'YYYY-MM-DD' WIB. Medan sorotan
 * hanya dikirim untuk pemegang `shreport:review` (Supervisor, Super Admin).
 */
@Serializable
data class ShReportDto(
    val id: String,
    val subholdingId: String = "",
    val subholdingName: String = "",
    val ptId: String = "",
    val ptName: String = "",
    val reportDate: String = "",
    val kegiatan: String = "",
    val deskripsi: String = "",
    val reporterName: String = "",
    val reporterTitleKind: String = "",
    val reporterTitleField: String = "",
    val reporterTitle: String = "",
    val status: String = "",
    val submittedAt: String? = null,
    val decidedAt: String? = null,
    val decidedByName: String? = null,
    val evidenceCount: Int = 0,
    val evidence: List<ShEvidenceDto> = emptyList(),
    val comments: List<ShCommentDto> = emptyList(),
    val canEdit: Boolean = false,
    val canWithdraw: Boolean = false,
    val highlight: Boolean = false,
    val highlightNote: String? = null,
    val highlightedAt: String? = null,
)

/** Hitungan per status (kunci JSON huruf besar). */
@Serializable
data class ShCountsDto(
    @SerialName("MENUNGGU") val menunggu: Int = 0,
    @SerialName("PERLU_PERBAIKAN") val perluPerbaikan: Int = 0,
    @SerialName("DISETUJUI") val disetujui: Int = 0,
)

/** GET api/sh/reports. */
@Serializable
data class ShReportListResponse(
    val items: List<ShReportDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
    val counts: ShCountsDto = ShCountsDto(),
)

/** Satu laporan: GET/PATCH api/sh/reports/:id, POST …/decision, POST …/comments (kolom `comment` diabaikan). */
@Serializable
data class ShReportResponse(val report: ShReportDto)

/* ---------- Pilihan form (Admin subholding) ---------- */

@Serializable
data class ShRefDto(val id: String = "", val name: String = "")

@Serializable
data class ShPtDto(val id: String, val code: String = "", val name: String = "")

/** Pelapor yang pernah dipakai akun ini. `titleKind`: MANAJER | KEPALA. */
@Serializable
data class ShReporterDto(val name: String = "", val titleKind: String = "", val titleField: String = "")

/** GET api/sh/options. */
@Serializable
data class ShOptionsResponse(
    val subholding: ShRefDto = ShRefDto(),
    val pts: List<ShPtDto> = emptyList(),
    val reporters: List<ShReporterDto> = emptyList(),
)

/* ---------- Kotak masuk (Admin subholding) ---------- */

@Serializable
data class ShInboxReportDto(
    val id: String,
    val kegiatan: String = "",
    val ptName: String = "",
    val status: String = "",
    val reporterName: String = "",
    val reporterTitle: String = "",
    val submittedAt: String? = null,
    val evidenceCount: Int = 0,
)

@Serializable
data class ShInboxItemDto(
    val id: String,
    val kind: String = "",
    val body: String = "",
    val createdAt: String = "",
    val unread: Boolean = false,
    val authorName: String = "",
    val report: ShInboxReportDto? = null,
)

@Serializable
data class ShReminderDto(val id: String, val text: String = "", val createdAt: String = "")

/** GET api/sh/inbox. */
@Serializable
data class ShInboxResponse(
    val items: List<ShInboxItemDto> = emptyList(),
    val reminders: List<ShReminderDto> = emptyList(),
    val unreadCount: Int = 0,
)

/* ---------- Antrean Supervisor ---------- */

/** Subholding di saringan antrean: jumlah menunggu + kiriman terlama (ISO). */
@Serializable
data class ShReviewSubDto(
    val id: String,
    val name: String = "",
    val waiting: Int = 0,
    val oldestAt: String? = null,
)

/** Keputusan peninjau ini sejak 00.00 WIB. */
@Serializable
data class ShTodayDto(val approved: Int = 0, val highlighted: Int = 0, val revised: Int = 0)

/** GET api/sh/review. */
@Serializable
data class ShReviewResponse(
    val items: List<ShReportDto> = emptyList(),
    val counts: ShCountsDto = ShCountsDto(),
    val subholdings: List<ShReviewSubDto> = emptyList(),
    val today: ShTodayDto? = null,
)

/* ---------- Ringkasan Superuser & Manajemen ---------- */

/** Laporan disetujui di ringkasan (V2Report web). */
@Serializable
data class ShOverviewReportDto(
    val id: String,
    val kegiatan: String = "",
    val deskripsi: String = "",
    val highlight: Boolean = false,
    val highlightNote: String? = null,
    val evidence: List<ShEvidenceDto> = emptyList(),
    val reporterName: String? = null,
    val reporterTitle: String? = null,
    val decidedAt: String? = null,
)

@Serializable
data class ShOverviewPtDto(
    val id: String,
    val name: String = "",
    val reports: List<ShOverviewReportDto> = emptyList(),
)

/** `pts` = PT yang punya laporan disetujui; `allPts` = semua PT aktif di subholding. */
@Serializable
data class ShOverviewSubDto(
    val id: String,
    val name: String = "",
    val count: Int = 0,
    val ptCount: Int = 0,
    val pts: List<ShOverviewPtDto> = emptyList(),
    val allPts: List<ShRefDto> = emptyList(),
)

/** GET api/sh/overview?date=. */
@Serializable
data class ShOverviewResponse(
    val date: String = "",
    val subholdings: List<ShOverviewSubDto> = emptyList(),
)

/** Satu PT di pola 7 hari: jumlah laporan disetujui per hari (urut `days`). */
@Serializable
data class ShWeekPtDto(val id: String, val name: String = "", val counts: List<Int> = emptyList())

/** Satu subholding di pola 7 hari; `pts` hanya terisi bila diminta dengan subholdingId. */
@Serializable
data class ShWeekRowDto(
    val id: String,
    val name: String = "",
    val counts: List<Int> = emptyList(),
    val pts: List<ShWeekPtDto> = emptyList(),
)

@Serializable
data class ShWeekHighlightDto(
    val id: String,
    val date: String = "",
    val kegiatan: String = "",
    val subholdingId: String = "",
    val subholdingName: String = "",
    val ptName: String = "",
    val highlightNote: String? = null,
)

/** GET api/sh/overview/week?end=&subholdingId= (dengan subholdingId: satu baris + `pts`). */
@Serializable
data class ShWeekResponse(
    val start: String = "",
    val end: String = "",
    val days: List<String> = emptyList(),
    val subholdings: List<ShWeekRowDto> = emptyList(),
    val highlights: List<ShWeekHighlightDto> = emptyList(),
)

/** GET api/nav-badges, mis. `{"badges":{"sh-review":3}}`. */
@Serializable
data class NavBadgesResponse(val badges: Map<String, Int> = emptyMap())

/* ---------- URL bertanda tangan ---------- */

/** POST api/evidence/signed: 1–60 id; `size` thumb | full (null = full). */
@Serializable
data class SignedRequest(val ids: List<String>, val size: String? = null) {
    companion object {
        const val UKURAN_THUMB = "thumb"
        const val UKURAN_FULL = "full"
    }
}

/** `kind`: file (berkas tersimpan) | link (tautan). */
@Serializable
data class SignedItemDto(val id: String, val url: String = "", val kind: String = "file")

@Serializable
data class SignedResponse(val items: List<SignedItemDto> = emptyList())

/* ---------- Permintaan ---------- */

/** POST api/sh/reports — isian 1–5. `reporterTitleKind`: MANAJER | KEPALA. */
@Serializable
data class ShReportRequest(
    val kegiatan: String,
    val deskripsi: String,
    val ptId: String,
    val reporterName: String,
    val reporterTitleKind: String,
    val reporterTitleField: String,
)

/** PATCH api/sh/reports/:id — hanya medan yang diubah (null = tidak dikirim). */
@Serializable
data class ShReportPatchRequest(
    val kegiatan: String? = null,
    val deskripsi: String? = null,
    val ptId: String? = null,
    val reporterName: String? = null,
    val reporterTitleKind: String? = null,
    val reporterTitleField: String? = null,
)

/**
 * POST api/sh/reports/:id/decision — setujui. `highlight` SELALU terkirim
 * (paritas decisionBody web); `highlightNote` wajib 5–280 bila disorot.
 */
@Serializable
data class ShDecisionRequest(
    val note: String? = null,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val highlight: Boolean = false,
    val highlightNote: String? = null,
) {
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val action: String = AKSI_SETUJUI

    companion object {
        const val AKSI_SETUJUI = "approve"
    }
}

/** POST api/sh/reports/:id/decision — minta perbaikan (komentar wajib ≥5 huruf, tanpa sorotan). */
@Serializable
data class ShReviseRequest(val note: String) {
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val action: String = AKSI_PERBAIKAN

    companion object {
        const val AKSI_PERBAIKAN = "revise"
    }
}

/** POST api/sh/reports/:id/comments. */
@Serializable
data class ShCommentRequest(val body: String)

/** POST api/sh/inbox/read — `ids` tertentu atau `all = true`. */
@Serializable
data class ShInboxReadRequest(val ids: List<String>? = null, val all: Boolean? = null)
