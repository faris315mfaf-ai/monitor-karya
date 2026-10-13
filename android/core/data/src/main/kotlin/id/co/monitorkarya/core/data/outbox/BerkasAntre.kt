// Penyimpanan berkas bukti yang menunggu unggah (Rancangan §4 butir 3; B2).
//
// Berkas hasil kompres (foto sisi ≤2048 px, JPEG q85 — PenyiapBukti) ditulis ke
// folder PRIVAT aplikasi (filesDir/bukti-antre, tidak terbaca aplikasi lain,
// ikut terhapus saat aplikasi dihapus). Payload outbox hanya membawa NAMA
// berkas (tanpa jalur) — jalur tidak pernah dipercaya dari payload.
// Siklus hidup: tulis → pesan UNGGAH_BUKTI → (sukses | dibuang | GAGAL > 30
// hari | keluar akun) → berkas dihapus oleh [sapuYatim] / [hapus] /
// [hapusSemua].
package id.co.monitorkarya.core.data.outbox

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.UUID
import javax.inject.Inject

class BerkasAntre(private val folder: File) {

    @Inject
    constructor(@ApplicationContext context: Context) : this(File(context.filesDir, FOLDER))

    /** Tulis [isi] sebagai berkas baru; kembalikan namanya (acak, ekstensi dari [namaAsli]). */
    fun simpan(isi: ByteArray, namaAsli: String): String {
        folder.mkdirs()
        val ext = namaAsli.substringAfterLast('.', "").lowercase().filter { it.isLetterOrDigit() }.take(8)
        val nama = UUID.randomUUID().toString() + if (ext.isNotEmpty()) ".$ext" else ""
        val tujuan = File(folder, nama)
        val sementara = File(folder, "$nama.tmp")
        sementara.writeBytes(isi)
        if (!sementara.renameTo(tujuan)) {
            sementara.delete()
            error("Berkas bukti tidak dapat disimpan di perangkat.")
        }
        return nama
    }

    /** Berkas bernama [nama] bila ada dan namanya sah (tanpa jalur); null bila hilang. */
    fun berkas(nama: String): File? {
        if (!namaSah(nama)) return null
        return File(folder, nama).takeIf { it.isFile }
    }

    fun hapus(nama: String) {
        if (namaSah(nama)) File(folder, nama).delete()
    }

    /**
     * Hapus berkas yang tidak dirujuk pesan aktif mana pun ([dipakai]) dan
     * lebih tua dari [masaTenggangMs] — tenggang melindungi berkas yang baru
     * ditulis layar tetapi pesannya belum masuk tabel. @return jumlah dihapus.
     */
    fun sapuYatim(dipakai: Set<String>, sekarang: Long = System.currentTimeMillis(), masaTenggangMs: Long = MASA_TENGGANG_MS): Int {
        val semua = folder.listFiles() ?: return 0
        var n = 0
        for (f in semua) {
            if (f.name in dipakai || f.lastModified() > sekarang - masaTenggangMs) continue
            if (f.delete()) n++
        }
        return n
    }

    /** Keluar akun / ganti pengguna: buang seluruh antrean berkas. */
    fun hapusSemua() {
        folder.deleteRecursively()
    }

    companion object {
        const val FOLDER = "bukti-antre"

        /** Berkas tanpa pesan baru disapu setelah 10 menit. */
        const val MASA_TENGGANG_MS: Long = 10L * 60 * 1000

        /** Nama berkas saja: tanpa pemisah jalur, bukan "." / "..". */
        fun namaSah(nama: String): Boolean =
            nama.isNotBlank() && '/' !in nama && '\\' !in nama && nama != "." && nama != ".." && !nama.startsWith(".")
    }
}
