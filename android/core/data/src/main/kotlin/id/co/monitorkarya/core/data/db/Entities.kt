package id.co.monitorkarya.core.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Entitas Room untuk cache luring fase 0. Kolom mengikuti nama kolom nyata
 * di prisma/schema.prisma (Project, DailyProjectReport, Task, Escalation);
 * tanggal disimpan sebagai epochMillis (Long).
 */

@Entity(tableName = "proyek")
data class ProjectEntity(
    @PrimaryKey
    val id: String,
    val code: String,
    val name: String,
    val phase: String,
    val lifecycle: String,
    val entityName: String,
    val picName: String? = null,
    val status: String,
    val progress: Int,
    val targetEndDate: Long? = null,
    val lastReportAt: Long? = null,
    val divisionName: String? = null,
    val tersinkronPada: Long
)

@Entity(
    tableName = "daily_report",
    indices = [Index("proyek_id")]
)
data class DailyReportEntity(
    @PrimaryKey
    val id: String,
    @ColumnInfo(name = "proyek_id")
    val proyekId: String,
    val tanggal: Long,
    val status: String,
    val progressPct: Int,
    val capaian: String,
    val kendala: String? = null,
    val dikirimPada: Long? = null,
    val diteruskanPada: Long? = null,
    val terlambat: Boolean = false,
    val jumlahBukti: Int = 0,
    val tersinkronPada: Long
)

@Entity(
    tableName = "tugas",
    indices = [Index("proyekId")]
)
data class TaskEntity(
    @PrimaryKey
    val id: String,
    val proyekId: String,
    val tanggalKerja: Long,
    val judul: String,
    val status: String,
    val progressPct: Int,
    val cakupan: String,
    val urutan: Int,
    val tersinkronPada: Long
)

@Entity(tableName = "eskalasi")
data class EscalationEntity(
    @PrimaryKey
    val id: String,
    val proyekId: String?,
    val namaEntitas: String,
    val ringkasan: String,
    val dibutuhkan: String,
    val status: String,
    val diajukanPada: Long,
    val umurHari: Int,
    val lewatSla: Boolean
)

/**
 * Satu tulisan tertunda (Rancangan §4). Kolom versi 3 (MigrasiMk.MIGRASI_2_3):
 * - [kunci]: kunci dependensi FIFO ("mingguan:<divisi>:<minggu>",
 *   "laporan:<proyek>:<YYYY-MM-DD>", ...). Pesan berkunci sama dikirim urut id
 *   dan pesan sesudahnya DITAHAN selama pesan lebih awal belum berhasil
 *   (menunggu backoff atau GAGAL). null = pesan mandiri, tidak menahan apa pun.
 * - [label]: kalimat tampil untuk pengguna ("Serahkan capaian minggu 41").
 * - [berikutnyaPada]: epoch millis paling cepat pesan boleh dicoba lagi
 *   (backoff kegagalan sementara); 0 = segera.
 * Kolom versi 5 (MigrasiMk.MIGRASI_4_5, gelombang E):
 * - [kunciIdempotensi]: UUID v4 yang dikirim sebagai header `Idempotency-Key`
 *   pada SETIAP percobaan pesan ini (dibuat sekali saat diantre, tidak pernah
 *   dibuat ulang). Baris lama diisi UUID saat migrasi; null hanya bila baris
 *   ditulis jalur lain — OutboxProsesor mengisinya sebelum kiriman pertama.
 * Kolom versi 6 (MigrasiMk.MIGRASI_5_6, C5-T3):
 * - [pemilikUid]: uid pengguna yang mengantre pesan. Pekerja HANYA mengirim
 *   pesan yang pemiliknya = uid sesi aktif (MkPrefs.uidSesi); baris lama
 *   (null) diadopsi pengguna yang sama saat sesi siap (MesinSinkron.adopsi).
 *
 * Status [STATUS_MENGIRIM] (C5-T2) = klaim baris oleh pemroses tepat sebelum
 * dikirim (`UPDATE … WHERE status='MENUNGGU'`); tampil sebagai "Menunggu kirim".
 */
@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val jenis: String,
    val payloadJson: String,
    val dibuatPada: Long,
    val status: String = STATUS_MENUNGGU,
    val percobaan: Int = 0,
    val pesanGalat: String? = null,
    val kunci: String? = null,
    val label: String? = null,
    @ColumnInfo(defaultValue = "0")
    val berikutnyaPada: Long = 0,
    val kunciIdempotensi: String? = null,
    val pemilikUid: String? = null
) {
    companion object {
        const val STATUS_MENUNGGU = "MENUNGGU"
        const val STATUS_MENGIRIM = "MENGIRIM"
        const val STATUS_BERHASIL = "BERHASIL"
        const val STATUS_GAGAL = "GAGAL"
    }
}

/**
 * Potret JSON satu layar (B2). [kunci] = alamat layar + parameter; [json] =
 * respons server apa adanya (mkJson); [disimpanPada] = epoch millis tarik
 * terakhir yang berhasil — ditampilkan "Luring · data tersimpan HH.MM".
 */
@Entity(tableName = "cache_layar")
data class CacheLayarEntity(
    @PrimaryKey
    val kunci: String,
    val json: String,
    val disimpanPada: Long
)

/**
 * Peta id lokal entri luring → id server (C5-T1, Room v6). Diisi pengirim
 * TAMBAH_ENTRI saat sukses, SEBELUM baris outbox-nya ditandai berhasil, supaya
 * pesan yang dibuat SESUDAH entri terkirim (bukti/ubahan atas "lokal:<n>")
 * tetap bisa diterjemahkan ke id server, bukan gagal permanen.
 */
@Entity(tableName = "peta_id_lokal")
data class PetaIdLokalEntity(
    @PrimaryKey
    val idLokal: String,
    val idServer: String,
    val dibuatPada: Long
)

/**
 * Draf otomatis suntingan Sheet yang ditinggalkan (G1, Room v7; keputusan
 * pemilik 13 Okt 2026: Batal/Selesai/geser/kembali/proses mati dengan
 * perubahan belum tersimpan → draf, dipulihkan saat Sheet dibuka lagi, TANPA
 * dialog). [kunci] = "u:<uid>|<jenis>|<objek>|<tanggal>" (lihat
 * repo/DrafSunting.kt); [uid] disimpan terpisah supaya draf akun lain tidak
 * pernah terbaca dan bisa disapu per akun. [json] hanya isian kerja Sheet —
 * tidak pernah sandi/token. Dikosongkan saat keluar akun (clearAllTables).
 */
@Entity(tableName = "draf_sunting", indices = [Index("uid")])
data class DrafSuntingEntity(
    @PrimaryKey
    val kunci: String,
    val uid: String,
    val json: String,
    val disimpanPada: Long
)
