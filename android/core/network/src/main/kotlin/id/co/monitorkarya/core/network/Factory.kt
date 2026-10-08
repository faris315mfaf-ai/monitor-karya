package id.co.monitorkarya.core.network

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.ExperimentalSerializationApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit

/** Buat implementasi API Retrofit dengan konverter kotlinx.serialization. */
@OptIn(ExperimentalSerializationApi::class)
fun <T> buatApi(ok: OkHttpClient, baseUrl: String, kelas: Class<T>): T {
    // Retrofit mengharuskan baseUrl diakhiri "/" agar path relatif "api/auth/login" benar.
    require(baseUrl.endsWith("/")) { "baseUrl harus diakhiri garis miring: $baseUrl" }
    return Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(ok)
        .addConverterFactory(mkJson.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(kelas)
}
