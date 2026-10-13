// Model tampilan tab Eskalasi + fungsi murni (label, izin, kalimat, waktu).
// Padanan web: konstanta ESCALATION_STATUS_META / ESCALATION_NEEDED_LABELS
// (src/lib/constants.ts), peta lencana ESCALATION (status-badges.tsx), dan
// kalimat Hero di escalations-view.tsx. Izin aksi datang dari server (`perms`).
package id.co.monitorkarya.feature.eskalasi

import id.co.monitorkarya.designsystem.components.MkStatus
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/** Empat tahap eskalasi, urut alur; [lencana] = warna+ikon StatusBadge. */
enum class StatusEskalasi(val nilai: String, val label: String, val lencana: MkStatus) {
    DIAJUKAN("DIAJUKAN", "Diajukan", MkStatus.INFO),
    DITINJAU("DITINJAU", "Ditinjau", MkStatus.RISK),
    DIPUTUSKAN("DIPUTUSKAN", "Diputuskan", MkStatus.DONE),
    DITUTUP("DITUTUP", "Ditutup", MkStatus.NEUTRAL),
    ;

    companion object {
        /** Status tak dikenal masuk ke Ditutup (sama dengan pengelompokan kanban web). */
        fun dari(nilai: String): StatusEskalasi = entries.firstOrNull { it.nilai == nilai } ?: DITUTUP
    }
}

/** Jenis kebutuhan eskalasi (ESCALATION_NEEDED_LABELS). */
enum class KebutuhanEskalasi(val nilai: String, val label: String) {
    KEPUTUSAN("KEPUTUSAN", "Keputusan"),
    ANGGARAN("ANGGARAN", "Anggaran"),
    DUKUNGAN_LINTAS_FUNGSI("DUKUNGAN_LINTAS_FUNGSI", "Dukungan lintas fungsi"),
    ;

    companion object {
        fun label(nilai: String): String = entries.firstOrNull { it.nilai == nilai }?.label ?: nilai
    }
}

/** Sumber eskalasi (sourceType) dalam kata pengguna. */
fun labelSumber(sourceType: String): String = when (sourceType) {
    "DAILY_REPORT" -> "Laporan harian proyek"
    "WEEKLY_ITEM" -> "Butir capaian mingguan divisi"
    "TASK" -> "Tugas proyek"
    else -> "Sumber lain"
}

/** Tiga aksi yang mungkin pada satu eskalasi. */
enum class AksiEskalasi(val nilai: String) {
    TINJAU(AksiEskalasiRequest.TINJAU),
    PUTUSKAN(AksiEskalasiRequest.PUTUSKAN),
    TUTUP(AksiEskalasiRequest.TUTUP),
}

/** Hasil izin satu eskalasi untuk akun ini. */
data class IzinAksi(
    val tinjau: Boolean = false,
    val putuskan: Boolean = false,
    val tutup: Boolean = false,
) {
    val ada: Boolean get() = tinjau || putuskan || tutup

    /** Hapus aksi yang sudah ditolak server (403) agar tombolnya tidak muncul lagi. */
    fun tanpa(ditolak: Set<AksiEskalasi>): IzinAksi = IzinAksi(
        tinjau = tinjau && AksiEskalasi.TINJAU !in ditolak,
        putuskan = putuskan && AksiEskalasi.PUTUSKAN !in ditolak,
        tutup = tutup && AksiEskalasi.TUTUP !in ditolak,
    )
}

/**
 * Izin aksi eskalasi — hanya dari kolom `perms` server (B3, 13 Okt 2026).
 * `GET /api/escalations` menghitungnya per item dengan `escalationPerms`
 * bersama (src/lib/escalation-perms.ts) yang juga dipakai layar web, jadi
 * klien tidak lagi menyalin tabel peran. Bila kolom absen (server sebelum B3)
 * eskalasi tampil baca saja — aman, karena server tetap hakim terakhir
 * (403/409) dan tidak ada tombol yang ditawarkan atas tebakan.
 */
fun IzinEskalasiDto?.keIzin(): IzinAksi =
    this?.let { IzinAksi(tinjau = it.mayReview, putuskan = it.mayDecide, tutup = it.mayClose) } ?: IzinAksi()

