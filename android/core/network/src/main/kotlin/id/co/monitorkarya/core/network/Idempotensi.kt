// Kunci idempotensi tulis (gelombang E; kontrak server android/docs/fase3/E-IDEMPOTENSI.md).
//
// Satu kunci = satu maksud tulis. Kunci dibuat SEKALI (saat pesan masuk outbox
// atau saat Sheet entri baru dibuka) lalu dikirim ulang APA ADANYA pada setiap
// percobaan; server membalas ulangan dengan respons sukses pertama ditambah
// header `Idempotency-Replayed: true`. Jangan pernah memakai satu kunci untuk
// dua maksud berbeda (server: 422 bila rutenya lain, respons lama bila sama).
package id.co.monitorkarya.core.network

import java.util.UUID
import retrofit2.Response

object Idempotensi {

    /** Header permintaan (rute: POST/PUT/DELETE /api/tasks, PUT /api/daily-input, POST /api/evidence/upload). */
    const val HEADER = "Idempotency-Key"

    /** Header respons yang diambil dari simpanan server (ulangan kunci yang sama). */
    const val HEADER_ULANGAN = "Idempotency-Replayed"

    /** Pola server (`src/lib/idempotency.ts` KEY_PATTERN): 8–64 karakter, diawali huruf/angka. */
    private val POLA = Regex("^[A-Za-z0-9][A-Za-z0-9_.:-]{7,63}$")

    /** Kunci baru: UUID v4 (36 karakter, sesuai saran server). */
    fun kunciBaru(): String = UUID.randomUUID().toString()

    /** Bentuk kunci diterima server (selain itu server membalas 400 dan tidak menulis apa pun). */
    fun sah(kunci: String?): Boolean = kunci != null && POLA.matches(kunci)

    /** Respons ini ulangan dari simpanan server (bukan tulisan baru). */
    fun ulangan(res: Response<*>): Boolean = res.headers()[HEADER_ULANGAN].equals("true", ignoreCase = true)
}
