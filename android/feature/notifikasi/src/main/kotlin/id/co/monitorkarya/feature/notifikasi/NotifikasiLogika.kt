// Logika murni lonceng notifikasi (agen A1, 13 Okt 2026). Padanan
// useNotifications/NotificationPopover di src/components/shell.tsx.
package id.co.monitorkarya.feature.notifikasi

import id.co.monitorkarya.core.data.repo.KotakMasukRepo
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.network.dto.InboxItemDto
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Satu pesan lonceng siap tampil. */
data class Notifikasi(
    val id: String,
    val judul: String,
    val isi: String,
    /** Nama [TabId] tujuan (mis. "MEJA_KERJA"); null bila tak ada info / tab tak dikenal. */
    val tujuan: String?,
    val dibuatIso: String,
    val dibaca: Boolean,
)

/** Keadaan lonceng. */
data class LoncengUi(
    val belumDibaca: Int = 0,
    val daftar: List<Notifikasi> = emptyList(),
    val memuat: Boolean = false,
    val termuat: Boolean = false,
    val galat: String? = null,
)

/** Batas server PATCH /api/notifications: maksimal 200 id per panggilan (pemotongan di KotakMasukRepo). */
internal const val BATAS_IDS = KotakMasukRepo.BATAS_IDS

/**
 * Tab web (payload `tab`, NavTabId di src/lib/constants.ts) → [TabId] Android.
 * Tab web tanpa padanan Android ("pesan" = ikon top bar) → null.
 */
internal val PETA_TAB: Map<String, TabId> = mapOf(
    "dashboard" to TabId.RINGKASAN,
    "work-desk" to TabId.MEJA_KERJA,
    "statistik" to TabId.STATISTIK,
    "daily-input" to TabId.LAPORAN_HARIAN,
    "projects" to TabId.PROYEK,
    "divisions" to TabId.PEMBAGIAN_DIVISI,
    "weekly-input" to TabId.CAPAIAN_MINGGUAN,
    "inbox" to TabId.PENERIMAAN,
    "escalations" to TabId.ESKALASI,
    "approvals" to TabId.PERSETUJUAN,
    "entities" to TabId.ENTITAS,
    "companies" to TabId.PERUSAHAAN,
    "audit" to TabId.LOG_AUDIT,
    "system" to TabId.SISTEM_AKSES,
    "sh-dashboard" to TabId.SH_DASHBOARD,
    "sh-inbox" to TabId.SH_INBOX,
    "sh-history" to TabId.SH_HISTORY,
    "sh-review" to TabId.SH_REVIEW,
    "sh-overview" to TabId.SH_OVERVIEW,
)

/** Nama [TabId] tujuan dari tab web; null bila tak ada info atau tak dikenal. */
fun tujuanTab(tabWeb: String?): String? = tabWeb?.trim()?.let { PETA_TAB[it]?.name }

internal fun InboxItemDto.keNotifikasi(): Notifikasi = Notifikasi(
    id = id,
    judul = title.ifBlank { template },
    isi = body,
    tujuan = tujuanTab(tab),
    dibuatIso = createdAt,
    dibaca = readAt != null,
)

/** Tandai [ids] dibaca secara lokal (optimistis); angka belum-dibaca ikut turun. */
internal fun LoncengUi.tandaiLokal(ids: Set<String>): LoncengUi {
    var turun = 0
    val baru = daftar.map { n ->
        if (!n.dibaca && n.id in ids) {
            turun++
            n.copy(dibaca = true)
        } else {
            n
        }
    }
    return copy(daftar = baru, belumDibaca = (belumDibaca - turun).coerceAtLeast(0))
}

/** Tandai semua dibaca secara lokal. */
internal fun LoncengUi.tandaiSemuaLokal(): LoncengUi =
    copy(daftar = daftar.map { it.copy(dibaca = true) }, belumDibaca = 0)

/** Id belum-dibaca dalam potongan ≤200 (batas server). */
internal fun potongIds(ids: List<String>): List<List<String>> = ids.distinct().chunked(BATAS_IDS)

/** Teks lencana: kosong (tak tampil) bila 0, "9+" bila lebih dari 9. */
internal fun teksLencana(belumDibaca: Int): String? = when {
    belumDibaca <= 0 -> null
    belumDibaca > 9 -> "9+"
    else -> belumDibaca.toString()
}

/** Label aksesibilitas tombol lonceng. */
internal fun labelLonceng(belumDibaca: Int): String =
    if (belumDibaca > 0) "Notifikasi, $belumDibaca belum dibaca" else "Notifikasi"

private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatTanggal = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.forLanguageTag("id-ID")).withZone(WIB)

/** "baru saja", "5 menit lalu", "3 jam lalu", "2 hari lalu", lalu tanggal (formatRelative web). */
internal fun waktuRelatif(iso: String, sekarang: Instant = Instant.now()): String {
    val t = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val beda = Duration.between(t, sekarang)
    val menit = beda.toMinutes()
    return when {
        menit < 1 -> "baru saja"
        menit < 60 -> "$menit menit lalu"
        menit < 60 * 24 -> "${menit / 60} jam lalu"
        menit < 60 * 24 * 7 -> "${menit / (60 * 24)} hari lalu"
        else -> formatTanggal.format(t)
    }
}
