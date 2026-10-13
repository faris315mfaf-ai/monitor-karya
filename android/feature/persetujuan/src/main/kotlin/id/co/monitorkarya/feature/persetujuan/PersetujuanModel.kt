// Model tampilan tab Persetujuan + fungsi murni (label, nominal, tanggal,
// kalimat). Padanan web: approvalMeta/approvalTitle/ApprovalDetail
// (approval-requests.tsx), DeadlineProposalItems (deadline-decisions.tsx),
// kartu pengajuan proyek & eskalasi terbuka (approvals-view.tsx), konstanta
// APPROVAL_TYPE_LABELS/APPROVAL_STATUS_LABELS (src/lib/oversight-shared.ts).
package id.co.monitorkarya.feature.persetujuan

import id.co.monitorkarya.designsystem.components.MkStatus
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Tiga jenis antrean yang bisa diputuskan dari tab ini. */
enum class JenisAntrean { PERMINTAAN, TENGGAT, PROYEK }

/** Keputusan yang sudah diambil di sesi ini (baris meredup + lencana sampai dimuat ulang). */
enum class Keputusan(val label: String, val lencana: MkStatus) {
    DISETUJUI("Disetujui", MkStatus.DONE),
    DITOLAK("Ditolak", MkStatus.LATE),
}

/** Berkas pendukung siap tampil. */
data class BerkasInfo(val nama: String, val ukuran: String?)

/** Satu baris antrean keputusan beserta rincian untuk Sheet. */
data class ItemPersetujuan(
    val id: String,
    val jenis: JenisAntrean,
    val judul: String,
    val pengaju: String,
    val inisial: String,
    val waktu: String?,
    /** Nominal ringkas / rentang cuti / tanggal usulan / nama PT. */
    val meta: String,
    /** Izin dari server (viewer.canDecide* / decisions `mine`). */
    val bisaPutuskan: Boolean,
    /** "Anggaran · Divisi Teknologi · SIM RS · PT Bhakti". */
    val barisJenis: String,
    val nominalPenuh: String? = null,
    val rentang: String? = null,
    val deskripsi: String? = null,
    val berkas: BerkasInfo? = null,
    val keputusan: Keputusan? = null,
    /** MATERI/ANGGARAN/CUTI untuk permintaan; null untuk jenis lain. */
    val tipe: String? = null,
    /** Judul asli permintaan / nama proyek — dipakai kalimat sukses. */
    val namaAsli: String = judul,
    /** Tanggal usulan tenggat ringkas ("31 Okt"). */
    val tanggalUsul: String? = null,
    /** Keputusan sesi ini masih bisa diurungkan dari baris (jendela 15 menit server). */
    val bisaUrungkan: Boolean = false,
) {
    val kunci: String get() = kunci(jenis, id)

    /** Batas alasan penolakan (server: 422 bila kurang). */
    val minAlasan: Int get() = MIN_ALASAN

    val labelTolak: String
        get() = when (jenis) {
            JenisAntrean.PERMINTAAN -> "Tolak permintaan"
            JenisAntrean.TENGGAT -> "Tolak usulan"
            JenisAntrean.PROYEK -> "Tolak pengajuan"
        }

    val contohAlasan: String
        get() = when (jenis) {
            JenisAntrean.PERMINTAAN -> "Mis. Anggaran kuartal ini sudah terpakai 92%. Ajukan lagi Januari."
            JenisAntrean.TENGGAT -> "Mis. Tenggat tetap karena rilis terkait kampanye 24 Okt."
            JenisAntrean.PROYEK -> "Mis. Lingkup proyek tumpang tindih dengan proyek yang sudah berjalan."
        }

    companion object {
        fun kunci(jenis: JenisAntrean, id: String) = "${jenis.name}:$id"
    }
}

/** Eskalasi terbuka (baca saja; diputuskan di tab Eskalasi). */
data class EskalasiTerbuka(
    val id: String,
    val ringkasan: String,
    val alasan: String,
    val lewatSla: Boolean,
    val meta: String,
)

/** Satu baris riwayat keputusan 14 hari. */
data class RiwayatItem(
    val id: String,
    val judul: String,
    val sub: String,
    val keputusan: Keputusan,
    val catatan: String?,
)

