package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.UndoRequest
import id.co.monitorkarya.core.network.dto.UndoResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Urungkan tindakan (src/app/api/undo/route.ts). Tiket diterbitkan route
 * tindakan asal sebagai kolom `undoToken` pada responsnya (mis. PATCH projects
 * saat arsip/ajukan ulang, penerusan laporan di Penerimaan); berlaku 15 menit,
 * sekali pakai, hanya pelaku yang sama. Fase 1: PIC tidak menerima tiket dari
 * route manapun yang ia pakai — antarmuka ini disiapkan untuk paritas toast
 * "Urungkan" (alur src/lib/undo-client.ts).
 */
interface UndoApi {

    /** Urungkan satu tindakan menurut tiketnya. */
    @POST("api/undo")
    suspend fun urungkan(@Body body: UndoRequest): Response<UndoResponse>
}
