package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.TaskMovesRequest
import id.co.monitorkarya.core.network.dto.TaskMovedResponse
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.dto.TaskSaveResponse
import id.co.monitorkarya.core.network.dto.TasksDayResponse
import id.co.monitorkarya.core.network.dto.TasksWeekResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Task harian/mingguan (src/app/api/tasks/route.ts).
 *
 * GET memakai [projectId] WAJIB plus SATU dari dua lajur: [tanggal] untuk meja
 * harian (task bercakupan HARIAN hari itu) atau [minggu] "2026-W37" untuk papan
 * mingguan (semua task minggu itu) — parameter null tidak dikirim, jadi panggil
 * lewat [perHari] atau [perMingguan], jangan keduanya. Kartu harian ikut beku
 * mengikuti laporan hariannya (409 {error, locked, frozen?, reportId?}).
 *
 * Tulis (POST/PUT/DELETE) menerima `Idempotency-Key` opsional (gelombang E):
 * null = header tidak dikirim (perilaku lama); kunci yang sama pada ulangan
 * dibalas respons sukses pertama + `Idempotency-Replayed: true`.
 */
interface TasksApi {

    /** Meja harian: task satu hari WIB beserta status kunci hari itu. */
    @GET("api/tasks")
    suspend fun perHari(
        @Query("projectId") projectId: String,
        @Query("date") tanggal: String? = null,
    ): Response<TasksDayResponse>

    /** Papan mingguan: seluruh task minggu ISO itu, kedua cakupan. */
    @GET("api/tasks")
    suspend fun perMingguan(
        @Query("projectId") projectId: String,
        @Query("week") minggu: String,
    ): Response<TasksWeekResponse>

    /** Buat task baru (badan memuat projectId; lihat TaskSaveRequest). */
    @POST("api/tasks")
    suspend fun buat(
        @Body body: TaskSaveRequest,
        @Header(Idempotensi.HEADER) kunciIdempotensi: String? = null,
    ): Response<TaskSaveResponse>

    /** Ubah task (badan memuat id; daftar subtask dikirim utuh diganti). */
    @PUT("api/tasks")
    suspend fun ubah(
        @Body body: TaskSaveRequest,
        @Header(Idempotensi.HEADER) kunciIdempotensi: String? = null,
    ): Response<TaskSaveResponse>

    /** Seret-lepas kartu di papan mingguan (PATCH moves). */
    @PATCH("api/tasks")
    suspend fun pindah(@Body body: TaskMovesRequest): Response<TaskMovedResponse>

    /** Hapus task; [konteks] "HARIAN"|"MINGGUAN" menentukan aturan kuncinya. */
    @DELETE("api/tasks")
    suspend fun hapus(
        @Query("id") id: String,
        @Query("context") konteks: String? = null,
        @Header(Idempotensi.HEADER) kunciIdempotensi: String? = null,
    ): Response<OkResponse>
}

/**
 * Entri laporan harian multi-item (A1, 13 Okt 2026) — rute yang sama dengan
 * [TasksApi] tetapi dibaca sebagai [EntriLaporanDto] (dengan kolom narasi
 * entri). Antarmuka terpisah agar implementasi palsu [TasksApi] di tes lama
 * tidak pecah; dibuat dari Retrofit tunggal (`retrofit.create`).
 */
interface EntriLaporanApi {

    /** Entri satu hari WIB ([tanggal] null = hari ini) + status kunci hari itu. */
    @GET("api/tasks")
    suspend fun entriHari(
        @Query("projectId") projectId: String,
        @Query("date") tanggal: String? = null,
    ): Response<id.co.monitorkarya.core.network.dto.EntriHariResponse>

    /** Tambah entri (badan memuat projectId + workDate). */
    @POST("api/tasks")
    suspend fun tambahEntri(
        @Body body: id.co.monitorkarya.core.network.dto.EntriSimpanRequest,
        @Header(Idempotensi.HEADER) kunciIdempotensi: String? = null,
    ): Response<id.co.monitorkarya.core.network.dto.EntriSimpanResponse>

    /** Ubah entri (badan memuat id). */
    @PUT("api/tasks")
    suspend fun ubahEntri(
        @Body body: id.co.monitorkarya.core.network.dto.EntriSimpanRequest,
        @Header(Idempotensi.HEADER) kunciIdempotensi: String? = null,
    ): Response<id.co.monitorkarya.core.network.dto.EntriSimpanResponse>
}
