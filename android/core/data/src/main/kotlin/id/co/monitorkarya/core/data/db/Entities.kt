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

@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val jenis: String,
    val payloadJson: String,
    val dibuatPada: Long,
    val status: String = STATUS_MENUNGGU,
    val percobaan: Int = 0,
    val pesanGalat: String? = null
) {
    companion object {
        const val STATUS_MENUNGGU = "MENUNGGU"
        const val STATUS_BERHASIL = "BERHASIL"
        const val STATUS_GAGAL = "GAGAL"
    }
}
