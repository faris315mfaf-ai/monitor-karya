// Fungsi murni dashboard pemantau grup — port dari
// src/components/oversight/management-dashboard.tsx, company-reports.tsx,
// src/components/views/management-charts.tsx dan dashboard/compliance-treemap.tsx.
// Diuji di src/test (PemetaanTest).
package id.co.monitorkarya.feature.ringkasangrup.logika

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.status.KEPATUHAN_PERHATIAN_MIN
import id.co.monitorkarya.core.domain.status.PitaKepatuhan
import id.co.monitorkarya.core.domain.status.pitaKepatuhanAtauNull
import id.co.monitorkarya.feature.ringkasangrup.data.BulanKpiDto
import id.co.monitorkarya.feature.ringkasangrup.data.DivisiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.ProyekGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.SimpulPetaDto
import id.co.monitorkarya.feature.ringkasangrup.data.TrenBulanDto
import id.co.monitorkarya.feature.ringkasangrup.data.TrenKpiDto
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/** Status tampilan (dipetakan ke MkStatus di lapisan UI). */
enum class StatusRingkas { ON, RISK, LATE, DONE, NEUTRAL, INFO }

/** Lencana = status + kata (warna + ikon diberi StatusBadge). */
data class Lencana(val status: StatusRingkas, val label: String)

/** Peran yang memakai layar ringkasan pemantau grup (oversight-dashboard.tsx). */
val PERAN_PEMANTAU: Set<Peran> = setOf(
    Peran.MANAJEMEN,
    Peran.DIREKTUR_ENTITAS,
    Peran.DIREKTUR_SDM_GA,
    Peran.AUDITOR,
    Peran.TI,
    Peran.SUPERADMIN,
)

/** Target tepat waktu laporan (DivisionBar "target 85%"). */
const val TARGET_TEPAT_WAKTU = 85

/** a/b dalam persen bulat; 0 bila b = 0 (pct di types.ts). */
fun persen(a: Int, b: Int): Int = if (b > 0) ((a.toDouble() / b) * 100).roundToInt() else 0

/** "on|risk|late|done|neutral" server → StatusRingkas. */
fun statusProyek(s: String?): StatusRingkas = when (s?.lowercase()) {
    "on" -> StatusRingkas.ON
    "risk" -> StatusRingkas.RISK
    "late" -> StatusRingkas.LATE
    "done" -> StatusRingkas.DONE
    "info" -> StatusRingkas.INFO
    else -> StatusRingkas.NEUTRAL
}

/** Kosakata status proyek tetap (STATUS di mk/core.tsx). */
fun labelStatusProyek(s: StatusRingkas): String = when (s) {
    StatusRingkas.ON -> "Sesuai jadwal"
    StatusRingkas.RISK -> "Perlu perhatian"
    StatusRingkas.LATE -> "Terlambat"
    StatusRingkas.DONE -> "Selesai"
    StatusRingkas.INFO -> "Diingatkan"
    StatusRingkas.NEUTRAL -> "Belum mulai"
}

/** Satu PT beserta proyeknya (groupCompanies). */
data class KelompokPerusahaan(
    val entityId: String,
    val nama: String,
    val kode: String,
    val proyek: List<ProyekGrupDto>,
    val lapor: Int,
) {
    val total: Int get() = proyek.size
}

/** Kelompokkan proyek per PT; urutan mengikuti kemunculan pertama. */
fun kelompokPerusahaan(proyek: List<ProyekGrupDto>): List<KelompokPerusahaan> {
    val urut = LinkedHashMap<String, MutableList<ProyekGrupDto>>()
    for (p in proyek) urut.getOrPut(p.entityId) { mutableListOf() }.add(p)
    return urut.map { (id, daftar) ->
        val pertama = daftar.first()
        KelompokPerusahaan(
            entityId = id,
            nama = pertama.entityName,
            kode = pertama.entityCode,
            proyek = daftar,
            lapor = daftar.count { it.reportedToday },
        )
    }
}

