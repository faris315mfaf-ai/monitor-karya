package id.co.monitorkarya.core.network

import java.util.concurrent.TimeUnit
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

/** Peristiwa sesi yang terdeteksi dari jawaban server pada permintaan BERCOOKIE. */
enum class PeristiwaSesi {
    /** 401: sesi dicabut/kedaluwarsa (mis. kata sandi diganti di tempat lain). */
    BERAKHIR,

    /** 403 MUST_CHANGE_PASSWORD di tengah pemakaian (admin menyetel ulang akun). */
    WAJIB_GANTI_SANDI,
}

/** Pembangun OkHttpClient bersama untuk semua API Monitor Karya. */
object MkClient {

    private const val NILAI_X_MK_CLIENT = "android/0.1.0"
    private const val NILAI_USER_AGENT = "MonitorKarya-Android/0.1.0"

    /**
     * [saatPeristiwaSesi] dipanggil (di thread OkHttp) bila server menolak sesi
     * yang sedang dipakai; lapisan aplikasi mengembalikan pengguna ke layar masuk.
     * Tanpa ini sesi yang dicabut hanya menghasilkan galat di tiap layar tanpa
     * jalan keluar.
     */
    fun okHttp(
        authStore: MkAuthStore,
        debug: Boolean,
        saatPeristiwaSesi: ((PeristiwaSesi) -> Unit)? = null,
    ): OkHttpClient =
        OkHttpClient.Builder()
            .cookieJar(cookieJarSesi(authStore))
            .addInterceptor(interceptorHeader())
            // Peristiwa sesi tetap di tingkat aplikasi: badan jawaban sudah
            // didekompresi (peek "MUST_CHANGE_PASSWORD" aman walau gzip).
            .addInterceptor(interceptorPeristiwaSesi(authStore, saatPeristiwaSesi))
            // C5-R2: Cookie dipasang di tingkat JARINGAN (tiap lompatan redirect)
            // dan hanya ke host asal panggilan — OkHttp hanya membuang
            // Authorization pada redirect lintas host, bukan header Cookie manual.
            .addNetworkInterceptor(interceptorCookie(authStore))
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
                authStore.simpan(cookies.map { pasanganCookie(it) })
            }

            // Header Cookie permintaan dipasang interceptor dari authStore.header(),
            // bukan lewat sini, supaya prefiks __Host- tidak perlu diurai ulang.
            override fun loadForRequest(url: HttpUrl): List<Cookie> = emptyList()
        }

    /**
     * Cookie yang sudah kedaluwarsa (Max-Age=0 / Expires lampau — cara server
     * menghapus cookie sesi saat keluar) dikirim ke penyimpanan sebagai nilai
     * kosong supaya terhapus; kalau tidak, nilai lamanya terus dikirim dan
     * server menolaknya sebagai sesi basi.
     */
    internal fun pasanganCookie(cookie: Cookie, sekarangMs: Long = System.currentTimeMillis()): String {
        val kedaluwarsa = cookie.persistent && cookie.expiresAt <= sekarangMs
        return if (kedaluwarsa) "${cookie.name}=" else "${cookie.name}=${cookie.value}"
    }

    private fun interceptorPeristiwaSesi(
        authStore: MkAuthStore,
        saatPeristiwa: ((PeristiwaSesi) -> Unit)?,
    ): Interceptor =
        Interceptor { chain ->
            val permintaan = chain.request()
            // Cookie yang akan dipasang interceptorCookie untuk permintaan ini.
            val cookieDikirim = authStore.header()
            val jawaban = chain.proceed(permintaan)
            // Hanya permintaan yang membawa cookie sesi: 401 tanpa cookie = memang belum
            // masuk; 401 dari /api/auth/login = kredensial salah, bukan sesi berakhir.
            if (saatPeristiwa != null && cookieDikirim != null) {
                val jalur = permintaan.url.encodedPath
                val peristiwa = when {
                    jalur.endsWith(JALUR_MASUK) -> null
                    jawaban.code == 401 -> PeristiwaSesi.BERAKHIR
                    jawaban.code == 403 && badanMemuatKodeGantiSandi(jawaban) -> PeristiwaSesi.WAJIB_GANTI_SANDI
                    else -> null
                }
                // C5-S6: permintaan BASI (cookie lama) yang kembali 401 setelah sesi
                // baru tersimpan tidak boleh menghapus cookie baru / melempar ke
                // layar masuk — hanya bila cookie yang dikirim = cookie tersimpan kini.
                if (peristiwa != null && cookieMasihBerlaku(cookieDikirim, authStore.header())) {
                    if (peristiwa == PeristiwaSesi.BERAKHIR) authStore.hapus()
                    runCatching { saatPeristiwa(peristiwa) }
                }
            }
            jawaban
        }

    private fun badanMemuatKodeGantiSandi(jawaban: okhttp3.Response): Boolean =
        runCatching { jawaban.peekBody(UKURAN_INTIP_BADAN).string().contains("MUST_CHANGE_PASSWORD") }
            .getOrDefault(false)

    private const val JALUR_MASUK = "/api/auth/login"
    private const val UKURAN_INTIP_BADAN = 4096L

    /** Cookie yang dikirim = cookie tersimpan sekarang (bukan permintaan basi). */
    internal fun cookieMasihBerlaku(dikirim: String?, tersimpan: String?): Boolean =
        dikirim != null && dikirim == tersimpan

    /** Cookie sesi hanya untuk host asal panggilan (lompatan redirect ke host lain tanpa Cookie). */
    internal fun bolehBawaCookie(hostAsal: String, hostLompatan: String): Boolean =
        hostAsal.equals(hostLompatan, ignoreCase = true)

    private fun interceptorHeader(): Interceptor =
        Interceptor { chain ->
            val pembangun = chain.request().newBuilder()
                .header("X-MK-Client", NILAI_X_MK_CLIENT)
                .header("User-Agent", NILAI_USER_AGENT)
            // PENTING: jangan pernah menyetel header Origin di sini.
            // Klien native memang tanpa Origin/Sec-Fetch-Site sehingga lolos
            // cek CSRF proxy (src/proxy.ts) dan sampai ke pemeriksaan sesi.
            chain.proceed(pembangun.build())
        }

    private fun interceptorCookie(authStore: MkAuthStore): Interceptor =
        Interceptor { chain ->
            val permintaan = chain.request()
            val hostAsal = chain.call().request().url.host
            val cookie = authStore.header()
            val pembangun = permintaan.newBuilder().removeHeader("Cookie")
            if (cookie != null && bolehBawaCookie(hostAsal, permintaan.url.host)) pembangun.header("Cookie", cookie)
            chain.proceed(pembangun.build())
        }
}
