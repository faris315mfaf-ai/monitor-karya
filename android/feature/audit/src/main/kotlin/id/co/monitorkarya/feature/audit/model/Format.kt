// Format tampilan modul audit — semua waktu dalam WIB (Wib.ZONA), angka gaya
// Indonesia (titik ribuan), dan JSON before/after sebagai TEKS polos (tidak
// pernah dirender sebagai HTML/markup).
package id.co.monitorkarya.feature.audit.model

import id.co.monitorkarya.core.domain.time.Wib
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val LOKAL_ID: Locale = Locale.forLanguageTag("id-ID")
private val POLA_WAKTU = DateTimeFormatter.ofPattern("d MMM yyyy, HH.mm", LOKAL_ID)
private val POLA_TANGGAL = DateTimeFormatter.ofPattern("d MMM yyyy", LOKAL_ID)
private val POLA_HARI = DateTimeFormatter.ofPattern("EEEE, d MMM HH.mm", LOKAL_ID)

/** Batas teks satu sisi before/after agar Sheet tetap ringan di ponsel. */
const val BATAS_TEKS_JSON = 20_000

@OptIn(ExperimentalSerializationApi::class)
private val jsonRapi = Json {
    prettyPrint = true
    prettyPrintIndent = "  "
}

fun keInstant(iso: String?): Instant? =
    iso?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "13 Okt 2026, 14.05 WIB"; kosong bila tidak terbaca. */
fun waktuWib(iso: String?): String =
    keInstant(iso)?.let { POLA_WAKTU.format(it.atZone(Wib.ZONA)) + " WIB" } ?: "—"

/** "13 Okt 2026" menurut kalender WIB. */
fun tanggalWib(iso: String?): String =
    keInstant(iso)?.let { POLA_TANGGAL.format(it.atZone(Wib.ZONA)) } ?: "—"

/** "Kamis, 16 Okt 17.00 WIB" — tenggat penguncian. */
fun hariJamWib(iso: String?): String =
    keInstant(iso)?.let { POLA_HARI.format(it.atZone(Wib.ZONA)) + " WIB" } ?: "—"

/** Tanggal saringan "13 Okt 2026" dari LocalDate kalender WIB. */
fun labelTanggal(t: LocalDate): String = POLA_TANGGAL.format(t)

/** formatRelative web, huruf kecil: "baru saja", "5 menit lalu", "kemarin", … */
fun relatif(iso: String?, sekarang: Instant = Instant.now()): String {
    val t = keInstant(iso) ?: return "—"
    val d = Duration.between(t, sekarang)
    val menit = d.toMinutes()
    return when {
        menit < 1 -> "baru saja"
        menit < 60 -> "$menit menit lalu"
        menit < 24 * 60 -> "${d.toHours()} jam lalu"
        else -> {
            val hari = Wib.dariEpochMillis(sekarang.toEpochMilli()).toEpochDay() -
                Wib.dariEpochMillis(t.toEpochMilli()).toEpochDay()
            when {
                hari <= 1L -> "kemarin"
                hari < 7L -> "$hari hari lalu"
                else -> tanggalWib(iso)
            }
        }
    }
}

/** formatNumber web: 1234 → "1.234". */
fun angka(n: Number): String = NumberFormat.getIntegerInstance(LOKAL_ID).format(n)

/**
 * safeStringify web: null/JsonNull → ""; string yang berisi JSON diurai lalu
 * dirapikan; selain itu JSON dirapikan dua spasi. Hasil SELALU teks polos dan
 * dipotong di [batas] karakter dengan elipsis.
 */
fun teksJson(nilai: JsonElement?, batas: Int = BATAS_TEKS_JSON): String {
    val mentah = when (nilai) {
        null, JsonNull -> ""
        is JsonPrimitive -> if (nilai.isString) {
            val s = nilai.content
            // Hanya objek/larik yang dirapikan; pengurai kotlinx menerima literal
            // tanpa kutip, jadi teks biasa (mis. "<b>…") tetap apa adanya.
            runCatching { Json.parseToJsonElement(s) }.getOrNull()
                ?.takeIf { it is JsonObject || it is JsonArray }
                ?.let { jsonRapi.encodeToString(JsonElement.serializer(), it) }
                ?: s
        } else {
            nilai.toString()
        }
        else -> jsonRapi.encodeToString(JsonElement.serializer(), nilai)
    }
    return if (mentah.length > batas) mentah.take(batas) + "…" else mentah
}

/** Objek JSON dari nilai log (string berisi JSON ikut diurai); selain objek → null. */
private fun objekDari(nilai: JsonElement?): JsonObject? = when (nilai) {
    is JsonObject -> nilai
    is JsonPrimitive -> if (nilai.isString) {
        runCatching { Json.parseToJsonElement(nilai.content) as? JsonObject }.getOrNull()
    } else {
        null
    }
    else -> null
}

/**
 * Kolom yang berubah antara before dan after (keduanya objek): kunci yang
 * ditambah, dihapus, atau nilainya berbeda; urut abjad. Kosong bila salah
 * satu sisi bukan objek.
 */
fun kunciBerubah(sebelum: JsonElement?, sesudah: JsonElement?): List<String> {
    val a = objekDari(sebelum) ?: return emptyList()
    val b = objekDari(sesudah) ?: return emptyList()
    return (a.keys + b.keys).filter { a[it] != b[it] }.sorted()
}

private val NAMA_HARI = listOf("", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")

/** Hari kerja ISO (1 = Senin … 7 = Minggu); kosong = setiap hari. */
fun labelHariKerja(hari: List<Int>): String {
    val urut = hari.filter { it in 1..7 }.distinct().sorted()
    if (urut.isEmpty() || urut.size == 7) return "Setiap hari"
    val beruntun = urut.zipWithNext().all { (x, y) -> y == x + 1 }
    return if (beruntun && urut.size >= 3) {
        "${NAMA_HARI[urut.first()]}–${NAMA_HARI[urut.last()]}"
    } else {
        urut.joinToString(", ") { NAMA_HARI[it] }
    }
}

/** reminderSchedule (admin-meta.ts): "Setiap hari kerja 16.30" / "Jumat 13.00" / "2 hari tidak lapor · dicek 09.00". */
fun jadwalPengingat(kind: String, time: String, weekday: Int?, days: Number?): String {
    val t = time.replace(':', '.')
    if (kind == "ESKALASI_KADIV") {
        val hari = NumberFormat.getNumberInstance(LOKAL_ID).apply { maximumFractionDigits = 1 }.format(days ?: 2)
        return "$hari hari tidak lapor · dicek $t"
    }
    return if (weekday != null && weekday in 1..7) "${NAMA_HARI[weekday]} $t" else "Setiap hari kerja $t"
}
