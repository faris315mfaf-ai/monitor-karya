package id.co.monitorkarya.core.data.db

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ProjectDao {

    @Upsert
    suspend fun simpan(semua: List<ProjectEntity>)

    @Upsert
    suspend fun simpan(satu: ProjectEntity)

    @Query("SELECT * FROM proyek ORDER BY name COLLATE NOCASE ASC")
    fun pilihSemua(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM proyek WHERE id = :id")
    fun pilih(id: String): Flow<ProjectEntity?>

    @Query("DELETE FROM proyek WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)
}

@Dao
interface DailyReportDao {

    @Upsert
    suspend fun simpan(semua: List<DailyReportEntity>)

    @Upsert
    suspend fun simpan(satu: DailyReportEntity)

    @Query("SELECT * FROM daily_report WHERE proyek_id = :proyekId ORDER BY tanggal DESC")
    fun pilihPerProyek(proyekId: String): Flow<List<DailyReportEntity>>

    @Query("DELETE FROM daily_report WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)
}

@Dao
interface TaskDao {

    @Upsert
    suspend fun simpan(semua: List<TaskEntity>)

    @Upsert
    suspend fun simpan(satu: TaskEntity)

    @Query("SELECT * FROM tugas WHERE proyekId = :proyekId ORDER BY tanggalKerja DESC, urutan ASC")
    fun pilihPerProyek(proyekId: String): Flow<List<TaskEntity>>

    @Query("DELETE FROM tugas WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)

    @Query("DELETE FROM tugas WHERE id = :id")
    suspend fun hapusSatu(id: String)
}

@Dao
interface EscalationDao {

    @Upsert
    suspend fun simpan(semua: List<EscalationEntity>)

    @Upsert
    suspend fun simpan(satu: EscalationEntity)

    @Query("SELECT * FROM eskalasi WHERE proyekId = :proyekId ORDER BY diajukanPada DESC")
    fun pilihPerProyek(proyekId: String): Flow<List<EscalationEntity>>

    @Query("SELECT * FROM eskalasi ORDER BY diajukanPada DESC")
    fun pilihSemua(): Flow<List<EscalationEntity>>

    // Eskalasi tidak punya kolom tersinkronPada: penyegaran penuh lewat simpan.
}

@Dao
interface OutboxDao {

    @Upsert
    suspend fun simpan(satu: OutboxEntity): Long

    @Query("SELECT * FROM outbox WHERE status = 'MENUNGGU' ORDER BY id ASC")
    fun antrian(): Flow<List<OutboxEntity>>

    @Query("UPDATE outbox SET status = :status, pesanGalat = :pesan, percobaan = :percobaan WHERE id = :id")
    suspend fun tandai(id: Long, status: String, pesan: String?, percobaan: Int)

    @Query("DELETE FROM outbox WHERE status = 'BERHASIL'")
    suspend fun hapusBerhasil()

    // Batas antre maksimum 7 hari (RANCANGAN-ANDROID-NATIVE.md §4).
    @Query("DELETE FROM outbox WHERE dibuatPada < :sebelum")
    suspend fun hapusKedaluwarsa(sebelum: Long)

    @Query("SELECT COUNT(*) FROM outbox WHERE status = 'MENUNGGU'")
    fun jumlahMenunggu(): Flow<Int>
}
