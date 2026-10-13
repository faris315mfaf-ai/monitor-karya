// Fungsi murni meja kerja Kepala divisi (B1) — port
// src/components/work-desk/kadiv-desk.tsx: daftar periksa penyerahan (enam
// syarat), "Perlu tindakan", capaian hari ini, riwayat 6 minggu, kalimat
// jawaban + pendukung, dan tombol primer (Serahkan / Setujui / Buka papan).
// Diuji di MejaKadivLogikaTest terhadap bentuk JSON route sebenarnya.
package id.co.monitorkarya.app.ui.mejakadiv

import id.co.monitorkarya.core.network.dto.WeeklyDivisiDto
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.dto.WeeklyItemDto
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

internal val WIB_KADIV: ZoneId = ZoneId.of("Asia/Jakarta")

private val HARI = mapOf(
    DayOfWeek.MONDAY to "Senin", DayOfWeek.TUESDAY to "Selasa", DayOfWeek.WEDNESDAY to "Rabu",
    DayOfWeek.THURSDAY to "Kamis", DayOfWeek.FRIDAY to "Jumat", DayOfWeek.SATURDAY to "Sabtu", DayOfWeek.SUNDAY to "Minggu",
)
private val BULAN = listOf(
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
)

private fun wib(iso: String?): ZonedDateTime? = iso?.takeIf { it.isNotBlank() }?.let {
    runCatching { Instant.parse(it).atZone(WIB_KADIV) }.getOrNull()
        ?: runCatching { LocalDate.parse(it.take(10)).atStartOfDay(WIB_KADIV) }.getOrNull()
}

/** Kunci hari "YYYY-MM-DD" WIB dari ISO (wibKey web). */
internal fun kunciHariWib(iso: String?): String? = wib(iso)?.toLocalDate()?.toString()

/** "14.20" WIB (formatTime web). */
internal fun jamWibKadiv(iso: String?): String = wib(iso)?.let { "%02d.%02d".format(it.hour, it.minute) } ?: "-"

/** "Kamis 17.00" (handoverText web). */
internal fun teksTenggatSerah(iso: String?): String = wib(iso)?.let { "${HARI[it.dayOfWeek]} ${jamWibKadiv(iso)}" } ?: "-"

/** "Selasa, 13 Oktober". */
internal fun tanggalHariIni(iso: String?): String = wib(iso)?.let { "${HARI[it.dayOfWeek]}, ${it.dayOfMonth} ${BULAN[it.monthValue - 1]}" } ?: "-"

/** remainLong web: "2 hari 3 jam", "4 jam 10 menit", "25 menit", "kurang dari 1 menit". */
internal fun sisaPanjang(ms: Long): String {
    val menit = ms / 60_000
    if (menit < 1) return "kurang dari 1 menit"
    val jam = menit / 60
    return when {
        jam >= 24 -> "${jam / 24} hari ${jam % 24} jam"
        jam > 0 -> "$jam jam ${menit % 60} menit"
        else -> "$menit menit"
    }
}

/**
 * Jumlah bukti nyata butir: daftar `evidence` dari GET weekly-input (baris yang
 * divalidasi server saat serah/setujui). Cache evidenceCount bisa basi (E2E-1 #2:
 * "Semua item berbukti" padahal server menolak 422) — tidak dipakai. Rute
 * weekly-input selalu mengirim `evidence` (boleh kosong).
 */
internal fun jumlahBuktiNyata(i: WeeklyItemDto): Int = i.evidence.size

/** Butir berjalan/selesai tanpa bukti (needsEvidence web). */
internal fun perluBukti(i: WeeklyItemDto): Boolean = jumlahBuktiNyata(i) == 0 && i.status !in setOf("BELUM_MULAI", "NA")

/** Alasan butir muncul di "Perlu tindakan"; null bila tidak perlu. */
internal fun alasanTindakan(i: WeeklyItemDto): String? = when {
    i.status == "TERKENDALA" && i.obstacleFollowUp.isNullOrBlank() -> "Terkendala · tindak lanjut belum ditulis"
    i.status == "TERKENDALA" -> "Terkendala · ${i.obstacleFollowUp}"
    perluBukti(i) -> "Belum ada bukti"
    i.status == "BELUM_MULAI" -> "Belum mulai"
    else -> null
}

