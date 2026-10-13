// Logika murni peta panas kepatuhan 10 hari kerja (BUG-02) — port
// ComplianceHeatmapCard src/components/admin/compliance.tsx. Sumber data sama
// dengan modul Kepatuhan: GET /api/admin/compliance (days + divisions[].history).
package id.co.monitorkarya.app.ui.admin

import id.co.monitorkarya.app.ui.kepatuhan.MejaKepatuhan
import id.co.monitorkarya.app.ui.kepatuhan.cobaIso
import java.time.DayOfWeek
import java.time.ZoneId
import kotlin.math.roundToInt

/** Satu baris peta panas = satu divisi. */
data class BarisPetaPanas(
    val divisiId: String,
    val nama: String,
    /** Label 3 huruf untuk ponsel (short3 web). */
    val label: String,
    /** Persen per kolom (panjang = jumlah kolom); null = tidak ada yang wajib lapor/libur. */
    val nilai: List<Int?>,
)

/** Peta panas siap gambar. */
data class PetaPanas(
    /** Label kolom "Sen 6" (lama → baru). */
    val kolom: List<String>,
    val baris: List<BarisPetaPanas>,
    /** Rata-rata semua sel berisi; null bila tidak ada. */
    val rataRata: Int?,
)

private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private fun hariPendek(h: DayOfWeek): String = when (h) {
    DayOfWeek.MONDAY -> "Sen"
    DayOfWeek.TUESDAY -> "Sel"
    DayOfWeek.WEDNESDAY -> "Rab"
    DayOfWeek.THURSDAY -> "Kam"
    DayOfWeek.FRIDAY -> "Jum"
    DayOfWeek.SATURDAY -> "Sab"
    DayOfWeek.SUNDAY -> "Min"
}

/** "Sen 6" dari ISO tengah malam WIB (dayLabel web); "-" bila rusak. */
fun labelHariKolom(iso: String): String {
    val t = cobaIso(iso)?.atZone(ZONA_WIB) ?: return "-"
    return "${hariPendek(t.dayOfWeek)} ${t.dayOfMonth}"
}

/**
 * Label 3 huruf (short3 web): dua kata atau lebih → inisial (maks 3, kapital),
 * satu kata → tiga huruf pertama.
 */
fun singkat3(nama: String): String {
    val kata = nama.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (kata.size >= 2) return kata.take(3).joinToString("") { it.first().uppercaseChar().toString() }
    return (kata.firstOrNull() ?: nama).take(3)
}

/** Pembulatan .5 ke atas (Math.round JS). */
private fun bulat(x: Double): Int = x.roundToInt()

/**
 * Susun peta panas: kolom dari `days`, baris = divisi yang punya minimal satu
 * sel berisi (sama dengan web). Riwayat yang lebih pendek/panjang dari jumlah
 * kolom dipadankan dengan null / dipotong agar kisi tetap persegi.
 */
fun susunPetaPanas(meja: MejaKepatuhan): PetaPanas {
    val jumlahKolom = meja.hari.size
    val baris = meja.divisi
        .filter { d -> d.riwayat.any { it != null } }
        .map { d ->
            BarisPetaPanas(
                divisiId = d.id,
                nama = d.nama,
                label = singkat3(d.nama),
                nilai = List(jumlahKolom) { i -> d.riwayat.getOrNull(i)?.coerceIn(0, 100) },
            )
        }
        .filter { b -> b.nilai.any { it != null } }
    val semua = baris.flatMap { b -> b.nilai.filterNotNull() }
    return PetaPanas(
        kolom = meja.hari.map(::labelHariKolom),
        baris = baris,
        rataRata = if (semua.isEmpty()) null else bulat(semua.average()),
    )
}

/** Fraksi campuran warna sel (color-mix web: 18% + 0,82 × persen); 0 = isi kosong. */
fun fraksiSel(persen: Int): Float = if (persen <= 0) 0f else (18 + (persen.coerceIn(0, 100) * 0.82).roundToInt()) / 100f

/** Subjudul kartu: "Persen orang yang lapor per divisi, 10 hari kerja · rata-rata 87%". */
fun subjudulPetaPanas(p: PetaPanas): String =
    "Persen orang yang lapor per divisi, ${p.kolom.size} hari kerja" +
        (p.rataRata?.let { " · rata-rata $it%" } ?: "")

/** Deskripsi pembaca layar satu baris: "Divisi Teknologi: Sen 6 80%, Sel 7 libur, …". */
fun deskripsiBaris(p: PetaPanas, b: BarisPetaPanas): String =
    "Divisi ${b.nama}: " + b.nilai.mapIndexed { i, v ->
        "${p.kolom.getOrElse(i) { "${i + 1}" }} ${v?.let { "$it%" } ?: "libur"}"
    }.joinToString(", ")
