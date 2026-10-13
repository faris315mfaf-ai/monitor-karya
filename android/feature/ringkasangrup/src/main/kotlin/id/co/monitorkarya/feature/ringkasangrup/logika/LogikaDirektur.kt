// Fungsi murni layar Direktur entitas (B1) — port src/components/oversight/
// director-dashboard.tsx + weekly-reports.tsx (types.ts WEEKLY_BADGE). Semua
// isi layar ikut saringan divisi; angka, kalimat jawaban dan pendukung disusun
// di sini supaya bisa diuji tanpa Compose (LogikaDirekturTest).
package id.co.monitorkarya.feature.ringkasangrup.logika

import id.co.monitorkarya.feature.ringkasangrup.data.DivisiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.EskalasiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.MingguLaporanDto
import id.co.monitorkarya.feature.ringkasangrup.data.ProyekGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** WeeklyState web. */
object KeadaanMingguan {
    const val TERKIRIM = "sent"
    const val TERLAMBAT = "late"
    const val BELUM = "missing"
    const val DIBACA = "read"
}

/** WEEKLY_BADGE di oversight/types.ts. */
fun lencanaMingguanDivisi(state: String): Lencana = when (state) {
    KeadaanMingguan.TERKIRIM -> Lencana(StatusRingkas.ON, "Terkirim")
    KeadaanMingguan.TERLAMBAT -> Lencana(StatusRingkas.RISK, "Terlambat masuk")
    KeadaanMingguan.DIBACA -> Lencana(StatusRingkas.DONE, "Sudah dibaca")
    else -> Lencana(StatusRingkas.LATE, "Belum masuk")
}

/** "sent → terkirim" dsb. untuk kalimat pendukung satu divisi. */
private fun kataKeadaan(state: String): String = when (state) {
    KeadaanMingguan.TERKIRIM -> "terkirim"
    KeadaanMingguan.TERLAMBAT -> "terlambat masuk"
    KeadaanMingguan.DIBACA -> "sudah Anda baca"
    else -> "belum masuk"
}

/** Kunci minggu laporan "2026-W41" untuk pengingat; null bila respons lama. */
fun kunciMingguLaporan(rw: MingguLaporanDto?): String? =
    rw?.takeIf { it.isoYear > 0 && it.isoWeek > 0 }?.let { "${it.isoYear}-W${it.isoWeek.toString().padStart(2, '0')}" }

/**
 * Kunci penimpaan keadaan per laporan (bukan per divisi) supaya tanda baca
 * minggu lalu tidak menempel ke laporan minggu berikutnya (keyOf di web).
 */
fun kunciLaporanDivisi(d: DivisiGrupDto, kunciMinggu: String?): String = d.weekly.id ?: "${d.id}:${kunciMinggu.orEmpty()}"

/**
 * Label divisi yang bisa dibedakan (E2E-2 BUG-09): direktur berlingkup
 * sub-holding melihat divisi beberapa PT dengan nama sama ("Keuangan" x7).
 * Nama yang muncul lebih dari sekali diberi nama PT ("Keuangan · PT Energi
 * Migas Sumut"); nama unik tetap apa adanya. Kunci = id divisi.
 */
fun labelDivisiUnik(semua: List<DivisiGrupDto>): Map<String, String> {
    val ganda = semua.groupingBy { it.name.trim().lowercase() }.eachCount().filterValues { it > 1 }.keys
    return semua.associate { d ->
        val pt = d.entityName.trim().ifBlank { d.entityCode.trim() }
        d.id to if (d.name.trim().lowercase() in ganda && pt.isNotEmpty()) "${d.name} · $pt" else d.name
    }
}

/** Urutan chip saringan: dikelompokkan per PT, lalu nama divisi. */
fun urutanChipDivisi(semua: List<DivisiGrupDto>): List<DivisiGrupDto> =
    semua.sortedWith(compareBy({ it.entityName.lowercase() }, { it.name.lowercase() }))

/** Waktu kirim relatif ("2 jam lalu"); null bila server tidak memberi submittedAt (BUG-14b). */
fun waktuKirimRelatif(iso: String?, sekarang: java.time.ZonedDateTime? = null): String? {
    if (iso.isNullOrBlank()) return null
    val w = if (sekarang != null) FormatWib.relatif(iso, sekarang) else FormatWib.relatif(iso)
    return w.takeUnless { it == "-" }
}

