package id.co.monitorkarya.core.network

import java.io.IOException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Galat API yang sudah diterjemahkan untuk ditampilkan ke pengguna. */
sealed class ApiError {

    data class TidakTerautentikasi(val pesan: String? = null) : ApiError()
    data class WajibGantiSandi(val pesan: String) : ApiError()
    data class TerlaluBanyakPesan(val retryDetik: Long) : ApiError()

    /**
     * 409 — tindakan bertabrakan dengan keadaan server. Route Fase 1 kerap
     * menyertakan {locked, frozen, reportId} pada body-nya (mis. laporan
     * dibekukan "FORWARDED"/"LOCKED" atau terkunci lewat 17.00); ketiganya
     * null bila server tidak menuliskannya.
     */
    data class Konflik(
        val pesan: String,
        val locked: Boolean? = null,
        val frozen: String? = null,
        val reportId: String? = null,
        /** Alasan beku dari server ("FORWARDED"/"LOCKED"); C10-A5. */
        val reason: String? = null,
    ) : ApiError()
    data class Validasi(val pesan: String, val errors: List<String> = emptyList()) : ApiError()
    data class Server(val pesan: String) : ApiError()
    data class Jaringan(val pesan: String) : ApiError()
    data class Lainnya(val pesan: String) : ApiError()

    /** Pesan siap tampil, bahasa Indonesia, tanpa tanda seru. */
    fun pesanTampil(): String = when (this) {
        is TidakTerautentikasi -> pesan ?: "Sesi Anda telah berakhir. Silakan masuk kembali."
        is WajibGantiSandi -> pesan
        is TerlaluBanyakPesan -> {
            val menit = if (retryDetik > 0) (retryDetik + 59) / 60 else 0L
            if (menit > 0) "Terlalu banyak percobaan. Coba lagi dalam $menit menit."
            else "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."
        }
        is Konflik -> pesan
        is Validasi -> pesan
        is Server -> pesan
        is Jaringan -> pesan
        is Lainnya -> pesan
    }

    companion object {

        /**
         * Ubah throwable Retrofit/OkHttp menjadi ApiError.
         * [offlineDeteksi] = true bila pemanggil tahu perangkat sedang luring.
         */
        fun dari(t: Throwable, offlineDeteksi: Boolean = false): ApiError = when (t) {
            is retrofit2.HttpException -> dariHttp(t)
            is IOException -> Jaringan(
                if (offlineDeteksi) "Anda sedang luring. Periksa koneksi internet Anda, lalu coba lagi."
                else "Anda sedang luring atau server tak terjangkau."
            )
            else -> Lainnya(t.message ?: "Terjadi galat yang tidak diketahui.")
        }

        private fun dariHttp(t: retrofit2.HttpException): ApiError {
            val kode = t.code()
            val obj: JsonObject? = runCatching { t.response()?.errorBody()?.string() }.getOrNull()
                ?.let { runCatching { mkJson.parseToJsonElement(it) as? JsonObject }.getOrNull() }
            val pesan = obj.teks("error")
            return when (kode) {
                401 -> TidakTerautentikasi(pesan)
                403 -> if (obj.teks("code") == "MUST_CHANGE_PASSWORD") {
                    WajibGantiSandi(pesan ?: "Ganti kata sandi dulu")
                } else {
                    Konflik(pesan ?: "Akses ditolak.")
                }
                409 -> Konflik(
                    pesan = pesan ?: "Terjadi konflik. Muat ulang lalu coba lagi.",
                    locked = obj.bool("locked"),
                    frozen = obj.teks("frozen"),
                    reportId = obj.teks("reportId"),
                    reason = obj.teks("reason"),
                )
                429 -> TerlaluBanyakPesan(
                    retryDetik = obj.angka("retryAfter")
                        ?: t.response()?.headers()?.get("Retry-After")?.toLongOrNull()
                        ?: 0L
                )
                400, 422 -> Validasi(pesan = pesan ?: "Permintaan tidak valid.", errors = obj.daftar("errors"))
                in 500..599 -> Server(pesan ?: "Server sedang bermasalah. Coba lagi nanti.")
                else -> Lainnya(pesan ?: "Terjadi galat (HTTP $kode).")
            }
        }

        private fun JsonObject?.teks(kunci: String): String? =
            runCatching { this?.get(kunci)?.jsonPrimitive?.contentOrNull }.getOrNull()

        private fun JsonObject?.bool(kunci: String): Boolean? =
            runCatching { this?.get(kunci)?.jsonPrimitive?.booleanOrNull }.getOrNull()

        private fun JsonObject?.angka(kunci: String): Long? = teks(kunci)?.toLongOrNull()

        private fun JsonObject?.daftar(kunci: String): List<String> {
            val larik = this?.get(kunci) as? JsonArray ?: return emptyList()
            return larik.mapNotNull { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
        }
    }
}
