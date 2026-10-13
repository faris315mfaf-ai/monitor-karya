// Kunci proses-lebar sinkronisasi (C5-T2/T3).
//
// WorkManager menjalankan DUA nama unik (sekali-jalan + berkala) atas kelas
// SyncWorker yang sama; keduanya bisa jatuh tempo pada detik yang sama saat
// jaringan kembali. Semua pekerja berada di proses aplikasi yang sama, jadi
// satu Mutex proses cukup untuk menjamin TEPAT SATU pemroses antrean pada satu
// waktu:
//   - [kerja]   : seluruh SyncWorker.doWork (kirim antrean + tarik). Pekerja
//                 kedua MENUNGGU (bukan dilewati) sehingga pemicunya tidak
//                 hilang — begitu yang pertama selesai, ia memproses tulisan
//                 yang masuk sementara itu. Pembersihan akun
//                 (MesinSinkron.hentikanDanBersihkan) memegang kunci ini selama
//                 mengosongkan Room sehingga pekerja lama tidak menulis/mengirim
//                 di tengah pembersihan.
//   - [antrean] : satu putaran OutboxProsesor (diambil di dalam [kerja]; urutan
//                 kunci selalu kerja → antrean, tanpa jalan balik → bebas
//                 deadlock). Melindungi pemulihan klaim yatim (MENGIRIM →
//                 MENUNGGU) dari pemroses lain.
// Jaring kedua di Room: klaim baris `UPDATE … SET status='MENGIRIM' WHERE
// status='MENUNGGU'` (OutboxDao.klaim) — baris yang sudah diklaim/dibuang tidak
// pernah dikirim dua kali.
package id.co.monitorkarya.core.data.sync

import kotlinx.coroutines.sync.Mutex

object KunciSinkron {
    /** Satu SyncWorker (kirim + tarik) atau satu pembersihan akun pada satu waktu. */
    val kerja: Mutex = Mutex()

    /** Satu putaran OutboxProsesor pada satu waktu. */
    val antrean: Mutex = Mutex()
}

/**
 * Pesan boleh dikirim dengan sesi saat ini hanya bila pemiliknya = uid sesi
 * aktif (C5-T3). Tanpa sesi aktif (keluar, 401, sedang masuk akun lain) tidak
 * ada yang dikirim; pesan tanpa pemilik (baris pra-v6 yang belum diadopsi)
 * juga ditahan.
 */
fun pemilikSah(pemilikUid: String?, uidSesiAktif: String?): Boolean =
    uidSesiAktif != null && pemilikUid == uidSesiAktif
