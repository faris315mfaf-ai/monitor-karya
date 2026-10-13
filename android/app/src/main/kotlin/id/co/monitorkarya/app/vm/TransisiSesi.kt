// Urutan transisi sesi ke Siap (C3-T3). Dipisah dari SesiViewModel supaya
// urutannya diuji di JVM tanpa Android: data akun lama (Room, outbox, berkas
// antrean, cache gambar) dibersihkan dan uid baru dicatat SEBELUM status Siap
// terbit — shell akun baru tidak pernah tersusun di atas data akun lama.
package id.co.monitorkarya.app.vm

import kotlinx.coroutines.CancellationException

/**
 * Siapkan perangkat untuk [uidBaru] lalu terbitkan status Siap.
 *
 * - [uidLama] null (pertama kali) atau sama: tanpa pembersihan.
 * - Berbeda: [bersihkan] ditunggu sampai selesai, baru [catatUid] dan [terbitkan].
 * - [bersihkan] gagal: uid TIDAK dicatat (percobaan berikutnya mengulang
 *   pembersihan) dan status Siap TIDAK terbit; kembalian false.
 *
 * @return true bila status Siap sudah diterbitkan.
 */
@Suppress("TooGenericExceptionCaught")
internal suspend fun transisiSiap(
    uidBaru: String,
    uidLama: String?,
    bersihkan: suspend () -> Unit,
    catatUid: suspend (String) -> Unit,
    terbitkan: () -> Unit,
): Boolean {
    if (uidLama != null && uidLama != uidBaru) {
        try {
            bersihkan()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return false
        }
    }
    catatUid(uidBaru)
    terbitkan()
    return true
}

/**
 * C5-T3: langkah sebelum memanggil login. Uid sesi aktif dilupakan DULU (pekerja
 * yang mulai sesudahnya tidak mengirim apa pun), lalu pekerja yang sedang
 * berjalan dihentikan dan ditunggu — baru setelah itu cookie akun baru boleh
 * tersimpan. Urutan ini menutup jendela "antrean akun lama terkirim dengan
 * cookie akun baru".
 */
internal suspend fun siapkanMasuk(lupakanSesi: suspend () -> Unit, hentikanPekerja: suspend () -> Unit) {
    lupakanSesi()
    hentikanPekerja()
}

/**
 * Urutan keluar eksplisit (C5-T3 + tinjauan C4): lupakan uid sesi → bersihkan
 * data akun (MesinSinkron.hentikanDanBersihkan: batalkan + tunggu pekerja,
 * clearAllTables = cache_layar + peta_id_lokal + outbox + cache proyek/laporan,
 * berkas bukti antre; lalu cache gambar) → hapus profil → status TanpaSesi.
 * Kegagalan pembersihan tidak menghentikan keluar (uidTerakhir dipertahankan
 * sehingga akun lain yang masuk berikutnya memicu pembersihan ulang), dan
 * potret layar yang mungkin tersisa terkunci uid sehingga tidak terbaca akun lain.
 */
@Suppress("TooGenericExceptionCaught")
internal suspend fun prosesKeluar(
    lupakanSesi: suspend () -> Unit,
    bersihkan: suspend () -> Unit,
    hapusProfil: suspend () -> Unit,
    terbitkanTanpaSesi: suspend () -> Unit,
) {
    runCatching { lupakanSesi() }
    try {
        bersihkan()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        // lanjut: lihat KDoc
    }
    runCatching { hapusProfil() }
    terbitkanTanpaSesi()
}
