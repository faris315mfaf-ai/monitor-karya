// Pencatat draf otomatis per ViewModel (G1, 13 Okt 2026) — lihat
// core/data/repo/DrafSunting.kt untuk keputusan pemilik dan kunci draf.
//
// Dua jalur tulis, SATU antrean berurutan:
// - [catat]: dipanggil setiap isian Sheet berubah; ditulis setelah
//   [jedaMs] tanpa perubahan lagi. Melindungi isian bila proses mati
//   (aplikasi digeser dari layar terbaru, RAM habis) sebelum Sheet ditutup.
// - [segera]: Sheet ditutup (Batal/Selesai/geser/Kembali) atau simpan sukses
//   (json null = buang). Catatan tertunda dibatalkan dulu, jadi isian lama
//   tidak pernah menimpa keputusan terakhir.
// [ambil] ikut antrean, sehingga membuka lagi Sheet tepat setelah menutupnya
// membaca draf yang baru saja ditulis.
package id.co.monitorkarya.app.ui.draf

import id.co.monitorkarya.core.data.repo.Draf
import id.co.monitorkarya.core.data.repo.KunciDraf
import id.co.monitorkarya.core.data.repo.PenyimpanDraf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PencatatDraf(
    private val scope: CoroutineScope,
    private val penyimpan: PenyimpanDraf,
    private val jedaMs: Long = JEDA_MS,
) {
    private val antre = Channel<suspend () -> Unit>(Channel.UNLIMITED)
    private var tertunda: Job? = null

    init {
        scope.launch {
            for (op in antre) {
                try {
                    op()
                } catch (e: CancellationException) {
                    throw e
                } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                    // Draf hanya pelengkap — antrean tetap berjalan.
                }
            }
        }
    }

    /** Isian terbaru [json] untuk [kunci] (null = buang); ditulis setelah jeda tanpa perubahan. */
    fun catat(kunci: KunciDraf, json: String?) {
        tertunda?.cancel()
        tertunda = scope.launch {
            delay(jedaMs)
            antre.trySend(tulis(kunci, json))
        }
    }

    /** Tulis sekarang (Sheet ditutup / simpan sukses); catatan tertunda dibatalkan. */
    fun segera(kunci: KunciDraf, json: String?) {
        batalTertunda()
        antre.trySend(tulis(kunci, json))
    }

    /** Batalkan catatan tertunda tanpa menulis apa pun. */
    fun batalTertunda() {
        tertunda?.cancel()
        tertunda = null
    }

    /** Draf [kunci] setelah seluruh tulisan yang sudah diantre selesai. */
    suspend fun ambil(kunci: KunciDraf): Draf? {
        val hasil = CompletableDeferred<Draf?>()
        antre.send {
            try {
                hasil.complete(penyimpan.ambil(kunci))
            } finally {
                hasil.complete(null)
            }
        }
        return hasil.await()
    }

    private fun tulis(kunci: KunciDraf, json: String?): suspend () -> Unit = {
        if (json != null) penyimpan.simpan(kunci, json) else penyimpan.buang(kunci)
    }

    companion object {
        /** Jeda tulis saat mengetik (ms). */
        const val JEDA_MS: Long = 600
    }
}
