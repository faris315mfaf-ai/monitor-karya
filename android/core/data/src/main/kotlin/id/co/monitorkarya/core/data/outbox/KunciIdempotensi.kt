// Kunci idempotensi pesan outbox (gelombang E; android/docs/fase3/E-ANDROID.md).
//
// Daur hidup satu kunci:
//   1. dibuat SEKALI saat pesan diantre (AntreanOutbox.antre) — atau diwarisi
//      dari kiriman daring langsung yang jatuh ke antrean (badan SAMA, kunci
//      SAMA: bila server sudah commit sebelum jaringan putus, ulangan dari
//      antrean dibalas respons pertama, bukan entri/bukti ganda);
//   2. disimpan di kolom outbox.kunciIdempotensi (Room v5);
//   3. dikirim apa adanya pada SETIAP percobaan (luring, 5xx, backoff, proses
//      mati, "Kirim ulang" setelah GAGAL) — tidak pernah dibuat ulang;
//   4. baris lama (sebelum v5) diisi UUID oleh MIGRASI_4_5; baris yang tetap
//      null (ditulis jalur lain) diisi OutboxProsesor sebelum kiriman pertama.
package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.network.Idempotensi

/**
 * Kunci untuk pesan yang baru diantre: [diberikan] (kunci kiriman daring yang
 * gagal jaringan) bila bentuknya sah, selain itu UUID v4 baru.
 */
internal fun kunciIdempotensiAntre(diberikan: String?, baru: () -> String = Idempotensi::kunciBaru): String =
    diberikan?.takeIf(Idempotensi::sah) ?: baru()

/**
 * Nilai header `Idempotency-Key` untuk pesan ini: kunci tersimpan bila
 * jenisnya beridempotensi di server dan bentuknya sah; null = header tidak
 * dikirim (rute mingguan, atau kunci rusak — server akan 400 bila dikirim).
 */
internal fun OutboxEntity.headerIdempotensi(): String? =
    kunciIdempotensi?.takeIf { jenis in JenisOutbox.BERIDEMPOTENSI && Idempotensi.sah(it) }
