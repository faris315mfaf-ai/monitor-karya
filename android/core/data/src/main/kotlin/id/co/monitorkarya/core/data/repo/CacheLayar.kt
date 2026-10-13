// Potret bacaan layar untuk luring (B2; Rancangan §4 butir 1 "Data basi
// ditandai"). Layar daring-dulu: setiap tarik sukses menyimpan respons server
// apa adanya; saat jaringan gagal layar membaca potret terakhir dan menampilkan
// "Luring · data tersimpan HH.MM". Isi dihapus saat keluar akun
// (clearAllTables) dan otomatis setelah 14 hari.
//
// C5-T4 / C3-T3 lanjutan: setiap kunci DIAWALI uid sesi aktif
// ("u:<uid>|..."). Potret akun lain tidak pernah terbaca walau pembersihan
// Room gagal, dan tanpa sesi aktif tidak ada yang disimpan/dibaca. Kunci
// layar yang bergantung hari memuat tanggal WIB nyata (bukan "hari-ini"),
// sehingga mulai luring esok hari tidak memakai potret kemarin sebagai hari ini.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.CacheLayarEntity
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.network.mkJson
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.serialization.KSerializer

/** Satu potret: nilai terdekode + kapan disimpan (epoch millis). */
data class Tersimpan<T>(val nilai: T, val disimpanPada: Long)

@Singleton
class CacheLayar @Inject constructor(db: MkDatabase, private val prefs: MkPrefs) {

    private val dao = db.cacheLayarDao()

    private suspend fun kunciPenuh(kunci: String): String? =
        runCatching { prefs.uidSesi.first() }.getOrNull()?.let { kunciPengguna(it, kunci) }

    /** Simpan [nilai] untuk [kunci]; kegagalan tulis cache tidak boleh menggagalkan layar. */
    suspend fun <T> simpan(kunci: String, serializer: KSerializer<T>, nilai: T, sekarang: Long = System.currentTimeMillis()) {
        try {
            val penuh = kunciPenuh(kunci) ?: return
            dao.simpan(CacheLayarEntity(kunci = penuh, json = mkJson.encodeToString(serializer, nilai), disimpanPada = sekarang))
            dao.hapusLama(sekarang - MASA_SIMPAN_MS)
        } catch (e: CancellationException) {
            throw e
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            // Cache hanya pelengkap; layar tetap memakai data daring.
        }
    }

    /** Potret terakhir untuk [kunci]; null bila tidak ada atau bentuknya sudah tidak cocok. */
    suspend fun <T> ambil(kunci: String, serializer: KSerializer<T>): Tersimpan<T>? {
        val penuh = kunciPenuh(kunci) ?: return null
        val baris = runCatching { dao.ambil(penuh) }.getOrNull() ?: return null
        val nilai = runCatching { mkJson.decodeFromString(serializer, baris.json) }.getOrNull() ?: return null
        return Tersimpan(nilai, baris.disimpanPada)
    }

    companion object {
        /** Potret lebih tua dari 14 hari dibuang. */
        const val MASA_SIMPAN_MS: Long = 14L * 24 * 60 * 60 * 1000

        /** Kunci baris Room: uid pemilik + kunci layar (C5-T4). */
        fun kunciPengguna(uid: String, kunci: String): String = "u:$uid|$kunci"

        /** Meja laporan harian tanggal WIB [tanggalIso] ("YYYY-MM-DD"). */
        fun mejaLaporan(tanggalIso: String): String = "laporan:meja:$tanggalIso"

        /**
         * Potret meja "hari ini" terakhir yang berhasil ditarik (tanggal apa
         * pun): dasar meja hari baru saat mulai luring esok hari (C5-T4).
         */
        const val MEJA_LAPORAN_TERAKHIR = "laporan:meja:terakhir"

        fun entriLaporan(proyekId: String, tanggal: String): String = "laporan:entri:$proyekId:$tanggal"

        /** Meja kerja PIC hari WIB [tanggalIso]. */
        fun mejaKerjaPic(tanggalIso: String): String = "meja-kerja:pic:$tanggalIso"

        /** Agenda proyek meja kerja PIC hari WIB [tanggalIso]. */
        fun agendaMejaKerja(proyekId: String, tanggalIso: String): String = "meja-kerja:agenda:$proyekId:$tanggalIso"
    }
}