/** Lencana kepatuhan hari ini kartu perusahaan (companyBadge). */
fun lencanaPerusahaan(lapor: Int, total: Int): Lencana = when {
    total <= 0 -> Lencana(StatusRingkas.NEUTRAL, "Belum ada yang wajib")
    lapor >= total -> Lencana(StatusRingkas.DONE, "Semua lapor")
    lapor <= 0 -> Lencana(StatusRingkas.RISK, "Belum ada yang lapor")
    else -> Lencana(StatusRingkas.RISK, "${total - lapor} belum lapor")
}

/** Status laporan harian → lencana (REPORT_STATUS). */
fun lencanaLaporan(status: String?): Lencana = when (status) {
    "SELESAI" -> Lencana(StatusRingkas.DONE, "Selesai")
    "ON_PROGRESS" -> Lencana(StatusRingkas.ON, "Dikerjakan")
    "TERKENDALA" -> Lencana(StatusRingkas.RISK, "Terkendala")
    "MENUNGGU_KEPUTUSAN" -> Lencana(StatusRingkas.RISK, "Menunggu keputusan")
    "TIDAK_ADA_PERUBAHAN" -> Lencana(StatusRingkas.NEUTRAL, "Tanpa perubahan")
    null, "" -> Lencana(StatusRingkas.NEUTRAL, "Tanpa status")
    else -> Lencana(StatusRingkas.NEUTRAL, status)
}

/** Status eskalasi → lencana (ESCALATION_BADGE). */
fun lencanaEskalasi(status: String?): Lencana = when (status) {
    "DIAJUKAN" -> Lencana(StatusRingkas.RISK, "Diajukan")
    "DITINJAU" -> Lencana(StatusRingkas.INFO, "Ditinjau")
    "DIPUTUSKAN" -> Lencana(StatusRingkas.DONE, "Diputuskan")
    "DITUTUP" -> Lencana(StatusRingkas.DONE, "Ditutup")
    null, "" -> Lencana(StatusRingkas.NEUTRAL, "Tanpa status")
    else -> Lencana(StatusRingkas.NEUTRAL, status)
}

/** ESCALATION_NEEDED_LABELS. */
fun labelDibutuhkan(n: String): String = when (n) {
    "KEPUTUSAN" -> "Keputusan"
    "ANGGARAN" -> "Anggaran"
    "DUKUNGAN_LINTAS_FUNGSI" -> "Dukungan lintas fungsi"
    else -> n
}

/** Ratakan spasi lalu pangkas jadi satu baris (oneLine). */
fun satuBaris(teks: String?, maks: Int = 110): String {
    val t = (teks ?: "").replace(Regex("\\s+"), " ").trim()
    if (t.isEmpty()) return ""
    return if (t.length > maks) t.take(maks - 1).trimEnd() + "…" else t
}

/** "PIC belum ditentukan" bila kosong. */
fun namaPic(p: ProyekGrupDto): String = p.pic?.trim().takeUnless { it.isNullOrEmpty() } ?: "PIC belum ditentukan"

/**
 * "PIC <nama>" untuk subjudul baris. E2E-3: tanpa awalan ganda — nama akun
 * yang sudah diawali "PIC" (mis. "PIC Pembangunan …") dan PIC kosong
 * ("PIC belum ditentukan") tidak lagi menjadi "PIC PIC …".
 */
fun labelPic(p: ProyekGrupDto): String = id.co.monitorkarya.core.domain.teks.labelPic(p.pic) // N-05: "Belum ada PIC" dikenali

/** Hitungan status dari daftar proyek (dihitung ulang seperti web, bukan `counts`). */
fun hitungStatus(proyek: List<ProyekGrupDto>): Map<StatusRingkas, Int> {
    val m = linkedMapOf(
        StatusRingkas.ON to 0,
        StatusRingkas.RISK to 0,
        StatusRingkas.LATE to 0,
        StatusRingkas.DONE to 0,
        StatusRingkas.NEUTRAL to 0,
    )
    for (p in proyek) {
        val s = statusProyek(p.status).takeIf { it in m } ?: StatusRingkas.NEUTRAL
        m[s] = (m[s] ?: 0) + 1
    }
    return m
}

