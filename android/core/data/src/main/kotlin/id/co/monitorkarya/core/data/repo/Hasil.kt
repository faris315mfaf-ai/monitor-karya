// Hasil operasi repositori + pembungkus panggilan Retrofit bersama.
// Semua tulis jujur daring (Rancangan §4): hasil server final, tidak pernah
// ditimpa lokal; luring tidak pernah dianggap terkirim.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.Idempotensi
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.CancellationException
import retrofit2.Response
import retrofit2.HttpException

/**
 * Hasil operasi tulis (kirim laporan, tulis/hapus task, unggah/hapus bukti,
 * dan item outbox). Padanan "Hasil" pada kontrak T5-B2: `HasilKirim.Luring`
 * adalah "Hasil.Luring" di dokumen tugas.
 */
sealed interface HasilKirim {

    /**
     * Server menerima operasi; tidak ada pesan wajib. [ulangan] = jawaban
     * diambil dari simpanan idempotensi server (`Idempotency-Replayed: true`,
     * gelombang E) — tetap sukses biasa: badannya = badan sukses pertama.
     */
    data class Sukses(val pesan: String? = null, val ulangan: Boolean = false) : HasilKirim

    /**
     * Perangkat luring atau server tak terjangkau. Operasi TIDAK dikirim dan
     * TIDAK dianggap sukses — kirim luring tidak diizinkan (Rancangan §4).
     */
    data object Luring : HasilKirim

    /**
     * Server menolak final (409 beku/terlambat/tenggat, 422 validasi, dsb.).
     * Perlu ditindak pengguna; tidak diulang otomatis.
     */
    data class GagalPermanen(val pesan: String) : HasilKirim

    /** Kegagalan sementara (429, 5xx, sesi berakhir) — boleh dicoba lagi. */
    data class GagalSementara(val pesan: String) : HasilKirim

    companion object {

        /** Terjemahkan ApiError jadi keputusan kirim; pesan siap tampil. */
        fun dari(galat: ApiError): HasilKirim = when (galat) {
            is ApiError.Jaringan -> Luring
            // Sesi habis / wajib ganti sandi: ulangi setelah pengguna masuk lagi.
            is ApiError.TidakTerautentikasi -> GagalSementara(galat.pesanTampil())
            is ApiError.WajibGantiSandi -> GagalSementara(galat.pesanTampil())
            is ApiError.TerlaluBanyakPesan -> GagalSementara(galat.pesanTampil())
            is ApiError.Server -> GagalSementara(galat.pesanTampil())
            // Keputusan domain server bersifat final (Rancangan §4 butir 2) —
            // KECUALI 409 locked:false: tabrakan simpan bersamaan (P2002) yang
            // justru diminta server untuk dicoba ulang
            // (src/app/api/daily-input/route.ts cabang P2002; audit T5-B9 A7).
            is ApiError.Konflik -> if (galat.locked == false) {
                GagalSementara(galat.pesanTampil())
            } else {
                GagalPermanen(galat.pesanTampil())
            }
            is ApiError.Validasi -> GagalPermanen(galat.pesanTampil())
            is ApiError.Lainnya -> GagalPermanen(galat.pesanTampil())
        }
    }
}

/** Hasil operasi baca/tarik: data atau pesan galat siap tampil. */
sealed interface HasilBaca<out T> {
    data class Sukses<out T>(val data: T) : HasilBaca<T>
    /**
     * [kodeHttp] = kode status bila server menjawab (mis. 403 proyek di luar
     * tanggung jawab); [luring] = server tak terjangkau (IOException). Keduanya
     * dipakai SyncWorker untuk memutuskan lewati sumber vs hentikan putaran (E2E-R2 N1).
     */
    data class Gagal(val pesan: String, val kodeHttp: Int? = null, val luring: Boolean = false) : HasilBaca<Nothing>
}

/**
 * Jalankan panggilan baca Retrofit (gaya `Response<T>` seperti AuthApi F0).
 * IOException dianggap luring/galat jaringan; galat HTTP diterjemahkan
 * ApiError supaya pesannya berbahasa Indonesia.
 */
internal suspend fun <T> bacaApi(blok: suspend () -> Response<T>): HasilBaca<T> =
    try {
        val jawaban = blok()
        when {
            jawaban.isSuccessful -> {
                val isi = jawaban.body()
                if (isi != null) {
                    HasilBaca.Sukses(isi)
                } else {
                    HasilBaca.Gagal("Jawaban server kosong.")
                }
            }
            else -> HasilBaca.Gagal(ApiError.dari(HttpException(jawaban)).pesanTampil(), kodeHttp = jawaban.code())
        }
    } catch (e: IOException) {
        HasilBaca.Gagal(ApiError.dari(e).pesanTampil(), luring = true)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        // Sisa galat (mis. seri JSON rusak) tetap jadi pesan, tidak membiarkan
        // coroutine mati tanpa kabar.
        @Suppress("TooGenericExceptionCaught")
        HasilBaca.Gagal(ApiError.dari(e).pesanTampil())
    }

