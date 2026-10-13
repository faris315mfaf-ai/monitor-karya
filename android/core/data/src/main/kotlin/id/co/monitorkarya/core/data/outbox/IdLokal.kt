// Id sementara entri yang ditambahkan saat luring (B2).
//
// Entri baru belum punya id server sampai pesan TAMBAH_ENTRI-nya terkirim.
// Layar memakai "lokal:<idOutbox>" sebagai id tampil; ubah/hapus/unggah bukti
// atas entri itu diantre dengan id lokal tersebut (kunci FIFO sama), lalu
// pengirim mengganti teks "\"lokal:<n>\"" di payload penerus dengan id server
// begitu TAMBAH sukses (OutboxDao.gantiTeksPayload). Tanda kutip ikut diganti
// supaya "lokal:1" tidak menimpa "lokal:12".
package id.co.monitorkarya.core.data.outbox

object IdLokal {
    const val AWALAN = "lokal:"

    fun dari(idOutbox: Long): String = "$AWALAN$idOutbox"

    fun adalah(id: String?): Boolean = id?.startsWith(AWALAN) == true

    /** id outbox pesan TAMBAH pemilik id lokal; null bila bukan id lokal. */
    fun idOutbox(id: String?): Long? = if (adalah(id)) id!!.removePrefix(AWALAN).toLongOrNull() else null

    /** Teks JSON berkutip yang diganti di payload: "\"lokal:12\"". */
    fun kutip(id: String): String = "\"" + id + "\""
}