/** Satu baris di kartu "Laporan mingguan divisi". Segmen tanpa data disembunyikan (bukan "-"). */
fun barisLaporanDivisi(d: DivisiGrupDto, state: String, labelMinggu: String, sekarang: java.time.ZonedDateTime? = null): String {
    val siapa = d.head?.name?.takeIf { it.isNotBlank() } ?: "Kepala divisi belum ditetapkan"
    if (state == KeadaanMingguan.BELUM) return "$siapa — belum mengirim laporan $labelMinggu."
    val pengirim = d.weekly.submittedBy?.takeIf { it.isNotBlank() } ?: siapa
    val kepala = listOfNotNull(pengirim, waktuKirimRelatif(d.weekly.submittedAt, sekarang)?.lowercase()).joinToString(" · ")
    val tanggapan = if (d.weekly.comments > 0) " ${d.weekly.comments} tanggapan." else ""
    val isi = d.weekly.summary?.trim()?.takeIf { it.isNotEmpty() }
    return if (isi != null) "$kepala — $isi$tanggapan" else "$kepala.$tanggapan"
}

/** Satu butir menunggu keputusan dari approvalRequests / deadlineProposals (JsonObject). */
data class ButirKeputusan(
    val id: String,
    val judul: String,
    val keterangan: String,
    /** "persetujuan" (materi/anggaran/cuti) atau "tenggat" (usulan geser tenggat). */
    val jenis: String,
)