/** Meja Persetujuan siap tampil. */
data class MejaPersetujuan(
    val konteks: String,
    val jawaban: String,
    val permintaan: List<ItemPersetujuan>,
    val tenggat: List<ItemPersetujuan>,
    val proyek: List<ItemPersetujuan>,
    val eskalasi: List<EskalasiTerbuka>,
    val menunggu: Int,
) {
    val kosong: Boolean get() = permintaan.isEmpty() && tenggat.isEmpty() && proyek.isEmpty() && eskalasi.isEmpty()
    val semua: List<ItemPersetujuan> get() = permintaan + tenggat + proyek
}

/** Riwayat + galatnya (riwayat gagal tidak menggagalkan antrean). */
data class RiwayatPersetujuan(val items: List<RiwayatItem> = emptyList(), val galat: String? = null)

const val MIN_ALASAN = 5

internal val LOKAL: Locale = Locale.forLanguageTag("id-ID")
private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val BULAN = listOf("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")

private val LABEL_JENIS = mapOf("MATERI" to "Materi", "ANGGARAN" to "Anggaran", "CUTI" to "Cuti")
private val LABEL_KEBUTUHAN = mapOf(
    "KEPUTUSAN" to "Keputusan",
    "ANGGARAN" to "Anggaran",
    "DUKUNGAN_LINTAS_FUNGSI" to "Dukungan lintas fungsi",
)
private val LABEL_SLOT = mapOf(
    "ADMIN_PT" to "Admin PT",
    "DIREKTUR_ENTITAS" to "Direktur entitas",
    "DIREKTUR_SDM_GA" to "Direksi holding",
    "MANAJEMEN" to "Manajemen holding",
)

fun labelJenis(type: String): String = LABEL_JENIS[type] ?: type

fun angka(n: Int): String = NumberFormat.getIntegerInstance(LOKAL).format(n)

private fun desimal(v: Double): String {
    val f = DecimalFormat("#,##0.#", DecimalFormatSymbols(LOKAL))
    return f.format(v)
}

/** "Rp 48.500.000" (rincian). */
fun rupiahPenuh(n: Long): String = "Rp " + NumberFormat.getIntegerInstance(LOKAL).format(n)

/** "Rp 48,5 jt" / "Rp 1,2 M" / "Rp 750.000" (formatAmountShort web). */
fun rupiahRingkas(n: Long): String = when {
    n >= 1_000_000_000L -> "Rp ${desimal(n / 1_000_000_000.0)} M"
    n >= 1_000_000L -> "Rp ${desimal(n / 1_000_000.0)} jt"
    else -> rupiahPenuh(n)
}

/** "1,4 MB" / "320 KB" / "900 B" (formatFileSize web). */
fun ukuranBerkas(b: Long): String = when {
    b < 1024 -> "$b B"
    b < 1024 * 1024 -> "${maxOf(1L, Math.round(b / 1024.0))} KB"
    else -> "${desimal(b / 1024.0 / 1024.0)} MB"
}

internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "12 Okt" WIB (formatDateShort web); "-" bila kosong. */
fun tanggalPendek(iso: String?): String {
    val t = cobaIso(iso)?.atZone(ZONA_WIB) ?: return "-"
    return "${t.dayOfMonth} ${BULAN[t.monthValue - 1]}"
}

/**
 * Padanan formatRelative web. Di bawah 24 jam memakai selisih jam/menit; di
 * atasnya memakai selisih HARI KALENDER WIB (C1-R9) agar "Kemarin" tidak
 * dihitung dari selisih 24 jam.
 */
fun waktuRelatif(iso: String?, sekarang: Instant = Instant.now()): String {
    val t = cobaIso(iso) ?: return "-"
    val selisih = Duration.between(t, sekarang)
    val menit = selisih.toMinutes()
    if (menit < 1) return "Baru saja"
    if (menit < 60) return "$menit menit lalu"
    if (menit < 24 * 60) return "${selisih.toHours()} jam lalu"
    val hari = ChronoUnit.DAYS.between(t.atZone(ZONA_WIB).toLocalDate(), sekarang.atZone(ZONA_WIB).toLocalDate())
    return when {
        hari > 7 -> t.atZone(ZONA_WIB).let { "${it.dayOfMonth} ${BULAN[it.monthValue - 1]} ${it.year}" }
        hari <= 1L -> "Kemarin"
        else -> "$hari hari lalu"
    }
}

