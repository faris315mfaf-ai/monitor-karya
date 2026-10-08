package id.co.monitorkarya.core.network.api

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.GET

/** Ringkasan pemantau (/api/ringkasan). Parsing detail isinya dikerjakan di Fase 1. */
interface RingkasanApi {

    @GET("api/ringkasan")
    suspend fun ringkasan(): Response<JsonObject>
}
