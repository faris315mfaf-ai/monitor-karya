package id.co.monitorkarya.feature.proyek.data

import id.co.monitorkarya.core.network.ApiError
import kotlinx.coroutines.CancellationException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response

/** Hasil satu panggilan API: sukses (badan boleh null) atau galat ApiError. */
sealed interface Hasil<out T> {
    data class Ok<T>(val data: T?) : Hasil<T>

    /**
     * Galat siap tampil. [kode] HTTP (0 = jaringan/dekode); [badan] teks mentah
     * badan galat untuk kolom tambahan yang tidak diurai ApiError (mis. canArchive).
     */
    data class Gagal(val galat: ApiError, val kode: Int = 0, val badan: String? = null) : Hasil<Nothing> {
        val pesan: String get() = galat.pesanTampil()
    }
}

private val JENIS_JSON = "application/json".toMediaType()

/**
 * Jalankan panggilan Retrofit dan petakan galat lewat ApiError terpusat
 * (401 sesi berakhir, 403 akses, 409 konflik, 422 validasi + `errors`).
 * Badan galat dibaca sekali lalu disalin agar ApiError dan pemanggil sama-sama
 * bisa membacanya.
 */
suspend fun <T> panggil(blok: suspend () -> Response<T>): Hasil<T> = try {
    val res = blok()
    if (res.isSuccessful) {
        Hasil.Ok(res.body())
    } else {
        val badan = runCatching { res.errorBody()?.string() }.getOrNull()
        val salinan = Response.error<Any>(res.code(), (badan ?: "").toResponseBody(JENIS_JSON))
        Hasil.Gagal(ApiError.dari(HttpException(salinan)), res.code(), badan)
    }
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    Hasil.Gagal(ApiError.dari(e))
}
