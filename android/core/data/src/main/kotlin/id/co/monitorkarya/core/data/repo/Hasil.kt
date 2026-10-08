// Hasil operasi repositori + pembungkus panggilan Retrofit bersama.
// Semua tulis jujur daring (Rancangan §4): hasil server final, tidak pernah
// ditimpa lokal; luring tidak pernah dianggap terkirim.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import retrofit2.HttpException

/**
 * Hasil operasi tulis (kirim laporan, tulis/hapus task, unggah/hapus bukti,
 * dan item outbox). Padanan "Hasil" pada kontrak T5-B2: `HasilKirim.Luring`
 * adalah "Hasil.Luring" di dokumen tugas.
 */
sealed interface HasilKirim {

    /** Server menerima operasi; tidak ada pesan wajib. */
    data class Sukses(val pesan: String? = null) : HasilKirim

    /**
     * Perangkat luring atau server tak terjangkau. Operasi TIDAK dikirim dan
     * TIDAK dianggap sukses — kirim luring tidak diizinkan (Rancangan §4).
     */
    data object Luring : HasilKirim

    /**
     * Server menolak final (409 beku/terlambat/tenggat, 422 validasi, dsb.).
     * Perlu ditindak pengguna; tidak diulang otomatis.
     */
    data class GagalPermanen(val pesan: String) : HasilKirim

    /** Kegagalan sementara (429, 5xx, sesi berakhir) — boleh dicoba lagi. */
    data class GagalSementara(val pesan: String) : HasilKirim

    companion object {

        /** Terjemahkan ApiError jadi keputusan kirim; pesan siap tampil. */
        fun dari(galat: ApiError): HasilKirim = when (galat) {
            is ApiError.Jaringan -> Luring
            // Sesi habis / wajib ganti sandi: ulangi setelah pengguna masuk lagi.
            is ApiError.TidakTerautentikasi -> GagalSementara(galat.pesanTampil())
            is ApiError.WajibGantiSandi -> GagalSementara(galat.pesanTampil())
            is ApiError.TerlaluBanyakPesan -> GagalSementara(galat.pesanTampil())
            is ApiError.Server -> GagalSementara(galat.pesanTampil())
            // Keputusan domain server bersifat final (Rancangan §4 butir 2) —
            // KECUALI 409 locked:false: tabrakan simpan bersamaan (P2002) yang
            // justru diminta server untuk dicoba ulang
            // (src/app/api/daily-input/route.ts cabang P2002; audit T5-B9 A7).
            is ApiError.Konflik -> if (galat.locked == false) {
                GagalSementara(galat.pesanTampil())
            } else {
                GagalPermanen(galat.pesanTampil())
            }
            is ApiError.Validasi -> GagalPermanen(galat.pesanTampil())
            is ApiError.Lainnya -> GagalPermanen(galat.pesanTampil())
        }
    }
}

/** Hasil operasi baca/tarik: data atau pesan galat siap tampil. */
sealed interface HasilBaca<out T> {
    data class Sukses<out T>(val data: T) : HasilBaca<T>
    data class Gagal(val pesan: String) : HasilBaca<Nothing>
}

/**
 * Jalankan panggilan baca Retrofit (gaya `Response<T>` seperti AuthApi F0).
 * IOException dianggap luring/galat jaringan; galat HTTP diterjemahkan
 * ApiError supaya pesannya berbahasa Indonesia.
 */
internal suspend fun <T> bacaApi(blok: suspend () -> Response<T>): HasilBaca<T> =
    try {
        val jawaban = blok()
        when {
            jawaban.isSuccessful -> {
                val isi = jawaban.body()
                if (isi != null) {
                    HasilBaca.Sukses(isi)
                } else {
                    HasilBaca.Gagal("Jawaban server kosong.")
                }
            }
            else -> HasilBaca.Gagal(ApiError.dari(HttpException(jawaban)).pesanTampil())
        }
    } catch (e: IOException) {
        HasilBaca.Gagal(ApiError.dari(e).pesanTampil())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        // Sisa galat (mis. seri JSON rusak) tetap jadi pesan, tidak membiarkan
        // coroutine mati tanpa kabar.
        @Suppress("TooGenericExceptionCaught")
        HasilBaca.Gagal(ApiError.dari(e).pesanTampil())
    }

/**
 * Jalankan panggilan tulis Retrofit; [saatSukses] memproses badan jawaban
 * (menyimpan ke Room, memperbarui jumlah bukti, dsb.) sebelum hasil dibalik.
 * IOException = luring; sisanya lewat [HasilKirim.dari].
 */
internal suspend fun <T> tulisApi(
    blok: suspend () -> Response<T>,
    saatSukses: suspend (T?) -> Unit = {},
): HasilKirim =
    try {
        val jawaban = blok()
        if (jawaban.isSuccessful) {
            saatSukses(jawaban.body())
            HasilKirim.Sukses()
        } else {
            HasilKirim.dari(ApiError.dari(HttpException(jawaban)))
        }
    } catch (e: IOException) {
        HasilKirim.Luring
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        @Suppress("TooGenericExceptionCaught")
        HasilKirim.dari(ApiError.dari(e))
    }

/** ISO-8601 (mis. "2026-10-08T00:00:00.000Z" atau "2026-10-08") jadi epoch millis. */
internal fun isoKeEpochMillis(nilai: String?): Long? =
    nilai?.let { mentah ->
        runCatching { Instant.parse(mentah).toEpochMilli() }
            .recoverCatching { Wib.keEpochMillis(LocalDate.parse(mentah.substringBefore('T'))) }
            .getOrNull()
    }

/** ISO-8601 jadi tanggal kalender WIB; null bila kosong/tidak terbaca. */
internal fun isoKeLocalDate(nilai: String?): LocalDate? =
    nilai?.let { mentah ->
        runCatching { Instant.parse(mentah).atZone(Wib.ZONA).toLocalDate() }
            .recoverCatching { LocalDate.parse(mentah.substringBefore('T')) }
            .getOrNull()
    }
