package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.ProjectsListResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Daftar proyek (src/app/api/projects/route.ts, GET). Cakupan mengikuti sesi
 * (PIC: proyeknya sendiri); lifecycle bawaan server "AKTIF". Route ini juga
 * melayani POST/PATCH/DELETE pengajuan proyek — wilayah Fase 2, belum dibuatkan
 * metodenya di sini.
 */
interface ProjectsApi {

    /** Daftar proyek tersaring dalam cakupan sesi. */
    @GET("api/projects")
    suspend fun daftar(
        @Query("page") halaman: Int? = null,
        @Query("pageSize") ukuranHalaman: Int? = null,
        /** "AKTIF" (bawaan server) | "DIUSULKAN" | "DITUTUP" | "DIARSIPKAN" | "ALL". */
        @Query("lifecycle") siklus: String? = null,
        /** "INISIASI" | "PERENCANAAN" | "PELAKSANAAN" | "PENYELESAIAN". */
        @Query("phase") tahap: String? = null,
        @Query("entityId") entityId: String? = null,
        @Query("search") cari: String? = null,
        /** Ambil satu proyek menurut idnya. */
        @Query("id") id: String? = null,
    ): Response<ProjectsListResponse>
}