/** Konteks kepala layar: "seluruh grup" / nama PT / "n perusahaan". */
fun labelCakupan(d: RingkasanGrupDto): String = when {
    d.scope.global -> "Seluruh grup"
    d.byEntity.size == 1 -> d.byEntity.first().name
    else -> "${FormatWib.angka(d.byEntity.size)} perusahaan"
}

/** Jumlah keputusan terbuka: pengajuan proyek + usulan tenggat + permintaan persetujuan. */
fun jumlahPersetujuan(d: RingkasanGrupDto): Int =
    d.decisions.size + d.deadlineProposals.size + d.approvalRequests.size

/** Satu kalimat jawaban di atas dashboard. */
fun kalimatJawaban(d: RingkasanGrupDto): String {
    val total = d.projects.size
    if (total == 0) return "Belum ada proyek aktif di cakupan Anda."
    val c = hitungStatus(d.projects)
    val sesuai = (c[StatusRingkas.ON] ?: 0) + (c[StatusRingkas.DONE] ?: 0)
    return "${FormatWib.angka(sesuai)} dari ${FormatWib.angka(total)} proyek berjalan sesuai rencana."
}

/** Kalimat pendukung di bawah jawaban (supporting). */
fun kalimatPendukung(d: RingkasanGrupDto): String {
    val c = hitungStatus(d.projects)
    val risk = c[StatusRingkas.RISK] ?: 0
    val late = c[StatusRingkas.LATE] ?: 0
    val satu = if (risk > 0 || late > 0) "$risk perlu perhatian, $late terlambat." else "Tidak ada proyek yang tertahan."
    val setuju = jumlahPersetujuan(d)
    val dua = when {
        setuju > 0 -> "$setuju persetujuan menunggu Anda."
        d.escalations.isNotEmpty() -> "${d.escalations.size} eskalasi masih terbuka."
        else -> "Tidak ada keputusan yang menunggu."
    }
    return "$satu $dua"
}

/** Rata-rata progres proyek (bulat). */
fun rataProgres(proyek: List<ProyekGrupDto>): Int =
    if (proyek.isEmpty()) 0 else (proyek.sumOf { it.progress }.toDouble() / proyek.size).roundToInt()

/** Delta KPI rata-rata progres: "+4 poin vs akhir minggu lalu" / "n proyek selesai". */
fun deltaProgres(d: RingkasanGrupDto): String {
    val pc = d.progressComparison
    if (pc != null) {
        val delta = pc.delta.roundToInt()
        val tanda = if (delta > 0) "+" else ""
        return "$tanda$delta poin vs akhir minggu lalu"
    }
    val selesai = hitungStatus(d.projects)[StatusRingkas.DONE] ?: 0
    return "$selesai proyek selesai"
}

/** Satu batang kinerja (DivisionBar). */
data class BarisKinerja(val nama: String, val ok: Int, val total: Int, val pct: Int, val meta: String)

/**
 * Kinerja divisi: divisi bernama sama di semua PT digabung per typeName,
 * diurutkan dari tepat waktu tertinggi (divisionPerf).
 */
fun kinerjaDivisi(divisi: List<DivisiGrupDto>): List<BarisKinerja> {
    data class Akum(var ok: Int = 0, var total: Int = 0, var output: Boolean = false)
    val m = LinkedHashMap<String, Akum>()
    for (d in divisi) {
        val ot = d.onTime ?: continue
        val k = d.typeName.ifBlank { d.name }
        val a = m.getOrPut(k) { Akum() }
        a.ok += ot.ok
        a.total += ot.total
        if (ot.basis == "output") a.output = true
    }
    return m.map { (nama, a) ->
        val satuan = if (a.output) "output tepat waktu" else "proyek lapor hari ini"
        BarisKinerja(
            nama = nama,
            ok = a.ok,
            total = a.total,
            pct = persen(a.ok, a.total),
            meta = "${FormatWib.angka(a.ok)} dari ${FormatWib.angka(a.total)} $satuan",
        )
    }.sortedByDescending { it.pct }
}

