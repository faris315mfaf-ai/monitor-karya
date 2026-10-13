// Potret luring layar pemantau (E2E-R2-3 B6). Pola sama dengan meja PIC
// (MejaKerjaViewModel.baca): daring dulu; setiap tarik sukses disimpan apa
// adanya ke CacheLayar (Room, kunci diawali uid sesi oleh CacheLayar); bila
// server tak terjangkau (IOException) layar membaca potret terakhir HARI INI
// (tanggal WIB di kunci) dan menandainya "Luring · data tersimpan HH.MM".
// 4xx/5xx tidak memakai potret: jawaban server tetap final.
package id.co.monitorkarya.feature.ringkasangrup.data

import id.co.monitorkarya.core.data.repo.Tersimpan
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.feature.ringkasangrup.Bagian
import id.co.monitorkarya.feature.ringkasangrup.RingkasanGrupViewModel
import java.io.IOException
import kotlinx.coroutines.CancellationException
import retrofit2.Response

/** Kunci layar CacheLayar untuk modul ringkasan (uid ditambahkan CacheLayar). */
object KunciPotret {
    /** /api/ringkasan — dipakai bersama Ringkasan grup dan Ringkasan Direktur. */
    fun ringkasan(tanggal: String = hariIni()): String = "pemantau:ringkasan:$tanggal"
    fun grafik(tanggal: String = hariIni()): String = "pemantau:grafik:$tanggal"
    fun peta(tanggal: String = hariIni()): String = "pemantau:peta:$tanggal"
    fun insiden(tanggal: String = hariIni()): String = "pemantau:insiden:$tanggal"

    private fun hariIni(): String = Wib.hariIni().toString()
}

/**
 * Satu panggilan daring-dulu. Hasil: bagian layar + waktu potret (null = segar
 * dari server). [simpan] dipanggil hanya untuk 2xx berbadan; [potret] hanya
 * saat jaringan gagal. 403 tetap [Bagian.Ditolak], kode lain [Bagian.Galat].
 */
internal suspend fun <T> ambilDaringDulu(
    panggil: suspend () -> Response<T>,
    simpan: suspend (T) -> Unit,
    potret: suspend () -> Tersimpan<T>?,
): Pair<Bagian<T>, Long?> {
    val res = try {
        panggil()
    } catch (e: CancellationException) {
        throw e
    } catch (e: IOException) {
        val p = potret() ?: return Bagian.Galat(ApiError.dari(e).pesanTampil()) to null
        return Bagian.Siap(p.nilai) to p.disimpanPada
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
        return Bagian.Galat(ApiError.dari(e).pesanTampil()) to null
    }
    val hasil = RingkasanGrupViewModel.ambil { res }
    if (hasil is Bagian.Siap) simpan(hasil.data)
    return hasil to null
}