/** Satu eskalasi siap tampil. */
data class EskalasiItem(
    val id: String,
    val status: StatusEskalasi,
    val namaEntitas: String,
    /** "BRH · Jawa Barat" — kode dan wilayah PT. */
    val kodeEntitas: String,
    val ringkasan: String,
    val kebutuhan: String,
    val sumber: String,
    val sourceId: String,
    val umurHari: Int,
    val slaHari: Int,
    val lewatSla: Boolean,
    val pengaju: String?,
    val diajukanPada: String?,
    val pemutus: String?,
    val diputuskanPada: String?,
    val keputusan: String?,
    val izin: IzinAksi,
) {
    /** "Butuh keputusan · 3 hari dari SLA 7". */
    val subjudul: String
        get() = "Butuh ${kebutuhan.lowercase(LOKAL)} · ${teksUmur()}"

    fun teksUmur(): String = "$umurHari hari" + if (slaHari > 0) " dari SLA $slaHari" else ""
}

/** Tahap pada alur vertikal Sheet detail. */
enum class KeadaanTahap { SELESAI, SEKARANG, TERHAMBAT, BELUM }

data class TahapAlur(val judul: String, val sub: String?, val keadaan: KeadaanTahap, val meta: String?)

/** Papan eskalasi siap tampil beserta kalimat jawaban. */
data class PapanEskalasi(
    val items: List<EskalasiItem>,
    val total: Int,
    val eyebrow: String,
    val jawaban: String,
    val dukungan: String?,
    /** "Menampilkan 100 dari 240 eskalasi terbaru." — null bila semua termuat. */
    val catatanHalaman: String?,
    /** Kelompok per status yang ditampilkan (satu bila status disaring). */
    val kelompok: List<Pair<StatusEskalasi, List<EskalasiItem>>>,
)

/** Saringan layar; null = semua. */
data class SaringanEskalasi(
    val status: StatusEskalasi? = null,
    val kebutuhan: KebutuhanEskalasi? = null,
    val lewatSla: Boolean = false,
) {
    val aktif: Boolean get() = status != null || kebutuhan != null || lewatSla
}

internal val LOKAL: Locale = Locale.forLanguageTag("id-ID")
private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val BULAN = listOf("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")

/** Angka gaya id-ID ("1.240"). */
fun angka(n: Int): String = NumberFormat.getIntegerInstance(LOKAL).format(n)

internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "12 Okt 2026, 09.30" WIB; "-" bila kosong/rusak (formatDateTime web). */
fun tanggalJam(iso: String?): String {
    val t = cobaIso(iso)?.atZone(ZONA_WIB) ?: return "-"
    return "${t.dayOfMonth} ${BULAN[t.monthValue - 1]} ${t.year}, %02d.%02d".format(t.hour, t.minute)
}

/** Padanan formatRelative web: Baru saja / n menit lalu / n jam lalu / Kemarin / n hari lalu / tanggal. */
fun waktuRelatif(iso: String?, sekarang: Instant = Instant.now()): String {
    val t = cobaIso(iso) ?: return "-"
    val selisih = Duration.between(t, sekarang)
    val hari = selisih.toDays()
    val jam = selisih.toHours()
    val menit = selisih.toMinutes()
    return when {
        hari > 7 -> t.atZone(ZONA_WIB).let { "${it.dayOfMonth} ${BULAN[it.monthValue - 1]} ${it.year}" }
        hari == 1L -> "Kemarin"
        hari > 0 -> "$hari hari lalu"
        jam > 0 -> "$jam jam lalu"
        menit > 0 -> "$menit menit lalu"
        else -> "Baru saja"
    }
}

/** DTO → item tampilan; izin dari `perms` server dikurangi aksi yang sudah ditolak (403). */
fun EskalasiDto.keItem(ditolak: Set<AksiEskalasi> = emptySet()): EskalasiItem {
    val ent = entity
    return EskalasiItem(
        id = id,
        status = StatusEskalasi.dari(status),
        namaEntitas = ent?.name?.ifBlank { null } ?: "Entitas",
        kodeEntitas = listOf(ent?.code.orEmpty().ifBlank { "-" }, ent?.region?.ifBlank { null } ?: "-").joinToString(" · "),
        ringkasan = summary,
        kebutuhan = KebutuhanEskalasi.label(needed),
        sumber = labelSumber(sourceType),
        sourceId = sourceId,
        umurHari = ageDays,
        slaHari = slaDays,
        lewatSla = isOverdue,
        pengaju = raisedBy?.name?.ifBlank { null },
        diajukanPada = raisedAt,
        pemutus = decidedBy?.name?.ifBlank { null },
        diputuskanPada = decidedAt,
        keputusan = decisionText?.ifBlank { null },
        izin = perms.keIzin().tanpa(ditolak),
    )
}

