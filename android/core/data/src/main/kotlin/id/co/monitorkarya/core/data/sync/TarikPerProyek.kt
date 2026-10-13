// Logika tarik per proyek SyncWorker yang tahan galat per sumber (E2E-R2 N1).
// /api/projects mengembalikan juga proyek entitas terkait yang BUKAN milik
// pengguna; /api/tasks menjawab 403 untuk proyek itu. Dulu 403 pertama
// menghentikan seluruh putaran (proyek sisanya tidak pernah ditarik dan
// terakhirSinkron tidak pernah diperbarui).
package id.co.monitorkarya.core.data.sync

import id.co.monitorkarya.core.data.repo.HasilBaca

/** Ringkasan satu putaran tarik per proyek. */
internal data class RingkasanTarik(
    /** Sumber (proyek × jenis) yang berhasil ditarik. */
    val sukses: Int = 0,
    /** Sumber yang dilewati karena server menolak akses (403/404) — bukan kegagalan sinkron. */
    val dilewati: Int = 0,
    /** Sumber yang gagal (5xx, jawaban rusak, dsb.). */
    val gagal: Int = 0,
    /** Putaran dihentikan dini karena luring / sesi berakhir. */
    val terhenti: Boolean = false,
) {
    /** Sinkron dianggap tuntas (terakhirSinkron boleh dicatat) bila tak ada gagal/terhenti. */
    val lancar: Boolean get() = gagal == 0 && !terhenti
}

/**
 * Tarik laporan lalu tugas tiap proyek. Aturan per sumber:
 * - Sukses → hitung.
 * - 403/404 (proyek di luar tanggung jawab / sudah tidak ada) → lewati sumber
 *   itu saja; tugas proyek yang sama tetap dicoba (laporan bisa terbaca
 *   walau tugas ditolak, dan sebaliknya).
 * - Luring atau 401 → hentikan putaran (semua permintaan berikutnya pasti gagal).
 * - Galat lain → catat gagal, lanjutkan proyek berikutnya.
 */
internal suspend fun tarikPerProyek(
    idProyek: List<String>,
    tarikLaporan: suspend (String) -> HasilBaca<*>,
    tarikTugas: suspend (String) -> HasilBaca<*>,
): RingkasanTarik {
    var r = RingkasanTarik()
    for (id in idProyek) {
        for (tarik in listOf(tarikLaporan, tarikTugas)) {
            when (val hasil = tarik(id)) {
                is HasilBaca.Sukses -> r = r.copy(sukses = r.sukses + 1)
                is HasilBaca.Gagal -> when {
                    hasil.luring || hasil.kodeHttp == HTTP_TIDAK_TERAUTENTIKASI ->
                        return r.copy(terhenti = true)
                    hasil.kodeHttp == HTTP_DITOLAK || hasil.kodeHttp == HTTP_TIDAK_ADA ->
                        r = r.copy(dilewati = r.dilewati + 1)
                    else -> r = r.copy(gagal = r.gagal + 1)
                }
            }
        }
    }
    return r
}

private const val HTTP_TIDAK_TERAUTENTIKASI = 401
private const val HTTP_DITOLAK = 403
private const val HTTP_TIDAK_ADA = 404
