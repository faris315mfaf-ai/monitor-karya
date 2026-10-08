package id.co.monitorkarya.core.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/**
 * Kontrak galat 409 untuk Fase 1 (tes oleh agen T5-B9; kode zona jaringan milik
 * agen T5-B1 — spesifikasi lengkap di `android/docs/FASE1.md` bagian kontrak).
 *
 * Sumber bentuk bodi adalah route web (diverifikasi 8 Okt 2026):
 * - `src/app/api/daily-input/route.ts` (PUT/DELETE):
 *   `{error, locked:true, frozen:"FORWARDED"|"LOCKED", reportId}` saat dibekukan,
 *   `{error, locked:true, reportId}` saat terkunci waktu (lewat 17.00 WIB),
 *   `{error, locked:false}` saat simpan bersamaan (P2002 — server minta dicoba ulang).
 * - `src/app/api/tasks/route.ts`: bentuk yang sama, plus kunci mingguan
 *   `{error, locked:true}` tanpa `frozen`/`reportId`.
 * - `src/app/api/work-desk/route.ts`: `{error, locked:true}`.
 *
 * Fase 0 memetakan 409 ke `Lainnya` karena `Konflik` belum mengenal kolom
 * `locked`/`frozen`/`reportId`. Kontrak Fase 1 yang diuji berkas ini:
 *
 * ```kotlin
 * data class Konflik(
 *     val pesan: String,
 *     val locked: Boolean? = null,   // null bila server tidak mengirim kolomnya
 *     val frozen: String? = null,    // "FORWARDED" | "LOCKED" | null
 *     val reportId: String? = null,
 * ) : ApiError()
 * ```
 *
 * Berkas ini spesifikasi eksekusi: tes menghijau setelah zona jaringan
 * memperbarui `ApiError`. Murni JVM — tanpa Android, tanpa Room, tanpa soket.
 */
class ApiError409Test {

    /** Bangun HttpException 409 dengan bodi JSON persis seperti OkHttp-Retrofit. */
    private fun galat409(bodi: String): ApiError = ApiError.dari(
        HttpException(Response.error<Unit>(409, bodi.toResponseBody("application/json".toMediaType()))),
    )

    @Test
    fun konflikBodiLengkapDibekukanDiteruskan() {
        val e = galat409(
            """
            {
              "error": "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.",
              "locked": true,
              "frozen": "FORWARDED",
              "reportId": "rep-77"
            }
            """.trimIndent(),
        )
        assertTrue(e is ApiError.Konflik)
        e as ApiError.Konflik
        assertEquals("Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.", e.pesan)
        assertEquals(java.lang.Boolean.TRUE, e.locked)
        assertEquals("FORWARDED", e.frozen)
        assertEquals("rep-77", e.reportId)
        // pesanTampil meneruskan isi kolom error apa adanya.
        assertEquals(e.pesan, e.pesanTampil())
    }

    @Test
    fun konflikDibekukanTerkunciDenganReportIdNull() {
        val e = galat409(
            """
            {
              "error": "Laporan ini sudah dikunci. Ajukan buka kunci untuk mengubahnya.",
              "locked": true,
              "frozen": "LOCKED",
              "reportId": null
            }
            """.trimIndent(),
        )
        e as ApiError.Konflik
        assertEquals("LOCKED", e.frozen)
        assertEquals(java.lang.Boolean.TRUE, e.locked)
        assertNull(e.reportId)
    }

    @Test
    fun konflikTerkunciWaktuTanpaKolomFrozen() {
        // Lewat 17.00 WIB: server mengirim locked + reportId tanpa frozen.
        val e = galat409(
            """
            {
              "error": "Laporan hari ini sudah dikunci pukul 17.00 WIB. Ajukan buka kunci untuk mengubahnya.",
              "locked": true,
              "reportId": "rep-77"
            }
            """.trimIndent(),
        )
        e as ApiError.Konflik
        assertEquals(java.lang.Boolean.TRUE, e.locked)
        assertNull(e.frozen)
        assertEquals("rep-77", e.reportId)
    }

    @Test
    fun konflikKunciMingguanTanpaFrozenDanReportId() {
        val e = galat409(
            """
            {
              "error": "Minggu ini sudah dikunci (Jumat 17.00 WIB).",
              "locked": true
            }
            """.trimIndent(),
        )
        e as ApiError.Konflik
        assertEquals(java.lang.Boolean.TRUE, e.locked)
        assertNull(e.frozen)
        assertNull(e.reportId)
    }

    @Test
    fun konflikSimpanBersamaanBolehDicobaLagi() {
        // P2002 di server sengaja dibalas 409 locked:false agar klien mencoba
        // ulang (komentar src/app/api/daily-input/route.ts, temuan T2-S2-S2).
        // Antrean outbox memakai beda ini — lihat OutboxProsesTest.
        val e = galat409(
            """
            {
              "error": "Laporan tanggal ini sedang disimpan bersamaan. Muat ulang lalu kirim lagi.",
              "locked": false
            }
            """.trimIndent(),
        )
        e as ApiError.Konflik
        assertEquals(java.lang.Boolean.FALSE, e.locked)
        assertNull(e.frozen)
    }

    @Test
    fun konflikMengabaikanKolomBaruServer() {
        // mkJson memakai ignoreUnknownKeys: server menambah kolom tanpa
        // memecah klien (konvensi JsonConfig Fase 0).
        val e = galat409(
            """
            {
              "error": "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.",
              "locked": true,
              "frozen": "FORWARDED",
              "reportId": "rep-77",
              "unlockHint": "ajukan lewat /api/unlock-requests"
            }
            """.trimIndent(),
        )
        e as ApiError.Konflik
        assertEquals("FORWARDED", e.frozen)
        assertEquals("rep-77", e.reportId)
    }

    @Test
    fun konflikBodiBukanJsonTetapKonflik() {
        // Bodi 409 yang bukan JSON (mis. proxy) tetap varian Konflik dengan
        // pesan cadangan yang tidak kosong — bukan Lainnya seperti Fase 0.
        val e = ApiError.dari(
            HttpException(
                Response.error<Unit>(409, "conflict".toResponseBody("text/plain".toMediaType())),
            ),
        )
        assertTrue(e is ApiError.Konflik)
        assertTrue((e as ApiError.Konflik).pesan.isNotBlank())
        assertNull(e.frozen)
        assertNull(e.reportId)
    }

    @Test
    fun regresi403BukanWajibGantiSandiTetapKonflik() {
        // Fase 0: 403 tanpa kode MUST_CHANGE_PASSWORD adalah Konflik;
        // pembaruan 409 tidak boleh merusak perilaku ini.
        val e = ApiError.dari(
            HttpException(
                Response.error<Unit>(
                    403,
                    "{\"error\":\"Akses ditolak.\"}".toResponseBody("application/json".toMediaType()),
                ),
            ),
        )
        assertTrue(e is ApiError.Konflik)
        assertEquals("Akses ditolak.", (e as ApiError.Konflik).pesan)
        assertNull(e.locked)
        assertFalse(e.pesanTampil().isEmpty())
    }
}
