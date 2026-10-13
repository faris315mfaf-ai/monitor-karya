// Antarmuka Retrofit modul :feature:entitas. Dibangun dari Retrofit bersama
// (AppModule: baseUrl tunggal, cookie sesi terenkripsi, konverter mkJson)
// lewat EntitasModule — tidak ada klien HTTP kedua.
package id.co.monitorkarya.feature.entitas.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Tab Entitas: pohon, rincian satu entitas, dan aktivitas per PT. */
interface EntitasApi {

    /** Pohon entitas dalam cakupan pemanggil (berakar di entitasnya bila terbatas). */
    @GET("api/entities")
    suspend fun pohon(): Response<PohonEntitasResponse>

    /**
     * Rincian satu entitas. Server menolak 403 untuk PIC proyek dan kepala
     * divisi, dan 403 untuk entitas di luar cakupan; 404 bila tidak ada.
     */
    @GET("api/entities/{id}")
    suspend fun rincian(@Path("id") id: String): Response<DetailEntitasResponse>

    /**
     * Aktivitas per PT. cadence HARIAN/MINGGUAN/BULANAN; priority
     * ALL/KRITIS/TINGGI/SEDANG/RENDAH; date YYYY-MM-DD (null = hari ini WIB).
     */
    @GET("api/entity-activity")
    suspend fun aktivitas(
        @Query("cadence") cadence: String,
        @Query("priority") priority: String,
        @Query("date") tanggal: String? = null,
    ): Response<AktivitasEntitasResponse>
}

/** Tab Perusahaan & akun: meja perusahaan, akun, dan aktivasi. */
interface PerusahaanApi {

    @GET("api/companies")
    suspend fun meja(): Response<MejaPerusahaanResponse>

    @POST("api/companies")
    suspend fun tambahPerusahaan(@Body body: TambahPerusahaanRequest): Response<TambahPerusahaanResponse>

    @PATCH("api/companies")
    suspend fun ubahPerusahaan(@Body body: UbahPerusahaanRequest): Response<UbahPerusahaanResponse>

    /** 409 bila perusahaan masih punya anak atau riwayat laporan/task. */
    @DELETE("api/companies")
    suspend fun hapusPerusahaan(@Query("id") id: String): Response<OkDto>

    @GET("api/companies/users")
    suspend fun keanggotaan(@Query("id") id: String): Response<KeanggotaanAkunDto>

    @POST("api/companies/users")
    suspend fun tambahAkun(@Body body: TambahAkunRequest): Response<AkunTersimpanResponse>

    @PATCH("api/companies/users")
    suspend fun ubahAkun(@Body body: UbahAkunRequest): Response<AkunTersimpanResponse>

    @DELETE("api/companies/users")
    suspend fun hapusAkun(@Query("id") id: String): Response<OkDto>

    @GET("api/companies/users/activation")
    suspend fun kelayakanAktivasi(@Query("id") id: String): Response<KelayakanAktivasiDto>

    @POST("api/companies/users/activation")
    suspend fun terbitkanAktivasi(@Body body: TerbitkanAktivasiBody): Response<TerbitkanAktivasiJawaban>
}