data class SyaratSerah(val ok: Boolean, val teks: String, val petunjuk: String)

data class ButirTindakan(val butir: WeeklyItemDto, val alasan: String)

/** Tombol primer kartu: satu per layar (aturan desain). */
enum class AksiPrimerKadiv { SERAHKAN, SETUJUI, BUKA_PAPAN }

data class SusunanMejaKadiv(
    val divisi: WeeklyDivisiDto,
    val butir: List<WeeklyItemDto>,
    val dihitung: Int,
    val selesai: Int,
    val terkendala: Int,
    val tanpaBukti: Int,
    val tanpaTindakLanjut: Int,
    val diserahkan: Boolean,
    val disetujui: Boolean,
    val diteruskan: Boolean,
    val terkunci: Boolean,
    val persen: Int,
    val syarat: List<SyaratSerah>,
    val terpenuhi: Int,
    val tindakan: List<ButirTindakan>,
    val hariIni: List<WeeklyItemDto>,
    val riwayat: List<RiwayatMingguKadivDto>,
    val tepatWaktuSebelumnya: Int,
    val tenggatLewat: Boolean,
    val jawaban: String,
    val pendukung: String,
    val aksiPrimer: AksiPrimerKadiv,
    /** Lencana kepala: "Capaian M41 · Diserahkan" / "· Belum diserahkan". */
    val lencanaKepala: String,
)

/**
 * Susun meja satu divisi. [sekarangMs] null = belum ada jam (render awal web);
 * kalimat tenggat dilewati.
 */