/**
 * Tautan berkas bertanda tangan dari server hanya dibuka bila https dengan
 * host dan tanpa userinfo (C1-R1). Host penyimpanan bisa S3 atau Supabase
 * (dikonfigurasi server), jadi yang dijaga adalah skemanya: javascript:,
 * intent:, file:, content:, http: ditolak.
 */
fun tautanAman(url: String): Boolean {
    val u = runCatching { java.net.URI(url.trim()) }.getOrNull() ?: return false
    return u.scheme.equals("https", ignoreCase = true) && !u.host.isNullOrBlank() && u.rawUserInfo == null
}

/** Dua huruf awal nama untuk avatar. */
fun inisial(nama: String): String =
    nama.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1).uppercase(LOKAL) }
        .ifEmpty { "?" }

/** approvalMeta web: rentang cuti, nominal ringkas, atau divisi/kode PT. */
fun metaPermintaan(a: PermintaanDto): String = when {
    a.type == "CUTI" && a.startDate != null ->
        if (a.endDate != null && a.endDate != a.startDate) {
            "${tanggalPendek(a.startDate)}–${tanggalPendek(a.endDate)}"
        } else {
            tanggalPendek(a.startDate)
        }
    a.amount != null -> rupiahRingkas(a.amount)
    a.divisionName != null -> "Divisi ${a.divisionName}"
    else -> a.entityCode
}

/** approvalTitle web: cuti memakai judulnya, lainnya "Jenis: judul". */
fun judulPermintaan(a: PermintaanDto): String = if (a.type == "CUTI") a.title else "${labelJenis(a.type)}: ${a.title}"

fun PermintaanDto.keItem(bisaPutuskan: Boolean, keputusan: Keputusan?): ItemPersetujuan = ItemPersetujuan(
    id = id,
    jenis = JenisAntrean.PERMINTAAN,
    judul = judulPermintaan(this),
    pengaju = requester,
    inisial = inisial(requester),
    waktu = createdAt,
    meta = metaPermintaan(this),
    bisaPutuskan = bisaPutuskan,
    barisJenis = listOfNotNull(
        labelJenis(type),
        divisionName?.let { "Divisi $it" },
        projectName,
        entityName.ifBlank { null },
    ).joinToString(" · "),
    nominalPenuh = amount?.let { rupiahPenuh(it) },
    rentang = if (type == "CUTI" && startDate != null) metaPermintaan(this) else null,
    deskripsi = description?.ifBlank { null },
    berkas = file?.let { BerkasInfo(it.name, it.size?.let(::ukuranBerkas)) },
    keputusan = keputusan,
    tipe = type,
    namaAsli = title,
)

fun UsulanTenggatDto.keItem(bisaPutuskan: Boolean, keputusan: Keputusan?): ItemPersetujuan = ItemPersetujuan(
    id = id,
    jenis = JenisAntrean.TENGGAT,
    judul = "Geser tenggat $projectName ke ${tanggalPendek(proposedDate)}",
    pengaju = proposer,
    inisial = inisial(proposer),
    waktu = proposedAt,
    meta = previousDate?.let { "semula ${tanggalPendek(it)}" } ?: entityName,
    bisaPutuskan = bisaPutuskan,
    barisJenis = listOf("Usulan geser tenggat", projectName, entityName).filter { it.isNotBlank() }.joinToString(" · "),
    rentang = "Usul ${tanggalPendek(proposedDate)}" + (previousDate?.let { " · semula ${tanggalPendek(it)}" } ?: ""),
    deskripsi = reason.ifBlank { null },
    keputusan = keputusan,
    namaAsli = projectName,
    tanggalUsul = tanggalPendek(proposedDate),
)

fun PengajuanProyekDto.keItem(keputusan: Keputusan?): ItemPersetujuan = ItemPersetujuan(
    id = id,
    jenis = JenisAntrean.PROYEK,
    judul = "Proyek baru: $name",
    pengaju = proposer,
    inisial = inisial(proposer),
    waktu = proposedAt,
    meta = entityName,
    // `decisions` dari server sudah disaring ke slot milik akun ini (canSignSlot).
    bisaPutuskan = true,
    barisJenis = listOfNotNull(
        "Pengajuan proyek",
        entityName.ifBlank { null },
        slot?.let { "Slot ${LABEL_SLOT[it] ?: it}" },
    ).joinToString(" · "),
    keputusan = keputusan,
    namaAsli = name,
)

