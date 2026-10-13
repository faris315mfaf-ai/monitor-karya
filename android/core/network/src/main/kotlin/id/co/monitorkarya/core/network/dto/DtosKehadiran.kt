package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.Serializable

/** Badan POST /api/attendance. [date] null = hari ini (WIB); [note] maks 300 huruf. */
@Serializable
data class KehadiranSimpanRequest(
    val userId: String,
    val status: String,
    val note: String? = null,
    val date: String? = null,
)

/** Catatan kehadiran sebelum diubah — untuk "Urungkan". */
@Serializable
data class KehadiranSebelumnyaDto(
    val status: String,
    val note: String? = null,
)

@Serializable
data class KehadiranBarisDto(
    val userId: String,
    val name: String? = null,
    val date: String,
    val status: String,
    val note: String? = null,
)

/** Respons POST: {ok, row, previous} — previous null bila hari itu belum dicatat. */
@Serializable
data class KehadiranSimpanResponse(
    val ok: Boolean = false,
    val row: KehadiranBarisDto? = null,
    val previous: KehadiranSebelumnyaDto? = null,
)

/** Respons DELETE: {ok, removed}. */
@Serializable
data class KehadiranHapusResponse(
    val ok: Boolean = false,
    val removed: Int = 0,
)
