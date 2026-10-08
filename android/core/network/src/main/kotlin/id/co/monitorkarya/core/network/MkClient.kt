package id.co.monitorkarya.core.network

import java.util.concurrent.TimeUnit
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

/** Pembangun OkHttpClient bersama untuk semua API Monitor Karya. */
object MkClient {

    private const val NILAI_X_MK_CLIENT = "android/0.1.0"
    private const val NILAI_USER_AGENT = "MonitorKarya-Android/0.1.0"

    fun okHttp(authStore: MkAuthStore, debug: Boolean): OkHttpClient =
        OkHttpClient.Builder()
            .cookieJar(cookieJarSesi(authStore))
            .addInterceptor(interceptorHeader(authStore))
            .apply {
                if (debug) {
                    // BASIC: hanya baris permintaan/jawaban, tanpa isi dan nilai header.
                    addInterceptor(
                        HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
                    )
                }
            }
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()

    private fun cookieJarSesi(authStore: MkAuthStore): CookieJar =
        object : CookieJar {
            // OkHttp sudah memecah tiap header Set-Cookie (response.headers("set-cookie"))
            // menjadi objek Cookie; teruskan pasangan nama=nilai ke penyimpanan sesi.
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                if (cookies.isEmpty()) return
                authStore.simpan(cookies.map { "${it.name}=${it.value}" })
            }

            // Header Cookie permintaan dipasang interceptor dari authStore.header(),
            // bukan lewat sini, supaya prefiks __Host- tidak perlu diurai ulang.
            override fun loadForRequest(url: HttpUrl): List<Cookie> = emptyList()
        }

    private fun interceptorHeader(authStore: MkAuthStore): Interceptor =
        Interceptor { chain ->
            val pembangun = chain.request().newBuilder()
                .header("X-MK-Client", NILAI_X_MK_CLIENT)
                .header("User-Agent", NILAI_USER_AGENT)
            authStore.header()?.let { pembangun.header("Cookie", it) }
            // PENTING: jangan pernah menyetel header Origin di sini.
            // Klien native memang tanpa Origin/Sec-Fetch-Site sehingga lolos
            // cek CSRF proxy (src/proxy.ts) dan sampai ke pemeriksaan sesi.
            chain.proceed(pembangun.build())
        }
}
