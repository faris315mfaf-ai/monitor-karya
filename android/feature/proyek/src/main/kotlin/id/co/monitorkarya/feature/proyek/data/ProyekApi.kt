package id.co.monitorkarya.feature.proyek.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Seluruh endpoint tab Proyek. Semua mengembalikan [Response] agar ViewModel
 * memetakan galat 401/403/409/422 lewat ApiError (core:network) tanpa melempar.
 * Cakupan dan izin selalu ditentukan server menurut sesi.
 */
interface ProyekApi {

    /** Daftar proyek; lifecycle bawaan server "AKTIF", "ALL" = semua. */
    @GET("api/projects")
    suspend fun daftar(
        @Query("page") halaman: Int,
        @Query("pageSize") ukuran: Int,
        @Query("lifecycle") siklus: String,
        @Query("phase") tahap: String? = null,
        @Query("search") cari: String? = null,
        @Query("id") id: String? = null,
    ): Response<DaftarProyekDto>

    /** Pilihan formulir; 403 = peran tidak boleh mengajukan maupun mengelola. */
    @GET("api/projects?options=1")
    suspend fun opsi(@Query("entityId") entityId: String? = null): Response<OpsiProyekDto>

    @POST("api/projects")
    suspend fun ajukan(@Body body: ProyekBaruRequest): Response<SimpanProyekDto>

    @PATCH("api/projects")
    suspend fun ubah(@Body body: UbahProyekRequest): Response<SimpanProyekDto>

    @PATCH("api/projects")
    suspend fun ubahStatus(@Body body: UbahStatusRequest): Response<SimpanProyekDto>

    @PATCH("api/projects")
    suspend fun ajukanUlang(@Body body: AjukanUlangRequest): Response<SimpanProyekDto>

    /** 409 + `canArchive` bila proyek sudah punya laporan/task. */
    @DELETE("api/projects")
    suspend fun hapus(@Query("id") id: String): Response<OkDto>

    @POST("api/projects/approve")
    suspend fun putuskan(@Body body: KeputusanRequest): Response<KeputusanDto>

    @GET("api/project-stages")
    suspend fun tahapan(@Query("projectId") projectId: String): Response<TahapanDto>

    @POST("api/project-stages")
    suspend fun tambahTahap(@Body body: TahapBaruRequest): Response<SimpanTahapDto>

    @PUT("api/project-stages")
    suspend fun ubahTahap(@Body body: UbahTahapRequest): Response<SimpanTahapDto>

    @PATCH("api/project-stages")
    suspend fun urutkanTahap(@Body body: UrutanTahapRequest): Response<OkDto>

    @DELETE("api/project-stages")
    suspend fun hapusTahap(@Query("id") id: String): Response<OkDto>

    @GET("api/deadline-proposals")
    suspend fun usulanTenggat(@Query("projectId") projectId: String): Response<UsulanTenggatListDto>

    @POST("api/deadline-proposals")
    suspend fun usulTenggat(@Body body: UsulTenggatRequest): Response<OkDto>

    @PATCH("api/deadline-proposals")
    suspend fun aksiUsulan(@Body body: AksiUsulanRequest): Response<OkDto>

    @GET("api/daily-reports")
    suspend fun riwayatLaporan(
        @Query("projectId") projectId: String,
        @Query("pageSize") ukuran: Int = 14,
    ): Response<RiwayatLaporanDto>

    @GET("api/outputs")
    suspend fun output(@Query("projectId") projectId: String): Response<DaftarOutputDto>

    /**
     * Eskalasi terkait satu proyek (B3): server menyaring per `projectId`
     * (laporan harian + task proyek), memeriksa akses proyek (403/404), dan
     * tetap mengiris cakupan PIC/kepala divisi.
     */
    @GET("api/escalations")
    suspend fun eskalasi(
        @Query("projectId") projectId: String,
        @Query("pageSize") ukuran: Int = ESKALASI_DIAMBIL,
    ): Response<DaftarEskalasiDto>

    @POST("api/undo")
    suspend fun urungkan(@Body body: UrungkanRequest): Response<UrungkanDto>
}

/** Eskalasi terkait yang diambil untuk detail proyek (terbaru dulu). */
internal const val ESKALASI_DIAMBIL = 50