/** Tepat waktu per perusahaan (kartu cadangan bila divisi tak punya data). */
fun kinerjaPerusahaan(d: RingkasanGrupDto): List<BarisKinerja> = d.byEntity.map { e ->
    BarisKinerja(
        nama = e.name,
        ok = e.onTime,
        total = e.total,
        pct = e.onTimePct ?: 0,
        meta = "${FormatWib.angka(e.onTime)} dari ${FormatWib.angka(e.total)} laporan tepat waktu",
    )
}

/**
 * Skor kepatuhan → lencana (status + kata) untuk SEMUA tampilan skor ringkasan
 * grup: peta, sub-holding, 10 PT terendah. Satu ambang (KEPUTUSAN-AMBANG-
 * KEPATUHAN.md, B15): ≥90 Baik (on) · 75–89 Perlu perhatian (risk) · <75
 * Kritis (late); skor tidak ada → netral "Belum ada skor".
 */
fun pitaKepatuhan(skor: Double?): Lencana {
    val pita = pitaKepatuhanAtauNull(skor) ?: return Lencana(StatusRingkas.NEUTRAL, "Belum ada skor")
    return Lencana(pita.statusRingkas(), pita.label)
}

/** Pita → status tampilan (Baik on · Perlu perhatian risk · Kritis late; tone done tidak dipakai). */
fun PitaKepatuhan.statusRingkas(): StatusRingkas = when (this) {
    PitaKepatuhan.BAIK -> StatusRingkas.ON
    PitaKepatuhan.PERHATIAN -> StatusRingkas.RISK
    PitaKepatuhan.KRITIS -> StatusRingkas.LATE
}

/** Kalimat ringkasan "10 PT terendah": diBawahTarget server = jumlah skor < 75. */
fun kalimatKritis(kritis: Int, entitas: Int): String =
    "${FormatWib.angka(kritis)} dari ${FormatWib.angka(entitas)} entitas berstatus kritis (skor di bawah $KEPATUHAN_PERHATIAN_MIN)."

/** Satu sel peta panas: PT dan skornya. */
data class SelPeta(val id: String, val nama: String, val kode: String, val skor: Double?)

/** Satu baris peta panas: kelompok (sub-holding) beserta PT-nya. */
data class KelompokPeta(val nama: String, val rata: Double?, val sel: List<SelPeta>)

/**
 * Ratakan pohon compliance-map jadi kelompok → sel PT. Struktur berjenjang
 * (sub-holding → … → PT) memberi satu kelompok per simpul puncak; struktur
 * datar (holding → PT) menggabungkan semua PT ke satu kelompok "Perusahaan".
 */
fun ratakanPeta(pohon: List<SimpulPetaDto>): List<KelompokPeta> {
    fun daun(s: SimpulPetaDto): List<SimpulPetaDto> =
        if (s.children.isEmpty()) listOf(s) else s.children.flatMap { daun(it) }
    fun sel(s: SimpulPetaDto) = SelPeta(s.id, s.name, s.code, s.complianceScore)

    val berjenjang = pohon.filter { it.children.isNotEmpty() }
    val datar = pohon.filter { it.children.isEmpty() }
    val hasil = berjenjang.map { k ->
        KelompokPeta(nama = k.name, rata = k.avgComplianceScore, sel = daun(k).map(::sel))
    }.toMutableList()
    if (datar.isNotEmpty()) {
        val skor = datar.mapNotNull { it.complianceScore }
        val rata = if (skor.isEmpty()) null else skor.average()
        hasil += KelompokPeta(nama = "Perusahaan", rata = rata, sel = datar.map(::sel))
    }
    return hasil.filter { it.sel.isNotEmpty() }
}

