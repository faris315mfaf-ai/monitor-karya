package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.GantiSandiRequest
import id.co.monitorkarya.core.network.dto.LoginRequest
import id.co.monitorkarya.core.network.dto.LoginResponse
import id.co.monitorkarya.core.network.dto.MeResponse
import id.co.monitorkarya.core.network.dto.OkResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** Rute autentikasi dan profil sandi (baseUrl diakhiri "/"). */
interface AuthApi {

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    @GET("api/auth/me")
    suspend fun saya(): Response<MeResponse>

    @POST("api/auth/logout")
    suspend fun keluar(): Response<Unit>

    @POST("api/profile/password")
    suspend fun gantiSandi(@Body body: GantiSandiRequest): Response<OkResponse>
}
