// Pembungkus panggilan Retrofit: setiap respons diubah menjadi Jawab.Ok atau
// Jawab.Gagal berisi ApiError core:network (401/403/409/422/429/5xx/jaringan)
// beserta kode HTTP-nya, supaya ViewModel bisa membedakan 403 (izin) dari
// galat lain tanpa menebak izin di klien.
package id.co.monitorkarya.feature.entitas.data

import id.co.monitorkarya.core.network.ApiError
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import retrofit2.Response

/** Hasil satu panggilan API. */
sealed interface Jawab<out T> {
    data class Ok<T>(val data: T) : Jawab<T>

    /** [kode] = kode HTTP; null untuk galat jaringan/parsing. */
    data class Gagal(val galat: ApiError, val kode: Int? = null) : Jawab<Nothing> {
        val pesan: String get() = galat.pesanTampil()
    }
}

/** Jalankan panggilan; badan kosong pada 2xx dianggap galat kontrak. */
suspend fun <T : Any> panggil(blok: suspend () -> Response<T>): Jawab<T> = try {
    val res = blok()
    val badan = res.body()
    when {
        res.isSuccessful && badan != null -> Jawab.Ok(badan)
        res.isSuccessful -> Jawab.Gagal(ApiError.Lainnya(PESAN_BADAN_KOSONG), res.code())
        else -> Jawab.Gagal(ApiError.dari(HttpException(res)), res.code())
    }
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    Jawab.Gagal(ApiError.dari(e))
}

internal const val PESAN_BADAN_KOSONG = "Jawaban server kosong. Muat ulang lalu coba lagi."