private fun JsonObject.teks(k: String): String? = (this[k] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

private fun JsonObject.divisiId(): String? = teks("divisionId")

private val LABEL_JENIS_PERSETUJUAN = mapOf("MATERI" to "Materi", "ANGGARAN" to "Anggaran", "CUTI" to "Cuti")

/** Permintaan materi/anggaran/cuti → butir. */
fun butirPersetujuan(o: JsonObject): ButirKeputusan = ButirKeputusan(
    id = o.teks("id").orEmpty(),
    judul = o.teks("title") ?: "Permintaan persetujuan",
    keterangan = listOfNotNull(
        o.teks("type")?.let { LABEL_JENIS_PERSETUJUAN[it] ?: it },
        o.teks("requester"),
        o.teks("projectName") ?: o.teks("divisionName"),
    ).joinToString(" · "),
    jenis = "persetujuan",
)

/** Usulan geser tenggat → butir. */
fun butirTenggat(o: JsonObject): ButirKeputusan = ButirKeputusan(
    id = o.teks("id").orEmpty(),
    judul = "Geser tenggat ${o.teks("projectName").orEmpty()}".trim(),
    keterangan = listOfNotNull(
        o.teks("proposer"),
        o.teks("proposedDate")?.let { "usul ${FormatWib.tanggal(it)}" },
    ).joinToString(" · "),
    jenis = "tenggat",
)

/** Hasil susunan layar Direktur untuk satu saringan divisi. */
data class SusunanDirektur(
    /** Divisi terpilih; null = semua divisi. */
    val satu: DivisiGrupDto?,
    /** Divisi yang tampil (satu atau semua). */
    val divisi: List<DivisiGrupDto>,
    val proyek: List<ProyekGrupDto>,
    val eskalasi: List<EskalasiGrupDto>,
    val persetujuan: List<ButirKeputusan>,
    val tenggat: List<ButirKeputusan>,
    val hitung: Map<StatusRingkas, Int>,
    val total: Int,
    val sesuaiRencana: Int,
    val outputSelesai: Int,
    val outputTotal: Int,
    val belumMasuk: List<DivisiGrupDto>,
    val diterima: Int,
    val menunggu: Int,
    /** "persetujuan" | "eskalasi" | "keputusan". */
    val kataMenunggu: String,
    val teksMenunggu: String,
    val tepatWaktuPct: Int,
    val tepatWaktuBasisOutput: Boolean,
    val labelMinggu: List<String>,
    val trenOutput: List<Int>,
    val mingguIni: Int,
    val selisih: Int,
    val milestone: List<ProyekGrupDto>,
    val eyebrow: String,
    val jawaban: String,
    val pendukung: String,
    /** Label divisi unik per id (lihat [labelDivisiUnik]). */
    val labelDivisi: Map<String, String> = emptyMap(),
) {
    /** Label divisi yang bisa dibedakan antar-PT. */
    fun label(d: DivisiGrupDto): String = labelDivisi[d.id] ?: d.name
}

private const val HARI_MS = 86_400_000L

private fun epochMs(iso: String?): Long? = iso?.let {
    try {
        Instant.parse(it).toEpochMilli()
    } catch (_: DateTimeParseException) {
        FormatWib.urai(it)?.toInstant()?.toEpochMilli()
    }
}

/**
 * Susun seluruh angka layar Direktur (DirectorDashboard). [keadaan] memberi
 * keadaan laporan mingguan divisi setelah penimpaan lokal (tandai dibaca).
 */
fun susunDirektur(
    d: RingkasanGrupDto,
    divisiId: String?,
    keadaan: (DivisiGrupDto) -> String,
    sekarangMs: Long = System.currentTimeMillis(),
): SusunanDirektur {
    val semua = d.divisions
    val labelUnik = labelDivisiUnik(semua)
    fun lbl(x: DivisiGrupDto): String = labelUnik[x.id] ?: x.name
    val satu = semua.firstOrNull { it.id == divisiId }
    val divs = if (satu != null) listOf(satu) else semua
    fun diDiv(id: String?): Boolean = satu == null || id == satu.id
    val proyek = d.projects.filter { diDiv(it.divisionId) }
    val eskalasi = d.escalations.filter { diDiv(it.divisionId) }
    val persetujuan = d.approvalRequests.filter { diDiv(it.divisiId()) }.map(::butirPersetujuan)
    val tenggat = d.deadlineProposals.filter { diDiv(it.divisiId()) }.map(::butirTenggat)

    val hitung = hitungStatus(proyek)
    val total = proyek.size
    val sesuai = (hitung[StatusRingkas.ON] ?: 0) + (hitung[StatusRingkas.DONE] ?: 0)
    val outSelesai = divs.sumOf { it.outputs.done }
    val outTotal = divs.sumOf { it.outputs.total }
    val outTepat = divs.sumOf { it.outputs.onTime }
    val outBertenggat = divs.sumOf { it.outputs.withDue }
    val belum = divs.filter { keadaan(it) == KeadaanMingguan.BELUM }
    val diterima = divs.size - belum.size
    val keputusan = tenggat.size + persetujuan.size
    val menunggu = eskalasi.size + keputusan
    val kata = when {
        eskalasi.isEmpty() -> "persetujuan"
        keputusan == 0 -> "eskalasi"
        else -> "keputusan"
    }
    val teksMenunggu = if (eskalasi.isNotEmpty() && keputusan > 0) {
        "${FormatWib.angka(keputusan)} persetujuan dan ${FormatWib.angka(eskalasi.size)} eskalasi"
    } else {
        "${FormatWib.angka(menunggu)} $kata"
    }
    val tepatPct = if (outBertenggat > 0) persen(outTepat, outBertenggat) else d.daily.onTime30Pct

    val label = d.outputs?.trend?.week?.map { it.label }?.takeIf { it.isNotEmpty() } ?: d.trend.map { it.label }
    val tren = label.indices.map { i -> divs.sumOf { it.outputs.trend.getOrNull(i) ?: 0 } }
    val ini = tren.lastOrNull() ?: 0
    val lalu = tren.getOrNull(tren.size - 2) ?: 0

    val milestone = proyek
        .filter { it.status.lowercase() != "done" }
        .mapNotNull { p -> epochMs(p.targetEndDate)?.let { p to it - sekarangMs } }
        .filter { (_, sisa) -> sisa >= -HARI_MS && sisa <= 14 * HARI_MS }
        .sortedBy { it.second }
        .map { it.first }

    // Daftar panjang dipotong supaya kalimat pendukung tetap terbaca (BUG-09).
    val namaBelum = belum.map(::lbl)
    val teksBelum = when {
        belum.isEmpty() -> "Semua laporan mingguan sudah masuk"
        belum.size <= 3 -> "Laporan ${namaBelum.joinToString(", ")} belum masuk"
        else -> "Laporan ${namaBelum.take(2).joinToString(", ")} dan ${FormatWib.angka(belum.size - 2)} divisi lain belum masuk"
    }
    val pendukung = if (satu != null) {
        "${FormatWib.angka(satu.outputs.done)} dari ${FormatWib.angka(satu.outputs.total)} output selesai. " +
            "Laporan mingguan: ${kataKeadaan(keadaan(satu))}."
    } else {
        "${hitung[StatusRingkas.RISK] ?: 0} perlu perhatian, ${hitung[StatusRingkas.LATE] ?: 0} terlambat. $teksBelum." +
            if (menunggu > 0) " $teksMenunggu menunggu keputusan Anda." else ""
    }
    val eyebrow = if (satu != null) {
        "Divisi ${lbl(satu)} · ${satu.head?.name ?: "kepala divisi belum ditetapkan"}"
    } else {
        "${semua.size} divisi · ${FormatWib.angka(total)} proyek di bawah Anda"
    }
    val jawaban = when {
        total == 0 && satu != null -> "Divisi ${lbl(satu)} belum punya proyek aktif."
        total == 0 -> "Belum ada proyek aktif di bawah Anda."
        else -> "${FormatWib.angka(sesuai)} dari ${FormatWib.angka(total)} proyek berjalan sesuai rencana."
    }

    return SusunanDirektur(
        satu = satu,
        divisi = divs,
        proyek = proyek,
        eskalasi = eskalasi,
        persetujuan = persetujuan,
        tenggat = tenggat,
        hitung = hitung,
        total = total,
        sesuaiRencana = sesuai,
        outputSelesai = outSelesai,
        outputTotal = outTotal,
        belumMasuk = belum,
        diterima = diterima,
        menunggu = menunggu,
        kataMenunggu = kata,
        teksMenunggu = teksMenunggu,
        tepatWaktuPct = tepatPct,
        tepatWaktuBasisOutput = outBertenggat > 0,
        labelMinggu = label,
        trenOutput = tren,
        mingguIni = ini,
        selisih = ini - lalu,
        milestone = milestone,
        eyebrow = eyebrow,
        jawaban = jawaban,
        pendukung = pendukung,
        labelDivisi = labelUnik,
    )
}

/** Label minggu laporan ("M41"). */
fun labelMingguLaporan(d: RingkasanGrupDto): String = d.reportWeek?.label?.takeIf { it.isNotBlank() } ?: "M${d.week}"

/** Kalimat hasil pengingat menurut outcome server (toast web). */
fun teksHasilIngatkan(outcome: String?, d: DivisiGrupDto): String = when (outcome) {
    "TANPA_KEPALA" -> "Divisi ${d.name} belum punya kepala divisi. Minta Admin PT menetapkannya."
    "SUDAH_HARI_INI" -> "${d.head?.name ?: "Kepala divisi"} sudah diingatkan hari ini."
    else -> d.head?.let { "Pengingat terkirim ke ${it.name}." } ?: "Pengingat terkirim ke kepala divisi yang belum melapor."
}

/** Pengingat dianggap terkirim (tombol jadi "Pengingat terkirim") kecuali divisi tanpa kepala. */
fun pengingatTercatat(outcome: String?): Boolean = outcome != "TANPA_KEPALA"

/** Langkah alur laporan minggu ini (weeklyFlow web): judul, sub, status. */
data class LangkahAlur(val judul: String, val sub: String, val status: StatusRingkas)

fun alurMingguan(divisi: List<DivisiGrupDto>, keadaan: (DivisiGrupDto) -> String): List<LangkahAlur> {
    val n = divisi.size
    val belum = divisi.count { keadaan(it) == KeadaanMingguan.BELUM }
    val kirim = n - belum
    val baca = divisi.count { keadaan(it) == KeadaanMingguan.DIBACA }
    return listOf(
        LangkahAlur("PIC proyek", "Laporan harian", StatusRingkas.DONE),
        LangkahAlur(
            "Kepala divisi",
            "$kirim dari $n terkirim" + if (belum > 0) " · $belum belum masuk" else "",
            if (belum > 0) StatusRingkas.LATE else StatusRingkas.DONE,
        ),
        LangkahAlur(
            "Direktur",
            "$baca dari $kirim dibaca",
            when {
                kirim == 0 -> StatusRingkas.NEUTRAL
                baca == kirim -> StatusRingkas.DONE
                else -> StatusRingkas.INFO
            },
        ),
    )
}