/**
 * Jalankan panggilan tulis Retrofit; [saatSukses] memproses badan jawaban
 * (menyimpan ke Room, memperbarui jumlah bukti, dsb.) sebelum hasil dibalik.
 * IOException = luring; sisanya lewat [HasilKirim.dari]. Jawaban ulangan
 * idempotensi (200 + `Idempotency-Replayed: true`) = sukses biasa:
 * [saatSukses] tetap dijalankan atas badan pertama (mis. id lokal → id server).
 */
internal suspend fun <T> tulisApi(
    blok: suspend () -> Response<T>,
    saatSukses: suspend (T?) -> Unit = {},
): HasilKirim = tulisApiDengan(blok, selesaiBila404 = false, saatSukses = saatSukses)

/**
 * Varian HAPUS (gelombang E): bila [mungkinSudahTerhapus] (percobaan
 * sebelumnya berakhir ambigu — luring/IOException atau 5xx, sehingga server
 * BISA saja sudah menghapus) maka 404 "tidak ditemukan" dianggap selesai:
 * keadaan yang diminta (data tidak ada) sudah tercapai. Pada percobaan
 * pertama 404 tetap galat final (data memang tidak ada sejak awal → pengguna
 * perlu tahu). Dengan kunci idempotensi ulangan dalam 7 hari dibalas 200
 * pertama sehingga cabang ini hanya jaring pengaman (kunci kedaluwarsa,
 * baris pra-gelombang E, atau dihapus pihak lain di antara percobaan).
 */
internal suspend fun <T> hapusApi(
    mungkinSudahTerhapus: Boolean,
    blok: suspend () -> Response<T>,
    saatSukses: suspend (T?) -> Unit = {},
): HasilKirim = tulisApiDengan(blok, selesaiBila404 = mungkinSudahTerhapus, saatSukses = saatSukses)

/** Pesan Sukses untuk hapus yang ternyata sudah terhapus sebelumnya. */
internal const val PESAN_SUDAH_TERHAPUS = "Sudah terhapus di server (percobaan sebelumnya berhasil)."

private suspend fun <T> tulisApiDengan(
    blok: suspend () -> Response<T>,
    selesaiBila404: Boolean,
    saatSukses: suspend (T?) -> Unit,
): HasilKirim =
    try {
        val jawaban = blok()
        when {
            jawaban.isSuccessful -> {
                saatSukses(jawaban.body())
                HasilKirim.Sukses(ulangan = Idempotensi.ulangan(jawaban))
            }
            selesaiBila404 && jawaban.code() == HTTP_TIDAK_DITEMUKAN -> {
                saatSukses(null)
                HasilKirim.Sukses(pesan = PESAN_SUDAH_TERHAPUS)
            }
            else -> HasilKirim.dari(ApiError.dari(HttpException(jawaban)))
        }
    } catch (e: IOException) {
        HasilKirim.Luring
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        @Suppress("TooGenericExceptionCaught")
        HasilKirim.dari(ApiError.dari(e))
    }

private const val HTTP_TIDAK_DITEMUKAN = 404

/** ISO-8601 (mis. "2026-10-08T00:00:00.000Z" atau "2026-10-08") jadi epoch millis. */
internal fun isoKeEpochMillis(nilai: String?): Long? =
    nilai?.let { mentah ->
        runCatching { Instant.parse(mentah).toEpochMilli() }
            .recoverCatching { Wib.keEpochMillis(LocalDate.parse(mentah.substringBefore('T'))) }
            .getOrNull()
    }

/** ISO-8601 jadi tanggal kalender WIB; null bila kosong/tidak terbaca. */
internal fun isoKeLocalDate(nilai: String?): LocalDate? =
    nilai?.let { mentah ->
        runCatching { Instant.parse(mentah).atZone(Wib.ZONA).toLocalDate() }
            .recoverCatching { LocalDate.parse(mentah.substringBefore('T')) }
            .getOrNull()
    }

/**
 * ISO-8601 jadi instan SEPERTI JavaScript `new Date(str)`: stempel penuh apa
 * adanya, kunci tanggal "YYYY-MM-DD" = tengah malam UTC (bukan WIB). Dipakai
 * untuk membandingkan tenggat persis seperti project-status.ts di server.
 */
internal fun isoKeInstanServer(nilai: String?): Instant? =
    nilai?.let { mentah ->
        runCatching { Instant.parse(mentah) }
            .recoverCatching { LocalDate.parse(mentah.substringBefore('T')).atStartOfDay(ZoneOffset.UTC).toInstant() }
            .getOrNull()
    }
