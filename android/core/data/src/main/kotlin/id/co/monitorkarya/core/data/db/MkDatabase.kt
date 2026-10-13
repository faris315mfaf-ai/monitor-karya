package id.co.monitorkarya.core.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

// Semua kolom primitif (String/Long/Int/Boolean) sehingga @TypeConverters
// tidak diperlukan.
@Database(
    entities = [
        ProjectEntity::class,
        DailyReportEntity::class,
        TaskEntity::class,
        EscalationEntity::class,
        OutboxEntity::class,
        // Fase 2 (T6-C3):
        MingguanLaporanEntity::class,
        MingguanButirEntity::class,
        PenerimaanEntity::class,
        // Fase 3 B2 (v4): potret layar PIC untuk baca luring.
        CacheLayarEntity::class,
        // C5-T1 (v6): peta id lokal entri luring → id server.
        PetaIdLokalEntity::class,
        // G1 (v7): draf otomatis Sheet sunting yang ditinggalkan.
        DrafSuntingEntity::class
    ],
    version = MigrasiMk.VERSI,
    exportSchema = true
)
abstract class MkDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
    abstract fun dailyReportDao(): DailyReportDao
    abstract fun taskDao(): TaskDao
    abstract fun escalationDao(): EscalationDao
    abstract fun outboxDao(): OutboxDao
    abstract fun mingguanLaporanDao(): MingguanLaporanDao
    abstract fun mingguanButirDao(): MingguanButirDao
    abstract fun penerimaanDao(): PenerimaanDao
    abstract fun cacheLayarDao(): CacheLayarDao
    abstract fun petaIdLokalDao(): PetaIdLokalDao
    abstract fun drafSuntingDao(): DrafSuntingDao
}
