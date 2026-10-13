// Meja laporan "hari ini" saat mulai luring pada hari baru (C5-T4). Murni —
// diuji di app/src/test (MejaHariBaruTest).
//
// Masalah lama: potret Room berkunci tetap "laporan:meja:hari-ini" sehingga
// PIC yang membuka aplikasi tanpa sinyal pagi hari melihat meja KEMARIN
// sebagai "hari ini" dan entri barunya diantre dengan workDate kemarin.
// Kini potret dikunci per (uid, tanggal WIB). Bila hari ini belum punya potret,
// meja hari ini dibangun dari potret "hari ini" terakhir: daftar proyek sama,
// tanpa laporan/entri/buka kunci, tanggal = hari ini WIB, titik kunci
// (lockAt) digeser sebanyak selisih hari sehingga jam batas PT tetap berlaku.
// Server tetap otoritas: kiriman yang sampai dinilai menurut aturannya
// (hari kerja, jam batas) dan 409 tampil sebagai "Gagal kirim".
package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Meja [hariIni] dari [potret] meja hari ini terakhir; null bila potret bukan
 * dari hari SEBELUM [hariIni] (sama = pakai apa adanya; lebih baru = jam
 * perangkat mundur, jangan menebak).
 */
internal fun mejaHariBaru(potret: DailyInputGetResponse, hariIni: LocalDate, sekarang: Instant): DailyInputGetResponse? {
    val hariPotret = runCatching { LocalDate.parse(potret.todayKey) }.getOrNull() ?: return null
    if (!hariPotret.isBefore(hariIni)) return null
    val selisih = ChronoUnit.DAYS.between(hariPotret, hariIni)
    val kunciBaru = geserHari(potret.lockAt, selisih)
    val terkunci = kunciBaru?.let { !sekarang.isBefore(it) } ?: false
    val kunciIso = hariIni.toString()
    return potret.copy(
        reportDate = geserHari(potret.reportDate, selisih)?.toString() ?: kunciIso,
        reportDateKey = kunciIso,
        today = true,
        todayKey = kunciIso,
        lockAt = kunciBaru?.toString().orEmpty(),
        locked = terkunci,
        // Hari lain yang dibuka & ajuan buka kunci berasal dari kemarin — tidak berlaku.
        openDays = emptyList(),
        projects = potret.projects.map { p ->
            p.copy(
                taskCount = 0,
                derived = false,
                editable = !terkunci,
                lockReason = if (terkunci) "TIME" else null,
                unlock = null,
                report = null,
            )
        },
    )
}

/** Instan ISO [iso] digeser [hari] hari; null bila kosong/tidak terbaca. */
private fun geserHari(iso: String, hari: Long): Instant? =
    runCatching { Instant.parse(iso).plus(hari, ChronoUnit.DAYS) }.getOrNull()
