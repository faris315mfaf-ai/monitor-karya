// Payload outbox laporan harian PIC (agen B2, 13 Okt 2026) — hanya bentuk
// kawat antrean lokal, BUKAN kontrak server. Dipakai bersama layar
// (app/ui/laporan, app/ui/mejakerja) dan pengirim latar (core/data). Badan
// entri sendiri memakai EntriSimpanRequest apa adanya supaya tidak ada medan
// yang hilang saat diantre (temuan A1: TaskSaveRequest membuang
// achievementToday/followUp/needsEscalation).
@file:OptIn(ExperimentalSerializationApi::class)

package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

/**
 * Hapus satu entri: DELETE /api/tasks?id=&context=. [id] boleh berupa id lokal
 * "lokal:<idOutbox>" milik entri yang ditambahkan saat luring — diganti id
 * server oleh pengirim begitu pesan tambahnya berhasil.
 */
@Serializable
data class PayloadHapusEntri(
    // D1: bawaan ditulis ke antrean apa adanya — pesan lama tetap bermakna
    // walau bawaan di versi aplikasi berikutnya berubah.
    val id: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val context: String = "HARIAN",
)

/**
 * Unggah satu bukti multipart yang menunggu di penyimpanan privat aplikasi.
 *
 * @property taskId entri sasaran (id server atau id lokal "lokal:<n>").
 * @property berkasLokal nama berkas (tanpa jalur) di folder antrean bukti.
 * @property nama nama berkas yang dikirim ke server (ekstensi cocok mime).
 * @property mime jenis berkas (foto sudah dikompres → image/jpeg).
 * @property ukuran ukuran byte, untuk tampilan "Menunggu kirim · 1,2 MB".
 */
@Serializable
data class PayloadUnggahBukti(
    val taskId: String,
    val berkasLokal: String,
    val nama: String,
    val mime: String,
    val ukuran: Long,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val targetType: String = "TASK",
)
