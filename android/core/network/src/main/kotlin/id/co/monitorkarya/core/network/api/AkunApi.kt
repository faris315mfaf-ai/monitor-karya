package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.AkunBaruRequest
import id.co.monitorkarya.core.network.dto.AkunResponse
import id.co.monitorkarya.core.network.dto.AkunUbahRequest
import id.co.monitorkarya.core.network.dto.AktivasiTersediaResponse
import id.co.monitorkarya.core.network.dto.KeanggotaanDivisiDto
import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.TerbitkanAktivasiRequest
import id.co.monitorkarya.core.network.dto.TerbitkanAktivasiResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Meja akun (/api/companies/users) — Super Admin, dan sejak 5 Okt 2026 juga
 * Admin PT untuk PT-nya sendiri (hanya ADMIN_PT/KEPALA_DIVISI/PIC_PROYEK;
 * Direktur Entitas dan akun grup tetap milik Super Admin).
 *
 *   GET ?id=          — keanggotaan divisi satu akun (untuk sheet akun).
 *   POST              — tambah akun; respons {ok, account}.
 *   PATCH             — ubah akun (nama, username, email, jabatan, peran,
 *                       perusahaan, isActive, tautan divisi/proyek; password
 *                       = setel ulang sandi dan paksa ganti saat masuk);
 *                       respons {ok, account}.
 *   DELETE ?id=       — hapus akun; laporannya tetap ada dengan penulis
 *                       kosong, hanya tautan pimpinannya yang dilepas.
 *
 * Pagar 409: akun sendiri tak bisa dinonaktifkan/dihapus; Super Admin aktif
 * terakhir tak bisa diturunkan/dinonaktifkan/dihapus. Galat 422 memakai
 * pesan aman klien (username/email dipakai, sandi lemah, dsb.).
 *
 * Aktivasi (/api/companies/users/activation) — untuk akun baru yang sudah
 * disetujui tapi belum pernah masuk:
 *   GET ?id=  — {canActivate: true} atau galat (404 di luar jangkauan,
 *               409 tidak menunggu aktivasi).
 *   POST      — terbitkan ulang tautan {ok, activation:{userId, username,
 *               path, expiresAt}}; token hanya di fragmen path, berlaku
 *               24 jam; dibatasi 20/pengelola dan 5/akun per 15 menit (429).
 */
interface AkunApi {

    @GET("api/companies/users")
    suspend fun keanggotaan(@Query("id") id: String): Response<KeanggotaanDivisiDto>

    @POST("api/companies/users")
    suspend fun tambah(@Body body: AkunBaruRequest): Response<AkunResponse>

    @PATCH("api/companies/users")
    suspend fun ubah(@Body body: AkunUbahRequest): Response<AkunResponse>

    @DELETE("api/companies/users")
    suspend fun hapus(@Query("id") id: String): Response<OkResponse>

    @GET("api/companies/users/activation")
    suspend fun ketersediaanAktivasi(@Query("id") userId: String): Response<AktivasiTersediaResponse>

    @POST("api/companies/users/activation")
    suspend fun terbitkanAktivasi(@Body body: TerbitkanAktivasiRequest): Response<TerbitkanAktivasiResponse>
}
