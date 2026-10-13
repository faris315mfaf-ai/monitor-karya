// Pemroses antrean outbox (RANCANGAN-ANDROID-NATIVE.md §4; A1-LURING.md §3).
//
// Satu putaran = potret MENUNGGU + GAGAL urut id naik. Keputusan akhir selalu
// milik server: 409 beku/terkunci dan 422 menggagalkan pesan secara final
// (GAGAL, tampil ke pengguna, tidak diulang otomatis, tidak pernah "ditimpa"
// lokal); luring/gagal sementara hanya menaikkan percobaan (+ backoff untuk
// gagal sementara); sukses menandai BERHASIL lalu barisnya dihapus.
//
// FIFO PER KUNCI DEPENDENSI: pesan dengan [OutboxEntity.kunci] sama tidak
// boleh saling melompati. Bila pesan lebih awal berkunci K belum berhasil
// (gagal sementara, masih backoff, luring, atau GAGAL final), semua pesan K
// sesudahnya DITAHAN pada putaran itu — mis. "serahkan laporan" tidak boleh
// terkirim mendahului "simpan butir" yang gagal. Pesan berkunci berbeda (atau
// kunci null) tetap jalan: satu kegagalan tidak menghentikan putaran.
//
// C5-T2 — TEPAT SATU pemroses: putaran berjalan di bawah KunciSinkron.antrean
// (Mutex proses), dan setiap baris DIKLAIM (MENUNGGU → MENGIRIM, atomik)
// sebelum dikirim. Klaim yatim (proses mati di tengah kiriman) dipulihkan di
// awal putaran sebagai kiriman ambigu (percobaan +1).
// C5-T3 — [bolehKirim] (uid pemilik = uid sesi aktif) diperiksa tepat sebelum
// setiap kiriman; pesan milik orang lain tidak dikirim dan tidak diulang.
// C5-R1 — pesan yang tertahan di belakang GAGAL final tidak memicu retry.
//
// Kontrak dikunci tes OutboxProsesTest — ubah perilaku lewat tes lebih dulu.
package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxDao
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.sync.KunciSinkron
import id.co.monitorkarya.core.network.Idempotensi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Pemroses antrean tulisan tertunda. Satu instance boleh dipakai berulang.
 *
 * @param jam sumber waktu (epoch millis) — disuntik supaya backoff dan batas
 *   7 hari bisa diuji.
 * @param kunciProses Mutex proses-lebar (bawaan KunciSinkron.antrean) —
 *   dua instance pemroses tidak pernah memproses bersamaan.
 * @param bolehKirim penjaga per pesan tepat sebelum kirim (uid pemilik = uid
 *   sesi aktif, C5-T3); false = pesan ditahan tanpa disentuh.
 * @param kirim penerjemah pesan → panggilan API (SyncWorker); repositori
 *   membungkus Retrofit lewat tulisApi sehingga galat sudah jadi [HasilKirim].
 */
