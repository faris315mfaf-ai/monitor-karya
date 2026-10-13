// Logika murni panel "Aturan pelaporan" Statistik Admin PT (BUG-02) — port
// src/components/admin/report-settings-card.tsx terhadap rute
// src/app/api/admin/report-settings/route.ts. Tanpa Android/Compose agar bisa
// diuji JVM (AturanPelaporanTest).
package id.co.monitorkarya.app.ui.admin

import id.co.monitorkarya.app.ui.kepatuhan.AturanTenggat
import id.co.monitorkarya.app.ui.kepatuhan.labelJamWib
import id.co.monitorkarya.core.network.dto.AturanPelaporanDto
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Aturan pelaporan satu PT dalam bentuk tampilan. */
data class AturanPelaporan(
    /** Jam batas harian WIB 0..23; null = 24/7 (tanpa jam batas). */
    val jamHarian: Int?,
    /** Hari ISO 1 (Senin)..7 (Minggu), terurut; kosong = setiap hari. */
    val hariKerja: List<Int>,
    val harianBuka: Boolean,
    /** Jam batas mingguan WIB 0..23; null = tanpa jam batas. */
    val jamMingguan: Int?,
    val mingguanBuka: Boolean,
    /** PT belum punya baris aturan — server memakai bawaan (17.00, Senin–Jumat). */
    val bawaan: Boolean = false,
)

/** Cermin DEFAULT_SETTINGS server (src/lib/report-settings.ts) bila PT belum mengatur. */
val ATURAN_BAWAAN_SERVER = AturanPelaporan(
    jamHarian = 17,
    hariKerja = listOf(1, 2, 3, 4, 5),
    harianBuka = true,
    jamMingguan = 17,
    mingguanBuka = true,
    bawaan = true,
)

/** Pilihan jam cepat (sama dengan kartu web). */
val PILIHAN_JAM_HARIAN = listOf(9, 12, 15, 17, 20, 23)
val PILIHAN_JAM_MINGGUAN = listOf(15, 17)

/** Nama hari ISO 1..7. */
val NAMA_HARI_ISO = mapOf(
    1 to "Senin", 2 to "Selasa", 3 to "Rabu", 4 to "Kamis", 5 to "Jumat", 6 to "Sabtu", 7 to "Minggu",
)

/** DTO → tampilan; `settings: null` = bawaan server. Nilai ganjil dijepit seperti server. */
fun petaAturan(dto: AturanPelaporanDto?): AturanPelaporan {
    if (dto == null) return ATURAN_BAWAAN_SERVER
    return AturanPelaporan(
        jamHarian = dto.dailyCutoffHour?.coerceIn(0, 23),
        hariKerja = dto.workingDays.filter { it in 1..7 }.distinct().sorted(),
        harianBuka = dto.dailyOpen,
        jamMingguan = dto.weeklyCutoffHour?.coerceIn(0, 23),
        mingguanBuka = dto.weeklyOpen,
        bawaan = false,
    )
}

/** Ringkas untuk teks tenggat layar Kepatuhan (BUG-11). */
fun AturanPelaporan.keTenggat(): AturanTenggat = AturanTenggat(
    jamHarian = jamHarian,
    harianBuka = harianBuka,
    jamMingguan = jamMingguan,
    mingguanBuka = mingguanBuka,
)

/** "09.00" — label chip jam. */
fun labelJam(jam: Int): String = "${jam.toString().padStart(2, '0')}.00"

/** Subjudul kartu: "Mode saat ini: 24/7 · Terbuka". */
fun ringkasanMode(a: AturanPelaporan): String {
    val mode = a.jamHarian?.let { "Batasi ${labelJamWib(it)}" } ?: "24/7"
    return "Mode saat ini: $mode · ${if (a.harianBuka) "Terbuka" else "Ditutup"}"
}

/** Teks lencana jam batas harian. */
fun teksJamHarian(a: AturanPelaporan): String =
    a.jamHarian?.let { "Batasi sampai ${labelJamWib(it)}" } ?: "24/7 tanpa batas"

/** Ringkas hari wajib lapor: "Setiap hari" / "Senin–Jumat" / "Senin, Rabu". */
fun ringkasanHari(hari: List<Int>): String {
    val h = hari.filter { it in 1..7 }.distinct().sorted()
    if (h.isEmpty() || h.size == 7) return "Setiap hari"
    val beruntun = h.zipWithNext().all { (a, b) -> b == a + 1 }
    return if (beruntun && h.size >= 3) {
        "${NAMA_HARI_ISO[h.first()]}–${NAMA_HARI_ISO[h.last()]}"
    } else {
        h.joinToString(", ") { NAMA_HARI_ISO.getValue(it) }
    }
}

/**
 * Tekan chip hari (sama dengan web): hari terpilih dilepas, lainnya ditambah;
 * hasil terurut. Melepas hari terakhir menghasilkan [] = setiap hari.
 */