fun EskalasiTerbukaDto.keTampil(): EskalasiTerbuka = EskalasiTerbuka(
    id = id,
    ringkasan = summary,
    alasan = "${raisedBy ?: entityName} · butuh ${(LABEL_KEBUTUHAN[needed] ?: needed).lowercase(LOKAL)}",
    lewatSla = overdue,
    meta = if (overdue) "lewat SLA, $ageDays hari" else "$ageDays hari",
)

fun PermintaanDto.keRiwayat(): RiwayatItem? {
    val k = when (status) {
        "DISETUJUI" -> Keputusan.DISETUJUI
        "DITOLAK" -> Keputusan.DITOLAK
        else -> return null
    }
    val oleh = listOfNotNull(decidedBy ?: "—", decidedAt?.let { waktuRelatif(it).lowercase(LOKAL) }).joinToString(" ")
    return RiwayatItem(
        id = id,
        judul = judulPermintaan(this),
        sub = "$requester · ${metaPermintaan(this)} · $oleh",
        keputusan = k,
        catatan = decisionNote?.ifBlank { null },
    )
}

/** Susun meja dari ringkasan + keputusan lokal sesi ini (kunci → keputusan). */
fun susunMeja(r: RingkasanPersetujuanResponse, diputuskan: Map<String, Keputusan>): MejaPersetujuan {
    val bolehPermintaan = r.viewer?.canDecideApproval != false
    // Web: viewer.canDecideDeadline === false → usulan tidak ditampilkan sama sekali.
    val tenggatTampil = if (r.viewer?.canDecideDeadline == false) emptyList() else r.deadlineProposals
    val permintaan = r.approvalRequests.map {
        it.keItem(bolehPermintaan, diputuskan[ItemPersetujuan.kunci(JenisAntrean.PERMINTAAN, it.id)])
    }
    val tenggat = tenggatTampil.map {
        it.keItem(true, diputuskan[ItemPersetujuan.kunci(JenisAntrean.TENGGAT, it.id)])
    }
    val proyek = r.decisions.map { it.keItem(diputuskan[ItemPersetujuan.kunci(JenisAntrean.PROYEK, it.id)]) }
    val eskalasi = r.escalations.map { it.keTampil() }
    val menunggu = (permintaan + tenggat + proyek).count { it.keputusan == null }
    val jawaban = when {
        menunggu > 0 -> "${angka(menunggu)} persetujuan menunggu keputusan Anda."
        eskalasi.isNotEmpty() -> "Semua persetujuan sudah beres. ${angka(eskalasi.size)} eskalasi masih terbuka."
        else -> "Semua persetujuan sudah beres."
    }
    return MejaPersetujuan(
        konteks = if (r.scope.global) "Seluruh grup" else "${angka(r.scope.entities)} perusahaan",
        jawaban = jawaban,
        permintaan = permintaan,
        tenggat = tenggat,
        proyek = proyek,
        eskalasi = eskalasi,
        menunggu = menunggu,
    )
}

/** Pesan sukses keputusan (toast web). */
fun pesanKeputusan(item: ItemPersetujuan, setuju: Boolean): String = when (item.jenis) {
    JenisAntrean.PERMINTAAN -> when {
        !setuju -> "Permintaan ${item.pengaju} ditolak. Alasannya terkirim."
        item.tipe == "CUTI" -> "Cuti ${item.pengaju} disetujui dan dicatat di kehadiran."
        else -> "${labelJenis(item.tipe.orEmpty())} \"${item.namaAsli}\" disetujui."
    }
    JenisAntrean.TENGGAT ->
        if (setuju) {
            "Tenggat ${item.namaAsli} digeser ke ${item.tanggalUsul ?: "-"}."
        } else {
            "Usulan tenggat ${item.namaAsli} ditolak. PIC menerima alasannya."
        }
    JenisAntrean.PROYEK -> if (setuju) "Pengajuan proyek disetujui." else "Pengajuan proyek ditolak. Alasannya terkirim."
}

/** Pesan urungkan berhasil (toast web). */
fun pesanUrungkan(jenis: JenisAntrean): String = when (jenis) {
    JenisAntrean.PERMINTAAN -> "Keputusan diurungkan. Permintaan kembali menunggu."
    JenisAntrean.TENGGAT -> "Keputusan diurungkan. Usulan kembali menunggu."
    JenisAntrean.PROYEK -> "Keputusan diurungkan. Pengajuan kembali menunggu."
}
