// Repositori Fase 2 — kepatuhan laporan per divisi untuk Admin PT [F2-ADMIN]
// (04-admin-pt.md §4–5). Sumber: GET /api/admin/compliance dan POST
// /api/admin/compliance/remind. Data berbentuk potret harian yang berubah
// tiap tarikan, jadi cukup dipegang di memori StateFlow — Room tidak dipakai
// (tidak ada entitas yang kurang); potret lama tetap berlaku bila galat.
// "Ingatkan" jujur daring: 409 "sudah diingatkan"/kunci 17.00 dan 429
// diteruskan apa adanya ke pemanggil lewat HasilKirim.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.AdminComplianceApi
import id.co.monitorkarya.core.network.dto.IngatkanRequest
import id.co.monitorkarya.core.network.dto.KepatuhanResponse
import id.co.monitorkarya.core.network.dto.MingguanDivisiDto
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException

/** Kepatuhan laporan per divisi: tarik ke memori, ingatkan yang belum lapor. */
@Singleton
class KepatuhanRepo @Inject constructor() {

    private val _data = MutableStateFlow<KepatuhanResponse?>(null)

    /** Potret kepatuhan terakhir yang berhasil ditarik; null berarti belum ada. */
    val data: StateFlow<KepatuhanResponse?> = _data.asStateFlow()

    /**
     * Tarik peta kepatuhan (GET /api/admin/compliance?entityId=…). Peran grup
     * boleh mempersempit ke satu PT lewat [entityId]; Admin PT/Direktur selalu
     * PT-nya sendiri (entityId diabaikan server).
     */
    suspend fun tarik(api: AdminComplianceApi, entityId: String? = null): HasilBaca<Unit> =
        when (val hasil = bacaApi { api.kepatuhan(entityId) }) {
            is HasilBaca.Gagal -> hasil
            is HasilBaca.Sukses -> {
                _data.value = hasil.data
                HasilBaca.Sukses(Unit)
            }
        }

    /** Ingatkan satu orang untuk semua proyeknya yang belum terkirim. */
    suspend fun ingatkanOrang(api: AdminComplianceApi, userId: String): HasilKirim =
        ingatkan(api, IngatkanRequest.orang(userId))

    /** Ingatkan semua orang satu divisi yang belum lapor. */
    suspend fun ingatkanDivisi(api: AdminComplianceApi, divisionId: String): HasilKirim =
        ingatkan(api, IngatkanRequest.divisi(divisionId))

    /** Ingatkan semua PIC di PT akun yang belum lapor (tombol hero). */
    suspend fun ingatkanSemua(api: AdminComplianceApi): HasilKirim =
        ingatkan(api, IngatkanRequest.semua())

    /**
     * Semua pengingat melalui satu pintu: 409/429/5xx dipetakan [HasilKirim.dari]
     * (pesan server apa adanya); sukses membawa jumlah terkirim sebagai pesan.
     */
    private suspend fun ingatkan(api: AdminComplianceApi, permintaan: IngatkanRequest): HasilKirim =
        try {
            val jawaban = api.ingatkan(permintaan)
            if (jawaban.isSuccessful) {
                HasilKirim.Sukses(pesan = "${jawaban.body()?.sent ?: 0} pengingat terkirim")
            } else {
                HasilKirim.dari(ApiError.dari(HttpException(jawaban)))
            }
        } catch (e: IOException) {
            HasilKirim.Luring
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            @Suppress("TooGenericExceptionCaught")
            HasilKirim.dari(ApiError.dari(e))
        }
}

/**
 * Kosa kata + label state kepatuhan mingguan divisi (src/lib/admin-compliance.ts,
 * dikunci tes MingguanStatusTest zona data). Nilai kawat sama persis dengan
 * [MingguanDivisiDto] agar tiga zona (domain/data/jaringan) satu istilah.
 */
object KepatuhanDivisi {
    const val STATE_MASUK = MingguanDivisiDto.STATE_MASUK
    const val STATE_TERLAMBAT = MingguanDivisiDto.STATE_TERLAMBAT
    const val STATE_BELUM = MingguanDivisiDto.STATE_BELUM

    /** Label tampil; state tak dikenal dari server baru ditampilkan apa adanya. */
    fun labelState(state: String): String = when (state) {
        STATE_MASUK -> "Masuk"
        STATE_TERLAMBAT -> "Terlambat"
        STATE_BELUM -> "Belum masuk"
        else -> state
    }
}