fun alihHari(hari: List<Int>, d: Int): List<Int> =
    if (d in hari) hari.filter { it != d } else (hari + d).distinct().sorted()

/** Hasil membaca isian jam kustom. */
sealed interface HasilJam {
    /** Jam sah 0..23; null = 24/7 (tanpa jam batas). */
    data class Sah(val jam: Int?) : HasilJam
    data class Galat(val pesan: String) : HasilJam
}

/**
 * Isian jam kustom: "17", "17.00", "17:00", "9" → jam; "24/7"/"tanpa batas"
 * → null (tanpa jam batas). Menit harus 00 karena server menyimpan jam bulat.
 */
fun bacaJam(teks: String): HasilJam {
    val t = teks.trim().lowercase()
    if (t.isEmpty()) return HasilJam.Galat("Isi jam batas 0 sampai 23.")
    if (t == "24/7" || t == "tanpa batas") return HasilJam.Sah(null)
    val cocok = Regex("^(\\d{1,2})(?:[.:](\\d{2}))?$").matchEntire(t)
        ?: return HasilJam.Galat("Tulis jam sebagai angka, mis. 17 atau 17.00.")
    val jam = cocok.groupValues[1].toInt()
    val menit = cocok.groupValues[2]
    if (menit.isNotEmpty() && menit != "00") return HasilJam.Galat("Jam batas hanya jam bulat, mis. 17.00.")
    if (jam !in 0..23) return HasilJam.Galat("Jam batas harus 0 sampai 23.")
    return HasilJam.Sah(jam)
}

/** Satu perubahan aturan — badan PUT hanya membawa field yang berubah. */
sealed interface PerubahanAturan {
    data class BukaHarian(val buka: Boolean) : PerubahanAturan
    data class JamHarian(val jam: Int?) : PerubahanAturan
    data class HariKerja(val hari: List<Int>) : PerubahanAturan
    data class BukaMingguan(val buka: Boolean) : PerubahanAturan
    data class JamMingguan(val jam: Int?) : PerubahanAturan
}

private fun jamJson(jam: Int?) = if (jam == null) JsonNull else JsonPrimitive(jam)

/**
 * Badan PUT `{ entityId, <field> }`. `null` dikirim EKSPLISIT untuk 24/7
 * (field yang tidak ada = jangan diubah menurut rute server).
 */
fun badanSimpan(entityId: String, p: PerubahanAturan): JsonObject {
    val isi = when (p) {
        is PerubahanAturan.BukaHarian -> "dailyOpen" to JsonPrimitive(p.buka)
        is PerubahanAturan.JamHarian -> "dailyCutoffHour" to jamJson(p.jam)
        is PerubahanAturan.HariKerja -> "workingDays" to JsonArray(p.hari.distinct().sorted().map { JsonPrimitive(it) })
        is PerubahanAturan.BukaMingguan -> "weeklyOpen" to JsonPrimitive(p.buka)
        is PerubahanAturan.JamMingguan -> "weeklyCutoffHour" to jamJson(p.jam)
    }
    return JsonObject(mapOf("entityId" to JsonPrimitive(entityId), isi))
}

/** Terapkan perubahan secara lokal (cadangan bila jawaban server tanpa `settings`). */
fun AturanPelaporan.terapkan(p: PerubahanAturan): AturanPelaporan = when (p) {
    is PerubahanAturan.BukaHarian -> copy(harianBuka = p.buka, bawaan = false)
    is PerubahanAturan.JamHarian -> copy(jamHarian = p.jam, bawaan = false)
    is PerubahanAturan.HariKerja -> copy(hariKerja = p.hari.distinct().sorted(), bawaan = false)
    is PerubahanAturan.BukaMingguan -> copy(mingguanBuka = p.buka, bawaan = false)
    is PerubahanAturan.JamMingguan -> copy(jamMingguan = p.jam, bawaan = false)
}

/** Pesan sukses spesifik per perubahan (snackbar). */
fun pesanTersimpan(p: PerubahanAturan): String = when (p) {
    is PerubahanAturan.BukaHarian ->
        if (p.buka) "Pengisian laporan harian dibuka." else "Pengisian laporan harian ditutup."
    is PerubahanAturan.JamHarian ->
        p.jam?.let { "Jam batas harian disimpan: ${labelJamWib(it)}." } ?: "Laporan harian kini 24/7 tanpa jam batas."
    is PerubahanAturan.HariKerja -> "Hari wajib lapor disimpan: ${ringkasanHari(p.hari)}."
    is PerubahanAturan.BukaMingguan ->
        if (p.buka) "Capaian mingguan dibuka." else "Capaian mingguan ditutup."
    is PerubahanAturan.JamMingguan ->
        p.jam?.let { "Jam batas mingguan disimpan: ${labelJamWib(it)}." } ?: "Capaian mingguan kini tanpa jam batas."
}
