// Ringkasan peran pelaksana (B1) — paritas web src/components/views/
// role-dashboards.tsx (PicDashboard "Hari ini" & KadivDashboard) dari GET
// /api/my-dashboard (src/app/api/my-dashboard/route.ts, cabang PIC/KADIV).
// :app tidak memasang plugin kotlinx-serialization, jadi respons dibaca
// sebagai JsonObject lalu diurai defensif; kalimat jawaban/pendukung dan KPI
// disusun fungsi murni di sini (DasborPelaksanaTest).
package id.co.monitorkarya.app.ui.ringkasan

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.app.ui.mejakadiv.jumlahBuktiNyata
import id.co.monitorkarya.app.ui.mejakadiv.perluBukti
import id.co.monitorkarya.app.ui.mejakadiv.teksTenggatSerah
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import javax.inject.Singleton
import kotlin.math.ceil
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.GET

interface DasborPeranApi {
    @GET("api/my-dashboard")
    suspend fun dasbor(): Response<JsonObject>
}

@Module
@InstallIn(SingletonComponent::class)
object DasborPeranModule {
    @Provides
    @Singleton
    fun dasborPeranApi(retrofit: Retrofit): DasborPeranApi = retrofit.create(DasborPeranApi::class.java)
}

// ------------------------------------------------------------------
// Model
// ------------------------------------------------------------------

data class HitungMundur(val jam: Int, val menit: Int, val lewat: Boolean)

data class RiwayatHarian(
    val tanggal: String,
    val status: String,
    val progres: Int,
    val terkirim: Boolean,
    val diteruskan: Boolean,
    val terlambat: Boolean,
)

data class LaporanTerakhir(val tanggal: String, val capaian: String, val kendala: String?, val tindakLanjut: String?)

data class ProyekPic(
    val id: String,
    val kode: String,
    val nama: String,
    val fase: String,
    val tenggat: String?,
    /** on | risk | late | done | neutral. */
    val statusTurunan: String,
    val alasan: String?,
    val progres: Int,
    val terakhir: LaporanTerakhir?,
    val riwayat: List<RiwayatHarian>,
    val entitas: String,
    val buktiHariIni: Int,
    val terkirim: Boolean,
    val diteruskan: Boolean,
)

data class DasborPic(
    /** null = mode 24/7 (tanpa jam batas). */
    val hitung: HitungMundur?,
    val kunciIso: String,
    val jumlahProyek: Int,
    val terkirim: Int,
    val tepatWaktuPct: Double,
    val proyek: List<ProyekPic>,
)

data class ButirKadiv(
    val id: String,
    val uraian: String,
    val pic: String,
    val target: String?,
    val progres: Int,
    val status: String,
    val bukti: Int,
)

data class DivisiKadiv(
    val id: String,
    val nama: String,
    val statusHeader: String,
    val diserahkan: Boolean,
    val disetujui: Boolean,
    val diteruskan: Boolean,
)

data class DasborKadiv(
    val isoWeek: Int,
    val tenggatSerah: String,
    val sisaJam: Int,
    val tenggatLewat: Boolean,
    val jumlahButir: Int,
    val selesai: Int,
    val terkendala: Int,
    val tanpaBukti: Int,
    val perluEskalasi: Int,
    val perStatus: Map<String, Int>,
    val riwayat: List<Triple<String, Int, Int>>,
    val butir: List<ButirKadiv>,
    val divisi: List<DivisiKadiv>,
)

sealed interface DasborPeran {
    data class Pic(val data: DasborPic) : DasborPeran
    data class Kadiv(val data: DasborKadiv) : DasborPeran

    /** kind lain (ADMIN/OVERSIGHT) — layar memakai ringkasan umum. */
    data object Lain : DasborPeran
}

// ------------------------------------------------------------------
// Urai JSON
// ------------------------------------------------------------------

