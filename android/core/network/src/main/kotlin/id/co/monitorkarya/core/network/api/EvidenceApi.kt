package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.EvidenceAttachResponse
import id.co.monitorkarya.core.network.dto.EvidenceDeleteResponse
import id.co.monitorkarya.core.network.dto.EvidenceLinkRequest
import id.co.monitorkarya.core.network.dto.EvidenceListResponse
import id.co.monitorkarya.core.network.dto.EvidenceUploadResponse
import id.co.monitorkarya.core.network.dto.EvidenceUrlResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Body
import retrofit2.http.Query

/**
 * Bukti pendukung (src/app/api/evidence/route.ts, upload/route.ts, [id]/route.ts).
 *
 * Unggahan multipart memakai nama field PERSIS "file", "targetType", "targetId",
 * dan "label" (opsional); batas 20 MB per berkas — server menolak lebih besar
 * dengan 413 sebelum memori terpakai penuh. Jenis berkas diizinkan: jpeg, png,
 * webp, heic, gif, pdf, doc, docx, xls, xlsx, txt, csv; isi harus cocok dengan
 * jenisnya (tanda tangan byte) dan ekstensi harus sesuai.
 */
interface EvidenceApi {

    /** Daftar bukti yang menempel pada satu target (mis. "DAILY_REPORT"/"TASK"). */
    @GET("api/evidence")
    suspend fun daftar(
        @Query("targetType") targetType: String,
        @Query("targetId") targetId: String,
    ): Response<EvidenceListResponse>

    /** Lampirkan tautan http(s) berlabel (bukan berkas). */
    @POST("api/evidence")
    suspend fun tautan(@Body body: EvidenceLinkRequest): Response<EvidenceAttachResponse>

    /**
     * Unggah satu berkas multipart. [berkas] dibangun pemanggil, misalnya
     * `MultipartBody.Part.createFormData("file", nama, requestBody)`; label
     * null berarti field tidak dikirim (nama berkas dipakai sebagai judul).
     */
    @Multipart
    @POST("api/evidence/upload")
    suspend fun unggah(
        @Part berkas: MultipartBody.Part,
        @Part("targetType") targetType: RequestBody,
        @Part("targetId") targetId: RequestBody,
        @Part("label") label: RequestBody? = null,
    ): Response<EvidenceUploadResponse>

    /**
     * Cara membuka satu bukti: tautan luar (kind "link") atau tautan bertanda
     * yang hanya berlaku beberapa menit (kind "file", expiresInSeconds 300).
     */
    @GET("api/evidence/{id}")
    suspend fun buka(@Path("id") id: String): Response<EvidenceUrlResponse>

    /** Hapus baris bukti (dan berkasnya di penyimpanan bila unggahan). */
    @DELETE("api/evidence/{id}")
    suspend fun hapus(@Path("id") id: String): Response<EvidenceDeleteResponse>
}