/** Susun papan + kalimat Hero (padanan answer/support escalations-view.tsx). */
fun susunPapan(items: List<EskalasiItem>, total: Int, saringan: SaringanEskalasi): PapanEskalasi {
    val grup = StatusEskalasi.entries.associateWith { s -> items.filter { it.status == s } }
    val menunggu = grup.getValue(StatusEskalasi.DIAJUKAN).size + grup.getValue(StatusEskalasi.DITINJAU).size
    val lewat = items.count { it.lewatSla && it.status != StatusEskalasi.DITUTUP }
    val giliranSaya = items.count { it.izin.ada }
    val diputuskan = grup.getValue(StatusEskalasi.DIPUTUSKAN).size
    val tersaring = saringan.aktif
    // Hanya halaman pertama yang termuat: hitungan per status adalah batas bawah,
    // jadi kalimatnya tidak boleh terdengar pasti (C2 R8).
    val sebagian = total > items.size
    fun n(x: Int) = if (sebagian) "Sedikitnya ${angka(x)}" else angka(x)

    val jawaban = when {
        tersaring && total == 0 -> "Tidak ada eskalasi dengan saringan ini."
        tersaring -> "${angka(total)} eskalasi cocok dengan saringan."
        menunggu == 0 && !sebagian -> "Tidak ada eskalasi yang menunggu keputusan."
        menunggu == 0 -> "Tidak ada eskalasi menunggu keputusan di ${angka(items.size)} eskalasi terbaru."
        else -> "${n(menunggu)} eskalasi menunggu keputusan."
    }
    val dukungan = listOfNotNull(
        if (lewat > 0) "${n(lewat)} lewat SLA." else null,
        if (giliranSaya > 0) "${n(giliranSaya)} menunggu tindakan Anda." else null,
        if (!tersaring && diputuskan > 0) "${n(diputuskan)} sudah diputuskan dan menunggu ditutup." else null,
    ).joinToString(" ").ifEmpty {
        if (total > 0) "Ketuk kartu untuk membaca ringkasan dan mengambil tindakan." else ""
    }.ifEmpty { null }

    val kolom = saringan.status?.let { listOf(it) } ?: StatusEskalasi.entries
    return PapanEskalasi(
        items = items,
        total = total,
        eyebrow = "${angka(total)} eskalasi" + if (tersaring) " tersaring" else "",
        jawaban = jawaban,
        dukungan = dukungan,
        catatanHalaman = if (total > items.size) {
            "Menampilkan ${angka(items.size)} dari ${angka(total)} eskalasi terbaru."
        } else {
            null
        },
        kelompok = kolom.map { it to grup.getValue(it) },
    )
}

/** Alur Diajukan → Ditinjau → Diputuskan → Ditutup (statusSteps web). */
fun tahapAlur(e: EskalasiItem): List<TahapAlur> {
    val urutan = StatusEskalasi.entries
    val idx = urutan.indexOf(e.status).coerceAtLeast(0)
    val tutup = e.status == StatusEskalasi.DITUTUP
    return urutan.mapIndexed { i, s ->
        val selesai = tutup || i < idx
        val sekarang = !tutup && i == idx
        val sub = when {
            s == StatusEskalasi.DIAJUKAN && e.pengaju != null -> "${e.pengaju} · ${tanggalJam(e.diajukanPada)}"
            s == StatusEskalasi.DIPUTUSKAN && e.pemutus != null ->
                e.pemutus + (e.diputuskanPada?.let { " · ${tanggalJam(it)}" } ?: "")
            else -> null
        }
        TahapAlur(
            judul = s.label,
            sub = sub,
            keadaan = when {
                selesai -> KeadaanTahap.SELESAI
                sekarang && e.lewatSla -> KeadaanTahap.TERHAMBAT
                sekarang -> KeadaanTahap.SEKARANG
                else -> KeadaanTahap.BELUM
            },
            meta = if (sekarang && e.lewatSla) "Lewat SLA" else null,
        )
    }
}

/** Pesan sukses snackbar per aksi (sama dengan toast web). */
fun pesanSukses(aksi: AksiEskalasi): String = when (aksi) {
    AksiEskalasi.TINJAU -> "Eskalasi ditandai sudah ditinjau."
    AksiEskalasi.PUTUSKAN -> "Keputusan tersimpan."
    AksiEskalasi.TUTUP -> "Eskalasi ditutup."
}

/** Batas minimal teks keputusan (server: 422 bila < 10). */
const val MIN_KEPUTUSAN = 10
