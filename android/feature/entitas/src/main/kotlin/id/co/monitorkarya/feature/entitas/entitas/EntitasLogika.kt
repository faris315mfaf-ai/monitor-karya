// Logika murni tab Entitas (padanan fungsi pembantu entities-view.tsx):
// kumpulkan PT, pangkas pohon menurut pencarian, cabang + kedalaman,
// perataan pohon menjadi baris LazyColumn, ringkasan hero, dan rata-rata
// kepatuhan turunan untuk simpul non-PT. Tanpa Compose agar mudah diuji.
package id.co.monitorkarya.feature.entitas.entitas

import id.co.monitorkarya.feature.entitas.data.AktivitasEntitasResponse
import id.co.monitorkarya.feature.entitas.data.AktivitasPtDto
import id.co.monitorkarya.feature.entitas.data.SimpulEntitasDto
import id.co.monitorkarya.feature.entitas.ui.statusKepatuhan
import id.co.monitorkarya.designsystem.components.MkStatus

/** Kedalaman yang terbuka bawaan: dua tingkat teratas. */
internal const val KEDALAMAN_TERBUKA_BAWAAN = 2

/** Semua simpul PT di pohon (rekursif, urutan pohon). */
fun kumpulkanPt(simpul: List<SimpulEntitasDto>): List<SimpulEntitasDto> = buildList {
    fun jalan(daftar: List<SimpulEntitasDto>) {
        for (s in daftar) {
            if (s.type == "PT") add(s)
            if (s.children.isNotEmpty()) jalan(s.children)
        }
    }
    jalan(simpul)
}

/**
 * Pangkas pohon menurut kata kunci (nama, kode, wilayah). Simpul yang cocok
 * membawa seluruh turunannya; simpul yang tidak cocok tetap ada bila salah
 * satu turunannya cocok.
 */
fun saringPohon(simpul: List<SimpulEntitasDto>, jarum: String): List<SimpulEntitasDto> {
    val j = jarum.trim().lowercase()
    if (j.isEmpty()) return simpul
    return simpul.mapNotNull { s ->
        val cocok = listOf(s.name, s.code, s.region.orEmpty()).any { it.lowercase().contains(j) }
        when {
            cocok -> s
            else -> saringPohon(s.children, j).takeIf { it.isNotEmpty() }?.let { s.copy(children = it) }
        }
    }
}

/** Simpul yang punya anak beserta kedalamannya. */
fun cabang(simpul: List<SimpulEntitasDto>, kedalaman: Int = 0): List<Pair<String, Int>> = buildList {
    for (s in simpul) {
        if (s.children.isNotEmpty()) {
            add(s.id to kedalaman)
            addAll(cabang(s.children, kedalaman + 1))
        }
    }
}

/** Apakah simpul terbuka: pencarian aktif membuka semua; selain itu ubahan pengguna atau bawaan. */
fun simpulTerbuka(id: String, kedalaman: Int, ubahan: Map<String, Boolean>, mencari: Boolean): Boolean =
    mencari || (ubahan[id] ?: (kedalaman < KEDALAMAN_TERBUKA_BAWAAN))

/** Semua cabang sedang terbuka (menentukan label "Buka semua"/"Ciutkan semua"). */
fun semuaTerbuka(pohon: List<SimpulEntitasDto>, ubahan: Map<String, Boolean>): Boolean {
    val c = cabang(pohon)
    return c.isNotEmpty() && c.all { (id, d) -> ubahan[id] ?: (d < KEDALAMAN_TERBUKA_BAWAAN) }
}

/** Satu baris pohon yang sudah diratakan untuk LazyColumn. */
data class BarisPohon(
    val simpul: SimpulEntitasDto,
    val kedalaman: Int,
    val punyaAnak: Boolean,
    val terbuka: Boolean,
    /** Rata-rata kepatuhan PT turunan (non-PT) atau skor sendiri (PT); null = belum ada skor. */
    val skor: Double?,
    /** Jumlah PT turunan yang punya skor (0 untuk PT). */
    val jumlahPtBerskor: Int,
)

