package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.KehadiranHapusResponse
import id.co.monitorkarya.core.network.dto.KehadiranSimpanRequest
import id.co.monitorkarya.core.network.dto.KehadiranSimpanResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Kehadiran / cuti (src/app/api/attendance/route.ts) — dipakai Sheet anggota
 * kepala divisi (padanan member-sheet.tsx web, E2E-1 #1).
 *
 *   POST   {userId, status, date?, note?} — catat/ubah; respons membawa `previous`
 *          (null = sebelumnya tanpa catatan) untuk "Urungkan".
 *   DELETE ?userId=&date=                 — hapus catatan (kembali dianggap hadir).
 *
 * Yang boleh mencatat: kepala divisi tim orang itu, Admin PT di PT-nya, Super
 * Admin/TI; selain itu 403. Status di luar HADIR/TERLAMBAT/CUTI/SAKIT/IZIN → 422.
 */
interface AttendanceApi {

    @POST("api/attendance")
    suspend fun simpan(@Body body: KehadiranSimpanRequest): Response<KehadiranSimpanResponse>

    /** [date] "YYYY-MM-DD" WIB; null = hari ini. */
    @DELETE("api/attendance")
    suspend fun hapus(
        @Query("userId") userId: String,
        @Query("date") date: String? = null,
    ): Response<KehadiranHapusResponse>
}
