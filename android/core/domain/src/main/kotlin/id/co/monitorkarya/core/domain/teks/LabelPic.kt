// Label "PIC <nama>" bersama semua layar (BUG-14a, N-05, E2E-R2-3 N2).
// Nama akun seed/produksi kerap sudah berawalan "PIC" (mis. "PIC Pembangunan
// Pembangkit Baru"), dan server mengirim placeholder 'Belum ada PIC' untuk
// proyek tanpa PIC (src/app/api/ringkasan/route.ts). Menambah awalan buta
// menghasilkan "PIC PIC …" / "PIC Belum ada PIC".
package id.co.monitorkarya.core.domain.teks

/** Teks bila proyek belum punya PIC. */
const val PIC_KOSONG = "PIC belum ditentukan"

/**
 * "PIC <nama>" tanpa awalan ganda. Kosong/null atau placeholder server
 * ("Belum ada PIC", "-") → [PIC_KOSONG].
 */
fun labelPic(nama: String?): String {
    val n = nama?.trim().orEmpty()
    return when {
        n.isEmpty() || n == "-" -> PIC_KOSONG
        n.equals("Belum ada PIC", ignoreCase = true) || n.equals(PIC_KOSONG, ignoreCase = true) -> PIC_KOSONG
        n.equals("PIC", ignoreCase = true) || n.startsWith("PIC ", ignoreCase = true) -> n
        else -> "PIC $n"
    }
}
