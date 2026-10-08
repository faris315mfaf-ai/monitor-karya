package id.co.monitorkarya.core.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Entitas Room Fase 2 (RANCANGAN-ANDROID-NATIVE.md §5: capaian mingguan divisi
 * dan antrean penerimaan Admin PT). Kolom mengikuti prisma/schema.prisma
 * (WeeklyDivisionReport, WeeklyReportItem) dan respons /api/inbox; tanggal
 * disimpan sebagai epochMillis (Long), sama dengan konvensi Entities.kt F0.
 *
 * Pendaftaran di MkDatabase (versi 2 + accessor DAO) dikerjakan parent saat
 * integrasi — berkas ini hanya definisi entitas.
 */

@Entity(
    tableName = "mingguan_laporan",
    indices = [Index("divisiId"), Index("isoTahun", "isoMinggu")]
)
data class MingguanLaporanEntity(
    @PrimaryKey
    val id: String,
    val divisiId: String,
    val entitasNama: String,
    val isoTahun: Int,
    val isoMinggu: Int,
    val statusHeader: String,
    val diserahkanPada: Long? = null,
    val disetujuiPada: Long? = null,
    val diteruskanPada: Long? = null,
    val butirJumlah: Int = 0,
    val butirSelesai: Int = 0,
    val tersinkronPada: Long
) {
    companion object {
        // Nilai statusHeader WeeklyDivisionReport di prisma/schema.prisma.
        const val DRAFT = "DRAFT"
        const val MENUNGGU_PERSETUJUAN = "MENUNGGU_PERSETUJUAN"
        const val DISETUJUI = "DISETUJUI"
        const val TERKUNCI = "TERKUNCI"
    }
}

@Entity(
    tableName = "mingguan_butir",
    indices = [Index("laporanMingguanId")]
)
data class MingguanButirEntity(
    @PrimaryKey
    val id: String,
    val laporanMingguanId: String,
    val aspek: String,
    val pekerjaan: String,
    val target: String,
    val status: String,
    val progres: Int,
    val tanggalKerja: Long? = null,
    val urutan: Int
) {
    companion object {
        // Nilai status WeeklyReportItem di prisma/schema.prisma.
        const val SELESAI = "SELESAI"
        const val ON_PROGRESS = "ON_PROGRESS"
        const val BELUM_MULAI = "BELUM_MULAI"
        const val TERKENDALA = "TERKENDALA"
        const val NA = "NA"
    }
}

/**
 * Satu baris meja penerimaan Admin PT (GET/POST /api/inbox). Baris harian
 * berakar pada proyek dan baris mingguan pada divisi, jadi id stabil dibuat
 * sintetis: "H:<proyekId>" / "M:<divisiId>" supaya upsert penyegaran
 * mengganti baris yang sama, bukan menumpuk.
 *
 * [laporanId] (id laporan yang dipakai POST teruskan) berada di luar daftar
 * kolom spesifikasi tugas, tetapi wajib: POST /api/inbox meminta id laporan,
 * bukan id proyek/divisi. Baris tanpa laporan (belum diserahkan PIC) memiliki
 * nilai null dan tidak bisa diteruskan.
 */
@Entity(tableName = "penerimaan")
data class PenerimaanEntity(
    @PrimaryKey
    val id: String,
    val jenis: String,
    val laporanId: String? = null,
    val judul: String,
    val entitasNama: String,
    val status: String,
    val diteruskanPada: Long? = null,
    val undoToken: String? = null,
    val tersinkronPada: Long = 0
) {
    companion object {
        const val JENIS_HARIAN = "HARIAN"
        const val JENIS_MINGGUAN = "MINGGUAN"

        // BARU = belum diserahkan; SIAP = siap diteruskan (readyToForward);
        // DITERUSKAN = sudah sampai holding.
        const val STATUS_BARU = "BARU"
        const val STATUS_SIAP = "SIAP"
        const val STATUS_DITERUSKAN = "DITERUSKAN"

        /** Prefiks id sintetis per jenis baris. */
        fun idHarian(proyekId: String): String = "H:$proyekId"

        fun idMingguan(divisiId: String): String = "M:$divisiId"
    }
}