/** Ratakan pohon; anak hanya ikut bila induknya terbuka. */
fun ratakanPohon(
    pohon: List<SimpulEntitasDto>,
    ubahan: Map<String, Boolean>,
    mencari: Boolean,
): List<BarisPohon> = buildList {
    fun jalan(daftar: List<SimpulEntitasDto>, d: Int) {
        for (s in daftar) {
            val punyaAnak = s.children.isNotEmpty()
            val terbuka = punyaAnak && simpulTerbuka(s.id, d, ubahan, mencari)
            val (skor, jumlah) = skorSimpul(s)
            add(BarisPohon(s, d, punyaAnak, terbuka, skor, jumlah))
            if (terbuka) jalan(s.children, d + 1)
        }
    }
    jalan(pohon, 0)
}

/**
 * Skor kepatuhan sebuah simpul: PT = skornya sendiri (null bila KPI belum
 * dihitung); non-PT = rata-rata PT turunan yang berskor (padanan
 * avgComplianceScore compliance-map, tetapi PT tanpa KPI tidak dihitung 0).
 */
fun skorSimpul(s: SimpulEntitasDto): Pair<Double?, Int> {
    if (s.type == "PT") return (s.kpi?.complianceScore) to 0
    val berskor = kumpulkanPt(s.children).mapNotNull { it.kpi?.complianceScore }
    return (if (berskor.isEmpty()) null else berskor.average()) to berskor.size
}

/** Ringkasan hero di atas pohon. */
data class RingkasanPohon(
    val jumlahPt: Int,
    /** Nama PT berstatus perlu perhatian/terlambat (urutan pohon). */
    val perluPerhatian: List<String>,
    val rataRata: Double?,
    val tertunda: Int,
    val terlambatHariIni: Int,
)

fun ringkasPohon(pohon: List<SimpulEntitasDto>): RingkasanPohon {
    val pts = kumpulkanPt(pohon)
    val berskor = pts.filter { it.kpi != null }
    val perlu = berskor.filter {
        val st = statusKepatuhan(it.kpi!!.complianceScore)
        st == MkStatus.RISK || st == MkStatus.LATE
    }
    return RingkasanPohon(
        jumlahPt = pts.size,
        perluPerhatian = perlu.map { it.name },
        rataRata = if (berskor.isEmpty()) null else berskor.map { it.kpi!!.complianceScore }.average(),
        tertunda = pts.sumOf { it.kpi?.pendingReports ?: 0 },
        terlambatHariIni = pts.sumOf { it.kpi?.lateToday ?: 0 },
    )
}

// ------------------------------------------------------------------
// Aktivitas
// ------------------------------------------------------------------

/** Kadens papan aktivitas. */
enum class Kadens(val kode: String) { HARIAN("HARIAN"), MINGGUAN("MINGGUAN"), BULANAN("BULANAN") }

/** Skala prioritas (ACTIVITY_PRIORITY_OPTIONS). */
enum class SkalaPrioritas(val kode: String, val label: String) {
    SEMUA("ALL", "Semua prioritas"),
    KRITIS("KRITIS", "Kritis"),
    TINGGI("TINGGI", "Tinggi"),
    SEDANG("SEDANG", "Sedang"),
    RENDAH("RENDAH", "Rendah"),
}

/** PT ini tidak mencatat aktivitas apa pun pada periode (padanan `quiet` web). */
fun ptSepi(pt: AktivitasPtDto): Boolean {
    val s = pt.stats
    return s.tasks == 0 && s.dailyReports == 0 && s.weeklyItems == 0 && pt.projects.all { it.progressReport == null }
}

/** Ambil bagian satu PT dari jawaban aktivitas (rute mengirim semua PT dalam cakupan). */
fun aktivitasPt(jawaban: AktivitasEntitasResponse, idPt: String): AktivitasPtDto? =
    jawaban.entities.firstOrNull { it.id == idPt }
