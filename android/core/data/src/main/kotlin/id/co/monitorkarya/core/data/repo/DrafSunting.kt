// Draf otomatis Sheet sunting yang ditinggalkan (G1, 13 Okt 2026).
//
// Keputusan pemilik: suntingan yang ditinggalkan (Batal/Selesai/geser/
// kembali/proses mati) TIDAK memunculkan dialog — isiannya disimpan sebagai
// draf lokal dan dipulihkan saat Sheet yang sama dibuka lagi. Aturan
// "konfirmasi hanya untuk hapus" tetap berlaku.
//
// Penyimpanan: tabel Room `draf_sunting` (v7). Setiap baris dikunci
// (uid, jenis, objek, tanggal):
// - uid = MkPrefs.uidSesi aktif. Tanpa sesi aktif tidak ada yang disimpan/
//   dibaca; draf akun lain tidak pernah terbaca walau pembersihan gagal.
// - jenis = Sheet ("laporan-entri", "mingguan-butir", "ringkasan-direktur").
// - objek = id yang disunting, atau "baru:<induk>" untuk entri/butir baru.
// - tanggal = hari laporan / kunci minggu, supaya draf kemarin tidak tampil
//   sebagai isian hari ini.
// Yang disimpan hanya isian kerja (JSON dari pemanggil) — tidak pernah sandi
// atau token. Draf lebih tua dari 14 hari dibuang; seluruh tabel ikut
// dikosongkan saat keluar akun (clearAllTables di MesinSinkron).
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.DrafSuntingDao
import id.co.monitorkarya.core.data.db.DrafSuntingEntity
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.prefs.MkPrefs
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

/** Alamat satu draf (tanpa uid — uid diambil dari sesi aktif). */
data class KunciDraf(val jenis: String, val objek: String, val tanggal: String) {
    companion object {
        const val LAPORAN_ENTRI = "laporan-entri"
        const val MINGGUAN_BUTIR = "mingguan-butir"
        const val RINGKASAN_DIREKTUR = "ringkasan-direktur"

        /** Objek untuk entri/butir yang belum tersimpan di bawah [induk] (proyek/divisi). */
        fun baru(induk: String): String = "baru:$induk"
    }
}

/** Draf tersimpan: isian (JSON pemanggil) + kapan disimpan (epoch millis). */
data class Draf(val json: String, val disimpanPada: Long)

/** Kontrak penyimpanan draf yang dipakai ViewModel (dipalsukan di tes JVM app). */
interface PenyimpanDraf {
    suspend fun simpan(kunci: KunciDraf, json: String)

    suspend fun ambil(kunci: KunciDraf): Draf?

    suspend fun buang(kunci: KunciDraf)
}

@Singleton
class DrafSunting(
    private val dao: DrafSuntingDao,
    private val uidAktif: suspend () -> String?,
    private val jam: () -> Long = System::currentTimeMillis,
) : PenyimpanDraf {

    @Inject
    constructor(db: MkDatabase, prefs: MkPrefs) : this(
        dao = db.drafSuntingDao(),
        uidAktif = { prefs.uidSesi.first() },
    )

    /** Simpan/ganti draf [kunci]; tanpa sesi aktif tidak menyimpan apa pun. */
    override suspend fun simpan(kunci: KunciDraf, json: String) {
        aman { simpanSesi(kunci, json) }
    }

    private suspend fun simpanSesi(kunci: KunciDraf, json: String) {
        val uid = uid() ?: return
        val sekarang = jam()
        dao.simpan(DrafSuntingEntity(kunci = kunciBaris(uid, kunci), uid = uid, json = json, disimpanPada = sekarang))
        dao.hapusLama(sekarang - MASA_SIMPAN_MS)
    }

    /** Draf [kunci] milik sesi aktif; null bila tidak ada, kedaluwarsa, atau milik akun lain. */
    override suspend fun ambil(kunci: KunciDraf): Draf? = aman { ambilSesi(kunci) }

    private suspend fun ambilSesi(kunci: KunciDraf): Draf? {
        val uid = uid() ?: return null
        val baris = dao.ambil(kunciBaris(uid, kunci)) ?: return null
        return when {
            baris.uid != uid -> null
            baris.disimpanPada < jam() - MASA_SIMPAN_MS -> {
                dao.hapus(baris.kunci)
                null
            }
            else -> Draf(baris.json, baris.disimpanPada)
        }
    }

    /** Buang draf [kunci] (simpan sukses, "Buang draf", atau isian kembali sama). */
    override suspend fun buang(kunci: KunciDraf) {
        aman { uid()?.let { dao.hapus(kunciBaris(it, kunci)) } }
    }

    /** Buang seluruh draf akun [uid] (keluar akun) — atau akun aktif bila null. */
    suspend fun buangSemua(uid: String? = null) {
        aman { (uid ?: uid())?.let { dao.hapusPerUid(it) } }
    }

    /** Sapu draf sisa akun lain (mis. sesi [uid] baru siap setelah pembersihan gagal). */
    suspend fun sapuSelain(uid: String) {
        aman { dao.hapusSelainUid(uid) }
    }

    private suspend fun uid(): String? = uidAktif()?.takeIf { it.isNotBlank() }

    /** Draf hanya pelengkap: kegagalan baca/tulis tidak boleh menggagalkan Sheet. */
    private suspend fun <T> aman(blok: suspend () -> T): T? = try {
        blok()
    } catch (e: CancellationException) {
        throw e
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
        null
    }

    companion object {
        /** Draf lebih tua dari 14 hari dibuang. */
        const val MASA_SIMPAN_MS: Long = 14L * 24 * 60 * 60 * 1000

        /** Kunci baris Room: uid pemilik + alamat draf. */
        fun kunciBaris(uid: String, k: KunciDraf): String = "u:$uid|${k.jenis}|${k.objek}|${k.tanggal}"
    }
}
