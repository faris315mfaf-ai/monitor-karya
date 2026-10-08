// Pemroses antrean outbox (RANCANGAN-ANDROID-NATIVE.md §4): satu putaran
// mengirim semua pesan MENUNGGU urut id naik (FIFO). Keputusan akhir selalu
// milik server: 409 beku/terkunci (locked) dan 422 menggagalkan pesan secara
// permanen; luring dan kegagalan sementara hanya menaikkan percobaan dan pesan
// tetap MENUNGGU; sukses menandai BERHASIL lalu menghapus barisnya.
//
// Kontrak ini dikunci tes OutboxProsesTest (T5-B9) — ubah perilaku hanya lewat
// tes lebih dulu. Cara kirim disuntikkan lewat lambda [kirim] supaya prosesor
// bisa diuji tanpa Retrofit: SyncWorker menyuplai penerjemah jenis → panggilan
// API; repositori membangkus panggilan lewat tulisApi (Hasil.kt).
package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxDao
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

/**
 * Pemroses antrean tulisan tertunda. Satu instance boleh dipakai berulang;
 * tiap [prosesAntrean] adalah satu putaran utuh atas potret antrean saat itu.
 *
 * Aturan per hasil [HasilKirim]:
 * - [HasilKirim.Sukses] → tandai BERHASIL lalu hapus (`hapusBerhasil`);
 * - [HasilKirim.GagalPermanen] → GAGAL permanen, `pesanGalat` diisi, baris
 *   TIDAK dihapus (perlu ditindak pengguna, mis. ajukan buka kunci);
 * - [HasilKirim.Luring] / [HasilKirim.GagalSementara] → percobaan naik satu,
 *   status tetap MENUNGGU (putaran berikutnya mencoba lagi).
 *
 * Kegagalan satu pesan (termasuk galat tak terduga dari [kirim]) tidak
 * menghentikan putaran — pesan sesudahnya tetap dicoba.
 */
class OutboxProsesor(
    private val dao: OutboxDao,
    private val kirim: suspend (OutboxEntity) -> HasilKirim,
) {

    /** Proses seluruh antrean MENUNGGU sekali, urut id naik. */
    suspend fun prosesAntrean() {
        val antrean = dao.antrian().first()
        for (pesan in antrean) {
            val hasil = try {
                kirim(pesan)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Lambda kirim seharusnya sudah menangkap (tulisApi); ini
                // pengaman supaya satu pesan tak mematikan putaran.
                @Suppress("TooGenericExceptionCaught")
                HasilKirim.GagalSementara(e.message ?: "Kegagalan tak terduga saat mengirim.")
            }
            when (hasil) {
                is HasilKirim.Sukses -> dao.tandai(
                    id = pesan.id,
                    status = OutboxEntity.STATUS_BERHASIL,
                    pesan = null,
                    percobaan = pesan.percobaan,
                )
                is HasilKirim.GagalPermanen -> dao.tandai(
                    id = pesan.id,
                    status = OutboxEntity.STATUS_GAGAL,
                    pesan = hasil.pesan,
                    percobaan = pesan.percobaan + 1,
                )
                is HasilKirim.Luring -> dao.tandai(
                    id = pesan.id,
                    status = OutboxEntity.STATUS_MENUNGGU,
                    pesan = PESAN_LURING,
                    percobaan = pesan.percobaan + 1,
                )
                is HasilKirim.GagalSementara -> dao.tandai(
                    id = pesan.id,
                    status = OutboxEntity.STATUS_MENUNGGU,
                    pesan = hasil.pesan,
                    percobaan = pesan.percobaan + 1,
                )
            }
        }
        // Baris BERHASIL dihapus setelah putaran (bukan per pesan) supaya
        // putaran yang gagal di tengah tetap meninggalkan jejak yang rapi.
        dao.hapusBerhasil()
    }

    private companion object {
        const val PESAN_LURING = "Perangkat luring. Pesan menunggu jaringan kembali."
    }
}
