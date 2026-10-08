package id.co.monitorkarya.core.network.api

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
    suspend fun buat(@Body body: TaskSaveRequest): Response<TaskSaveResponse>

    /** Ubah task (badan memuat id; daftar subtask dikirim utuh diganti). */
    @PUT("api/tasks")
    suspend fun ubah(@Body body: TaskSaveRequest): Response<TaskSaveResponse>

    /** Seret-lepas kartu di papan mingguan (PATCH moves). */
    @PATCH("api/tasks")
    suspend fun pindah(@Body body: TaskMovesRequest): Response<TaskMovedResponse>

    /** Hapus task; [konteks] "HARIAN"|"MINGGUAN" menentukan aturan kuncinya. */
    @DELETE("api/tasks")
    suspend fun hapus(
        @Query("id") id: String,
        @Query("context") konteks: String? = null,
    ): Response<OkResponse>
}