private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray).orEmpty()
private fun JsonObject.teks(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
private fun JsonObject.angka(k: String): Int = (this[k] as? JsonPrimitive)?.let { it.intOrNull ?: it.doubleOrNull?.roundToInt() } ?: 0
private fun JsonObject.desimal(k: String): Double = (this[k] as? JsonPrimitive)?.doubleOrNull ?: 0.0
private fun JsonObject.benar(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull ?: false

fun uraiDasborPeran(o: JsonObject): DasborPeran = when (o.teks("kind")) {
    "PIC" -> DasborPeran.Pic(uraiPic(o))
    "KADIV" -> DasborPeran.Kadiv(uraiKadiv(o))
    else -> DasborPeran.Lain
}

private fun uraiPic(o: JsonObject): DasborPic {
    val s = o["summary"].obj()
    return DasborPic(
        hitung = o["countdown"].obj()?.let { HitungMundur(it.angka("hours"), it.angka("minutes"), it.benar("passed")) },
        kunciIso = o.teks("lockAt").orEmpty(),
        jumlahProyek = s?.angka("projects") ?: 0,
        terkirim = s?.angka("submitted") ?: 0,
        tepatWaktuPct = s?.desimal("onTimePct") ?: 0.0,
        proyek = o["projects"].arr().mapNotNull { e ->
            val p = e.obj() ?: return@mapNotNull null
            ProyekPic(
                id = p.teks("id") ?: return@mapNotNull null,
                kode = p.teks("code").orEmpty(),
                nama = p.teks("name").orEmpty(),
                fase = p.teks("phase").orEmpty(),
                tenggat = p.teks("targetEndDate"),
                statusTurunan = p.teks("derivedStatus") ?: "neutral",
                alasan = p.teks("reason"),
                progres = p.angka("latestProgress"),
                terakhir = p["latest"].obj()?.let {
                    LaporanTerakhir(
                        tanggal = it.teks("reportDate").orEmpty(),
                        capaian = it.teks("achievementToday").orEmpty(),
                        kendala = it.teks("obstacle"),
                        tindakLanjut = it.teks("followUp"),
                    )
                },
                riwayat = p["history"].arr().mapNotNull { h ->
                    h.obj()?.let {
                        RiwayatHarian(
                            tanggal = it.teks("reportDate").orEmpty(),
                            status = it.teks("status").orEmpty(),
                            progres = it.angka("progressPct"),
                            terkirim = it.benar("submitted"),
                            diteruskan = it.benar("forwarded"),
                            terlambat = it.benar("isLate"),
                        )
                    }
                },
                entitas = p.teks("entityName").orEmpty(),
                buktiHariIni = p.angka("evidenceCount"),
                terkirim = p.benar("submitted"),
                diteruskan = p.benar("forwarded"),
            )
        },
    )
}

/**
 * E2E-R2 N5 / E2E-1 #9: samakan hitungan bukti Ringkasan dengan Meja kerja dan
 * Capaian. my-dashboard menghitung dari cache `evidenceCount` (bisa basi);
 * Meja kerja/Capaian memakai baris bukti nyata dari GET weekly-input. Bila
 * papan weekly-input tersedia, "bukti kurang" dan bukti per butir diganti
 * hitungan baris nyata (aturan perluBukti yang sama dengan Meja kerja).
 */
internal fun DasborKadiv.denganBuktiNyata(papan: WeeklyInputResponse): DasborKadiv {
    val semua = papan.divisions.flatMap { it.report?.items.orEmpty() }
    if (semua.isEmpty()) return this
    val nyata = semua.associate { it.id to jumlahBuktiNyata(it) }
    return copy(
        tanpaBukti = semua.filter { it.status != "NA" }.count(::perluBukti),
        butir = butir.map { b -> nyata[b.id]?.let { b.copy(bukti = it) } ?: b },
    )
}

/** Jumlah butir yang dihitung: summary.items dikurangi butir N/A (byStatus.NA). */
internal fun butirDihitungKadiv(total: Int, perStatus: Map<String, Int>): Int =
    (total - (perStatus["NA"] ?: 0)).coerceAtLeast(0)

private fun uraiKadiv(o: JsonObject): DasborKadiv {
    val w = o["week"].obj()
    val s = o["summary"].obj()
    val perStatus = o["byStatus"].obj()?.mapValues { (_, v) -> (v as? JsonPrimitive)?.intOrNull ?: 0 }.orEmpty()
    return DasborKadiv(
        isoWeek = w?.angka("isoWeek") ?: 0,
        tenggatSerah = w?.teks("handoverBy").orEmpty(),
        sisaJam = o.angka("handoverHoursLeft"),
        tenggatLewat = o.benar("handoverPassed"),
        // E2E-1 #9: N/A tidak dihitung (sama dengan Meja kerja, Capaian, dan riwayat server).
        jumlahButir = butirDihitungKadiv(s?.angka("items") ?: 0, perStatus),
        selesai = s?.angka("done") ?: 0,
        terkendala = s?.angka("blocked") ?: 0,
        tanpaBukti = s?.angka("missingEvidence") ?: 0,
        perluEskalasi = s?.angka("needsEscalation") ?: 0,
        perStatus = perStatus,
        riwayat = o["history"].arr().mapNotNull { h -> h.obj()?.let { Triple(it.teks("label").orEmpty(), it.angka("done"), it.angka("total")) } },
        butir = o["items"].arr().mapNotNull { e ->
            val i = e.obj() ?: return@mapNotNull null
            ButirKadiv(
                id = i.teks("id") ?: return@mapNotNull null,
                uraian = i.teks("workItem").orEmpty(),
                pic = i.teks("picName").orEmpty(),
                target = i.teks("targetDate"),
                progres = i.angka("progressPct"),
                status = i.teks("status").orEmpty(),
                bukti = i.angka("evidenceCount"),
            )
        },
        divisi = o["divisions"].arr().mapNotNull { e ->
            val d = e.obj() ?: return@mapNotNull null
            DivisiKadiv(
                id = d.teks("id") ?: return@mapNotNull null,
                nama = d.teks("name").orEmpty(),
                statusHeader = d.teks("statusHeader") ?: "DRAFT",
                diserahkan = d.benar("submitted"),
                disetujui = d.benar("approved"),
                diteruskan = d.benar("forwarded"),
            )
        },
    )
}

// ------------------------------------------------------------------
// Kosakata & kalimat (fungsi murni)
// ------------------------------------------------------------------

private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val BULAN_PENDEK = listOf("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")
private const val HARI_MS = 86_400_000L

internal fun wibDari(iso: String?): ZonedDateTime? = iso?.takeIf { it.isNotBlank() }?.let {
    runCatching { Instant.parse(it).atZone(WIB) }.getOrNull()
        ?: runCatching { LocalDate.parse(it.take(10)).atStartOfDay(WIB) }.getOrNull()
}

/** "5 Okt" (formatDateShort). */
internal fun tglPendek(iso: String?): String = wibDari(iso)?.let { "${it.dayOfMonth} ${BULAN_PENDEK[it.monthValue - 1]}" } ?: "-"

/** "14.20" WIB. */
internal fun jamPendek(iso: String?): String = wibDari(iso)?.let { "%02d.%02d".format(it.hour, it.minute) } ?: "-"

/** derivedStatus server → MkStatus. */
internal fun mkStatusTurunan(s: String?): MkStatus = when (s?.lowercase()) {
    "on" -> MkStatus.ON
    "risk" -> MkStatus.RISK
    "late" -> MkStatus.LATE
    "done" -> MkStatus.DONE
    else -> MkStatus.NEUTRAL
}

/** DAILY_STATUS_META + DAILY status-badges.tsx. */
internal fun lencanaHarian(status: String): Pair<MkStatus, String> = when (status) {
    "SELESAI" -> MkStatus.DONE to "Selesai"
    "ON_PROGRESS" -> MkStatus.ON to "Berjalan"
    "TERKENDALA" -> MkStatus.RISK to "Terkendala"
    "MENUNGGU_KEPUTUSAN" -> MkStatus.INFO to "Menunggu keputusan"
    "TIDAK_ADA_PERUBAHAN" -> MkStatus.NEUTRAL to "Tidak ada perubahan"
    else -> MkStatus.NEUTRAL to status.ifBlank { "-" }
}

/**
 * deadlineText web. [hitung] null = 24/7 (perbaikan crash countdown 24/7,
 * 578e998): tidak ada jam batas.
 */
internal fun teksTenggatHarian(hitung: HitungMundur?, kunciIso: String, sekarangMs: Long): String {
    if (hitung == null) return "Tersedia 24/7 · kirim kapan saja"
    val tengahMalam = jamPendek(kunciIso) == "00.00"
    if (tengahMalam && hitung.lewat) return "Pengisian laporan sedang ditutup"
    val label = if (tengahMalam) "24.00" else jamPendek(kunciIso)
    if (hitung.lewat) {
        val kunciMs = wibDari(kunciIso)?.toInstant()?.toEpochMilli() ?: sekarangMs
        val menit = maxOf(0L, (sekarangMs - kunciMs) / 60_000)
        return when {
            menit < 60 -> "Tenggat $label · lewat $menit menit"
            menit < 24 * 60 -> "Tenggat $label · lewat ${menit / 60} jam ${menit % 60} menit"
            else -> "Tenggat $label sudah lewat"
        }
    }
    return if (hitung.jam > 0) "Tenggat $label · ${hitung.jam} jam ${hitung.menit} menit lagi" else "Tenggat $label · ${hitung.menit} menit lagi"
}

/** Sisa hari ke tenggat proyek (pembulatan ke atas); null bila tanpa tenggat. */
internal fun sisaHari(iso: String?, sekarangMs: Long): Int? =
    wibDari(iso)?.toInstant()?.toEpochMilli()?.let { ceil((it - sekarangMs).toDouble() / HARI_MS).toInt() }

/** Kalimat jawaban + pendukung layar "Hari ini" PIC. */
internal fun kalimatPic(d: DasborPic, p: ProyekPic, sekarangMs: Long): Pair<String, String> {
    val baris = when {
        p.diteruskan -> "Laporan hari ini sudah diteruskan ke holding."
        p.terkirim -> "Laporan hari ini sudah terkirim ke Admin PT."
        else -> "Laporan hari ini belum dikirim. ${teksTenggatHarian(d.hitung, d.kunciIso, sekarangMs)}."
    }
    val pendukung = listOfNotNull(p.alasan?.takeIf { it.isNotBlank() }?.let { "$it." }, baris).joinToString(" ")
    return "${p.nama} ${p.progres}% selesai." to pendukung
}

/** Lencana kepala layar PIC. */
internal fun lencanaHariIni(d: DasborPic, p: ProyekPic): Pair<MkStatus, String> = when {
    p.terkirim -> MkStatus.DONE to "Laporan hari ini · ${if (p.diteruskan) "Diteruskan" else "Terkirim"}"
    d.hitung?.lewat == true -> MkStatus.LATE to "Laporan hari ini · Belum dikirim"
    else -> MkStatus.RISK to "Laporan hari ini · Belum dikirim"
}

private fun persen(a: Int, b: Int): Int = if (b > 0) (a * 100.0 / b).roundToInt() else 0

/** Label divisi kepala layar Kadiv (divName web). */
internal fun namaDivisiKadiv(d: DasborKadiv): String = when (d.divisi.size) {
    0 -> "Divisi Anda"
    1 -> "Divisi ${d.divisi.first().nama}"
    else -> "${d.divisi.size} divisi Anda"
}

/** "Kamis 17.00" tenggat serah. */
internal fun labelSerah(d: DasborKadiv): String = teksTenggatSerah(d.tenggatSerah)

/** Kalimat jawaban + pendukung KadivDashboard (mode tanpa data tim). */
internal fun kalimatKadiv(d: DasborKadiv): Pair<String, String> {
    val nama = namaDivisiKadiv(d)
    val jawaban = if (d.jumlahButir == 0) {
        "$nama belum mengisi capaian minggu ini."
    } else {
        "$nama menyelesaikan ${d.selesai} dari ${d.jumlahButir} item minggu ini."
    }
    val pendukung = listOfNotNull(
        if (d.terkendala > 0) "${d.terkendala} item terkendala." else "Tidak ada item terkendala.",
        d.tanpaBukti.takeIf { it > 0 }?.let { "$it item belum punya bukti." },
        if (d.tenggatLewat) "Tenggat penyerahan sudah lewat." else "Serahkan ke Admin PT paling lambat ${labelSerah(d)}.",
    ).joinToString(" ")
    return jawaban to pendukung
}

/** Persentase butir selesai. */
internal fun persenSelesai(d: DasborKadiv): Int = persen(d.selesai, d.jumlahButir)

/** Alur penyerahan (judul, sub, status) — flow KadivDashboard. */
internal fun alurPenyerahan(d: DasborKadiv): List<Triple<String, String, MkStatus>> {
    val adaSerah = d.divisi.any { it.diserahkan }
    val semuaSetuju = d.divisi.isNotEmpty() && d.divisi.all { it.disetujui }
    val semuaTerus = d.divisi.isNotEmpty() && d.divisi.all { it.diteruskan }
    return listOf(
        Triple("Isi capaian", "${d.jumlahButir} item", if (d.jumlahButir > 0) MkStatus.DONE else MkStatus.INFO),
        Triple(
            "Serahkan",
            if (!adaSerah && d.tanpaBukti > 0) "${d.tanpaBukti} item tanpa bukti" else "paling lambat ${labelSerah(d)}",
            when {
                adaSerah -> MkStatus.DONE
                d.tanpaBukti > 0 -> MkStatus.LATE
                d.jumlahButir > 0 -> MkStatus.INFO
                else -> MkStatus.NEUTRAL
            },
        ),
        Triple("Setujui", "oleh Anda", if (semuaSetuju) MkStatus.DONE else if (adaSerah) MkStatus.INFO else MkStatus.NEUTRAL),
        Triple("Diteruskan", "Admin PT ke holding", if (semuaTerus) MkStatus.DONE else if (semuaSetuju) MkStatus.INFO else MkStatus.NEUTRAL),
    )
}

/** ITEM_FILTERS KadivDashboard (null = semua). */
internal val SARINGAN_BUTIR_KADIV: List<Pair<String?, String>> = listOf(
    null to "Semua",
    "TERKENDALA" to "Terkendala",
    "ON_PROGRESS" to "Berjalan",
    "BELUM_MULAI" to "Belum mulai",
    "SELESAI" to "Selesai",
)
