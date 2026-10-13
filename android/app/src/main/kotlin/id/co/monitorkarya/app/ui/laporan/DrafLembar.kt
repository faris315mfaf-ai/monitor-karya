// Draf otomatis Sheet entri laporan PIC (G1, keputusan pemilik 13 Okt 2026;
// menutup C5 R5 "Selesai/Batal menutup Sheet tanpa peringatan"). Fungsi
// murni — diuji di app/src/test (DrafLembarTest). Penyimpanan lewat
// PencatatDraf → DrafSunting (Room `draf_sunting`, per uid).
package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.data.repo.Draf
import id.co.monitorkarya.core.data.repo.KunciDraf

/**
 * Alamat draf satu Sheet entri: entri tersimpan memakai id-nya, entri baru
 * memakai "baru:<proyek>" — keduanya per tanggal laporan.
 */
internal fun kunciDrafLembar(l: LembarEntri, proyekId: String, tanggal: String): KunciDraf =
    KunciDraf(KunciDraf.LAPORAN_ENTRI, l.idTersimpan ?: KunciDraf.baru(proyekId), tanggal)

/**
 * Isi draf yang harus ditulis untuk [l]: JSON isian bila ada perubahan belum
 * tersimpan pada laporan yang masih bisa ditulis; null = draf dibuang.
 */
internal fun isiDrafLembar(l: LembarEntri, terkunci: Boolean): String? =
    if (!terkunci && l.berubah) isianKeJson(l.isian) else null

/**
 * Terapkan [draf] ke Sheet yang baru dibuka. Draf rusak atau sama persis
 * dengan isian tersimpan diabaikan (Sheet tanpa penanda).
 */
internal fun pulihkanLembar(l: LembarEntri, draf: Draf?): LembarEntri {
    val isian = isianDariJson(draf?.json) ?: return l
    if (isian == l.isian) return l
    return l.copy(isian = isian, drafPulih = draf?.disimpanPada)
}

/** "Buang draf": isian kembali ke versi tersimpan, penanda hilang. */
internal fun buangDrafLembar(l: LembarEntri): LembarEntri =
    l.copy(isian = l.isianAwal ?: IsianEntri(), drafPulih = null, galat = emptyList())