internal fun susunMejaKadiv(
    papan: WeeklyInputResponse,
    divisi: WeeklyDivisiDto,
    meja: MejaKadivDto,
    sekarangMs: Long?,
): SusunanMejaKadiv {
    val laporan = divisi.report
    val butir = laporan?.items.orEmpty()
    val dihitung = butir.filter { it.status != "NA" }
    val selesai = dihitung.count { it.status == "SELESAI" }
    val kendala = dihitung.filter { it.status == "TERKENDALA" }
    val tanpaBukti = dihitung.count(::perluBukti)
    val tanpaTl = kendala.count { it.obstacleFollowUp.isNullOrBlank() }
    // E2E-1 #9: status serah mengikuti statusHeader juga (sama dengan layar
    // Capaian) — laporan MENUNGGU_PERSETUJUAN tanpa submittedAt tetap "Diserahkan".
    val status = laporan?.statusHeader.orEmpty()
    val diserahkan = laporan?.submittedAt != null || status in setOf("MENUNGGU_PERSETUJUAN", "DISETUJUI", "TERKUNCI")
    val disetujui = laporan?.approvedAt != null || status == "DISETUJUI"
    val diteruskan = laporan?.forwardedAt != null
    val terkunci = papan.locked || (laporan?.isLocked ?: false)
    val kunciHariIni = kunciHariWib(meja.today)
    val hariIni = butir.filter { it.workDate != null && kunciHariWib(it.workDate) == kunciHariIni }
    val tindakan = butir.mapNotNull { b -> alasanTindakan(b)?.let { ButirTindakan(b, it) } }
    val riwayat = meja.divisions.firstOrNull { it.id == divisi.id }?.history.orEmpty()
    val tepatSebelumnya = riwayat.dropLast(1).count { it.onTime }
    val sisaMs = sekarangMs?.let { now -> wib(papan.week.handoverBy)?.toInstant()?.toEpochMilli()?.minus(now) }
    val lewat = sisaMs != null && sisaMs <= 0
    val persen = if (dihitung.isNotEmpty()) Math.round(selesai * 100f / dihitung.size) else 0

    val syarat = listOf(
        SyaratSerah(
            butir.isNotEmpty(),
            "Capaian minggu ini sudah diisi",
            if (butir.isNotEmpty()) "${butir.size} item di papan" else "Tambahkan item pertama",
        ),
        SyaratSerah(
            tanpaBukti == 0 && butir.isNotEmpty(),
            "Item berjalan dan selesai berbukti",
            if (tanpaBukti > 0) "$tanpaBukti item belum berbukti" else "Semua item berbukti",
        ),
        SyaratSerah(
            tanpaTl == 0 && butir.isNotEmpty(),
            "Kendala punya tindak lanjut",
            if (kendala.isNotEmpty()) "${kendala.size - tanpaTl} dari ${kendala.size} item terkendala" else "Tidak ada item terkendala",
        ),
        SyaratSerah(
            diserahkan,
            "Diserahkan ke Admin PT",
            when {
                diserahkan -> "Pukul ${jamWibKadiv(laporan?.submittedAt)}"
                lewat -> "Tenggat serah sudah lewat"
                else -> "Paling lambat ${teksTenggatSerah(papan.week.handoverBy)}"
            },
        ),
        SyaratSerah(
            disetujui,
            "Disetujui",
            when {
                disetujui -> "Pukul ${jamWibKadiv(laporan?.approvedAt)}"
                papan.canApprove -> "Oleh Anda setelah diserahkan"
                else -> "Oleh kepala divisi"
            },
        ),
        SyaratSerah(
            diteruskan,
            "Diteruskan ke holding",
            if (diteruskan) "Pukul ${jamWibKadiv(laporan?.forwardedAt)}" else "Oleh Admin PT",
        ),
    )
    val terpenuhi = syarat.count { it.ok }

    val jawaban = when {
        butir.isEmpty() -> "Divisi ${divisi.name} belum mengisi capaian minggu ini."
        diserahkan -> "Capaian divisi ${divisi.name} sudah diserahkan, $selesai dari ${dihitung.size} item selesai."
        else -> "$terpenuhi dari ${syarat.size} syarat penyerahan sudah terpenuhi."
    }
    val pendukung = listOfNotNull(
        tanpaBukti.takeIf { it > 0 }?.let { "$it item belum berbukti." },
        tanpaTl.takeIf { it > 0 }?.let { "$it kendala belum punya tindak lanjut." },
        when {
            diserahkan || sisaMs == null -> null
            lewat -> "Tenggat serah sudah lewat."
            else -> "Serahkan dalam ${sisaPanjang(sisaMs)}, paling lambat ${teksTenggatSerah(papan.week.handoverBy)}."
        },
        if (terkunci) "Minggu ini terkunci; perubahan perlu permohonan buka kunci." else null,
    ).joinToString(" ")

    val aksi = when {
        !diserahkan && butir.isNotEmpty() -> AksiPrimerKadiv.SERAHKAN
        diserahkan && !disetujui && papan.canApprove -> AksiPrimerKadiv.SETUJUI
        else -> AksiPrimerKadiv.BUKA_PAPAN
    }

    return SusunanMejaKadiv(
        divisi = divisi,
        butir = butir,
        dihitung = dihitung.size,
        selesai = selesai,
        terkendala = kendala.size,
        tanpaBukti = tanpaBukti,
        tanpaTindakLanjut = tanpaTl,
        diserahkan = diserahkan,
        disetujui = disetujui,
        diteruskan = diteruskan,
        terkunci = terkunci,
        persen = persen,
        syarat = syarat,
        terpenuhi = terpenuhi,
        tindakan = tindakan,
        hariIni = hariIni,
        riwayat = riwayat,
        tepatWaktuSebelumnya = tepatSebelumnya,
        tenggatLewat = lewat,
        jawaban = jawaban,
        pendukung = pendukung,
        aksiPrimer = aksi,
        // E2E-R2 N5: laporan disetujui ditulis "Disetujui" (sama dengan layar Capaian).
        lencanaKepala = "Capaian M${papan.week.isoWeek} · " + when {
            disetujui -> "Disetujui"
            diserahkan -> "Diserahkan"
            else -> "Belum diserahkan"
        },
    )
}