/** Indikator tren KPI (TREND_METRICS). */
enum class MetrikKpi(val label: String) {
    KEPATUHAN("Kepatuhan"),
    TEPAT_WAKTU("Tepat waktu"),
    MINGGUAN("Mingguan"),
    BUKTI("Bukti"),
}

/**
 * Tren KPI dari `trend` /api/management-charts (C4 P2-7) — sumber yang sama dengan
 * web, sehingga peran ber-cakupan tanpa scopeEntityId (mis. AUDITOR/TI) tidak lagi
 * mendapat 403 dari /api/kpi-trends. Bentuk [TrenKpiDto] dipertahankan untuk layar.
 */
fun trenDariGrafik(trend: List<TrenBulanDto>): TrenKpiDto = TrenKpiDto(
    months = trend.map { b ->
        BulanKpiDto(
            label = b.label,
            avgCompliance = b.kepatuhan,
            avgOnTime = b.tepatWaktu,
            avgWeeklyCompleteness = b.mingguan,
            avgEvidenceCompleteness = b.bukti,
            // management-charts tidak mengirim jumlah entitas: tandai bulan berisi data.
            totalEntities = if (b.kepatuhan > 0 || b.tepatWaktu > 0 || b.mingguan > 0 || b.bukti > 0) 1 else 0,
        )
    },
)

/** Nilai satu indikator pada satu bulan. */
fun nilaiMetrik(b: BulanKpiDto, m: MetrikKpi): Double = when (m) {
    MetrikKpi.KEPATUHAN -> b.avgCompliance
    MetrikKpi.TEPAT_WAKTU -> b.avgOnTime
    MetrikKpi.MINGGUAN -> b.avgWeeklyCompleteness
    MetrikKpi.BUKTI -> b.avgEvidenceCompleteness
}

/** HARIAN → "Harian", MINGGUAN → "Mingguan". */
fun labelSiklus(cycle: String): String = when (cycle.uppercase()) {
    "HARIAN" -> "Harian"
    "MINGGUAN" -> "Mingguan"
    else -> cycle.lowercase().replaceFirstChar { it.uppercase() }
}

/** Kolom penyerahan mingguan (WEEKLY_COLUMNS) beserta statusnya. */
val KOLOM_MINGGUAN: List<Pair<String, StatusRingkas>> = listOf(
    "Draft" to StatusRingkas.NEUTRAL,
    "Menunggu persetujuan" to StatusRingkas.RISK,
    "Disetujui" to StatusRingkas.ON,
    "Terkunci" to StatusRingkas.DONE,
)

/** Satu baris penyerahan mingguan per kelompok: nama + lencana "n draft" dst. (hanya yang > 0). */
data class BarisMingguan(val nama: String, val lencana: List<Lencana>)

/** Urai baris campuran weeklyByGroup {name, "Draft": n, …}. */
fun barisMingguan(obj: JsonObject): BarisMingguan {
    val nama = (obj["name"] as? JsonPrimitive)?.contentOrNull ?: "—"
    val lencana = KOLOM_MINGGUAN.mapNotNull { (kunci, status) ->
        val n = (obj[kunci] as? JsonPrimitive)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() } ?: 0
        if (n > 0) Lencana(status, "${FormatWib.angka(n)} ${kunci.lowercase()}") else null
    }
    return BarisMingguan(nama, lencana)
}

/** Status laporan harian (dailyStatus) → status warna donat (DAILY_TONE). */
fun statusDonatHarian(status: String): StatusRingkas = when (status) {
    "SELESAI" -> StatusRingkas.DONE
    "ON_PROGRESS" -> StatusRingkas.INFO
    "TERKENDALA" -> StatusRingkas.LATE
    "MENUNGGU_KEPUTUSAN" -> StatusRingkas.RISK
    else -> StatusRingkas.NEUTRAL
}