class OutboxProsesor(
    private val dao: OutboxDao,
    private val jam: () -> Long = System::currentTimeMillis,
    /** Pembuat kunci idempotensi untuk baris tanpa kunci (disuntik di tes). */
    private val kunciBaru: () -> String = Idempotensi::kunciBaru,
    private val kunciProses: Mutex = KunciSinkron.antrean,
    private val bolehKirim: suspend (OutboxEntity) -> Boolean = { true },
    private val kirim: suspend (OutboxEntity) -> HasilKirim,
) {

    /** Ringkasan satu putaran (dipakai SyncWorker untuk memutuskan ulang/selesai). */
    data class Ringkasan(
        val terkirim: Int = 0,
        val gagalFinal: Int = 0,
        val gagalSementara: Int = 0,
        val luring: Int = 0,
        /** Pesan MENUNGGU yang tidak dicoba karena backoff/luring/gagal sementara di depannya. */
        val ditahan: Int = 0,
        /** Pesan MENUNGGU di belakang GAGAL final — menunggu tindakan pengguna, bukan retry (C5-R1). */
        val tertahanGagal: Int = 0,
        /** Pesan yang pemiliknya bukan sesi aktif (C5-T3) — tidak dikirim, tidak diulang. */
        val bukanPemilik: Int = 0,
        /** id terbesar yang ada di potret putaran ini (0 bila kosong). */
        val idTerbesar: Long = 0,
    ) {
        /** Masih ada yang perlu dicoba lagi nanti oleh pekerja. */
        val perluUlang: Boolean get() = gagalSementara > 0 || luring > 0 || ditahan > 0
    }

    /** Alasan sebuah kunci FIFO tertahan pada putaran ini. */
    private enum class Tahan { SEMENTARA, GAGAL_FINAL, PEMILIK }

    /** Proses seluruh antrean sekali (FIFO per kunci) — tidak pernah bersamaan dengan pemroses lain. */
    suspend fun prosesAntrean(): Ringkasan = kunciProses.withLock { prosesTunggal() }

    private suspend fun prosesTunggal(): Ringkasan {
        val sekarang = jam()
        // Di bawah kunci proses tidak ada klaim lain yang hidup: MENGIRIM yang
        // tersisa = kiriman terputus (proses mati) → ambigu, ulangi.
        dao.pulihkanKlaim()
        // Batas antre 7 hari: MENUNGGU yang terlalu tua jadi GAGAL (tampil), bukan dihapus.
        dao.tandaiKedaluwarsa(sekarang - MASA_ANTRE_MS, PESAN_KEDALUWARSA, PESAN_KEDALUWARSA_AMBIGU)
        dao.hapusGagalLama(sekarang - MASA_SIMPAN_GAGAL_MS)

        val potret = dao.semuaAktif()
        val kunciTertahan = HashMap<String, Tahan>()
        var r = Ringkasan(idTerbesar = potret.maxOfOrNull { it.id } ?: 0L)

        fun tahan(kunci: String?, alasan: Tahan) {
            if (kunci != null && kunci !in kunciTertahan) kunciTertahan[kunci] = alasan
        }

        fun hitungTertahan(alasan: Tahan) {
            r = when (alasan) {
                Tahan.SEMENTARA -> r.copy(ditahan = r.ditahan + 1)
                Tahan.GAGAL_FINAL -> r.copy(tertahanGagal = r.tertahanGagal + 1)
                Tahan.PEMILIK -> r.copy(bukanPemilik = r.bukanPemilik + 1)
            }
        }

        for (pesan in potret) {
            val kunci = pesan.kunci
            if (pesan.status == OutboxEntity.STATUS_GAGAL) {
                // GAGAL final menahan pesan berkunci sama sampai pengguna bertindak.
                tahan(kunci, Tahan.GAGAL_FINAL)
                continue
            }
            val alasanTahan = kunci?.let { kunciTertahan[it] }
            if (alasanTahan != null) {
                hitungTertahan(alasanTahan)
                continue
            }
            if (pesan.berikutnyaPada > sekarang) {
                // Masih backoff: dirinya dan penerus berkunci sama menunggu.
                tahan(kunci, Tahan.SEMENTARA)
                r = r.copy(ditahan = r.ditahan + 1)
                continue
            }

            // Baca ulang sebelum mengirim (B2): pesan sebelumnya pada putaran
            // ini bisa mengganti id lokal di payload penerus (entri luring yang
            // baru mendapat id server), atau pengguna membuangnya.
            val terbaca = dao.ambil(pesan.id)
            if (terbaca == null || terbaca.status != OutboxEntity.STATUS_MENUNGGU) {
                if (terbaca != null) tahan(kunci, Tahan.SEMENTARA)
                continue
            }
            // C5-T3: pesan milik akun lain / tanpa sesi aktif tidak pernah dikirim.
            if (!bolehKirim(terbaca)) {
                tahan(kunci, Tahan.PEMILIK)
                r = r.copy(bukanPemilik = r.bukanPemilik + 1)
                continue
            }
            // Gelombang E: kunci idempotensi DISIMPAN sebelum kiriman pertama
            // (baris tanpa kunci) sehingga percobaan berikutnya — termasuk
            // setelah proses mati — membawa kunci yang SAMA.
            val segar = pastikanKunci(terbaca)
            // C5-T2: klaim atomik; 0 = sudah dibuang/diklaim di antara baca dan kirim.
            if (dao.klaim(segar.id) == 0) continue

            val percobaan = segar.percobaan + 1
            val hasil = try {
                kirim(segar)
            } catch (e: CancellationException) {
                // Pekerja dihentikan di tengah kiriman: lepaskan klaim sebagai ambigu.
                withContext(NonCancellable) {
                    dao.perbarui(segar.id, OutboxEntity.STATUS_MENUNGGU, PESAN_TERPUTUS, percobaan, 0)
                }
                throw e
            } catch (e: Exception) {
                // Lambda kirim seharusnya sudah menangkap (tulisApi); pengaman
                // supaya satu pesan tak mematikan putaran.
                @Suppress("TooGenericExceptionCaught")
                HasilKirim.GagalSementara(e.message ?: "Kegagalan tak terduga saat mengirim.")
            }
            when (hasil) {
                is HasilKirim.Sukses -> {
                    dao.perbarui(segar.id, OutboxEntity.STATUS_BERHASIL, null, percobaan, 0)
                    r = r.copy(terkirim = r.terkirim + 1)
                }
                is HasilKirim.GagalPermanen -> {
                    dao.perbarui(segar.id, OutboxEntity.STATUS_GAGAL, hasil.pesan, percobaan, 0)
                    tahan(kunci, Tahan.GAGAL_FINAL)
                    r = r.copy(gagalFinal = r.gagalFinal + 1)
                }
                is HasilKirim.Luring -> {
                    // Tanpa backoff: begitu jaringan kembali, pesan langsung dicoba.
                    dao.perbarui(segar.id, OutboxEntity.STATUS_MENUNGGU, PESAN_LURING, percobaan, 0)
                    tahan(kunci, Tahan.SEMENTARA)
                    r = r.copy(luring = r.luring + 1)
                }
                is HasilKirim.GagalSementara -> {
                    dao.perbarui(
                        segar.id,
                        OutboxEntity.STATUS_MENUNGGU,
                        hasil.pesan,
                        percobaan,
                        sekarang + jedaBackoff(percobaan),
                    )
                    tahan(kunci, Tahan.SEMENTARA)
                    r = r.copy(gagalSementara = r.gagalSementara + 1)
                }
            }
        }
        // Baris BERHASIL dihapus setelah putaran supaya putaran yang terputus
        // di tengah tetap meninggalkan jejak rapi.
        dao.hapusBerhasil()
        return r
    }

    private suspend fun pastikanKunci(pesan: OutboxEntity): OutboxEntity {
        if (pesan.kunciIdempotensi != null) return pesan
        dao.isiKunciIdempotensi(pesan.id, kunciBaru())
        // Baca ulang: UPDATE hanya mengisi bila masih null (kunci pemenang dipakai).
        return dao.ambil(pesan.id) ?: pesan
    }

    companion object {
        /** 7 hari — umur maksimum pesan menunggu di antrean (Rancangan §4). */
        const val MASA_ANTRE_MS: Long = 7L * 24 * 60 * 60 * 1000

        /** GAGAL yang tak pernah ditindak dibuang setelah 30 hari. */
        const val MASA_SIMPAN_GAGAL_MS: Long = 30L * 24 * 60 * 60 * 1000

        const val JEDA_DASAR_MS: Long = 30_000
        const val JEDA_MAKS_MS: Long = 30L * 60 * 1000

        const val PESAN_LURING = "Perangkat luring. Pesan menunggu jaringan kembali."
        const val PESAN_TERPUTUS = "Pengiriman terputus. Dicoba lagi otomatis."
        const val PESAN_KEDALUWARSA =
            "Tidak terkirim dalam 7 hari sehingga dibatalkan. Periksa data lalu kirim ulang bila masih perlu."

        /**
         * C5-R4: pesan kedaluwarsa yang PERNAH dicoba mungkin sudah tersimpan di
         * server (kiriman terputus) dan kunci idempotensi server berlaku 7 hari —
         * "Kirim ulang" bisa menggandakan. Pengguna diperingatkan.
         */
        const val PESAN_KEDALUWARSA_AMBIGU =
            "Tidak terkirim dalam 7 hari sehingga dibatalkan. Pengiriman sebelumnya terputus, jadi " +
                "perubahan ini mungkin sudah tersimpan di server. Periksa data di server sebelum kirim ulang."

        /** Backoff eksponensial: 30 dtk, 1 mnt, 2 mnt, ... maksimum 30 menit. */
        fun jedaBackoff(percobaan: Int): Long {
            val pangkat = (percobaan - 1).coerceIn(0, 16)
            return (JEDA_DASAR_MS shl pangkat).coerceAtMost(JEDA_MAKS_MS)
        }
    }
}
